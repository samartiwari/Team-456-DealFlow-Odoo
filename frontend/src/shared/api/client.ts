import { ApiError } from './error'
import { clearSession, getToken } from './session'
import type { ApiErrorBody } from './types'
import { mockFetch, isMocked } from './mock/server'

export { ApiError }

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

/** Signup and login are the only two routes reachable without a token. */
const isPublic = (path: string) => path.startsWith('/auth/login') || path.startsWith('/auth/signup')

/**
 * Any 401 means the session is gone, whichever call produced it — so it is
 * handled here rather than in each screen. Twelve screens handling it
 * separately is twelve subtly different behaviours, one of which shows a red
 * error card where a login form belongs.
 *
 * 403 is deliberately NOT this. It means the signed-in user may not do that
 * one thing, and logging them out for it would be wrong.
 */
function endSession(message: string): never {
  clearSession()
  if (window.location.pathname !== '/login') window.location.assign('/login')
  throw new ApiError(401, message)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken()

  // Refuse before the call, exactly as the server would: no token, no handler.
  if (!token && !isPublic(path)) {
    endSession('Your session has ended. Please sign in again.')
  }

  // Mocks are resolved per endpoint, so the real API can be adopted one route at a time.
  if (USE_MOCKS && isMocked(method, path)) {
    try {
      return await mockFetch<T>(method, path, body)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && !isPublic(path)) {
        endSession(e.message)
      }
      throw e
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    // Identity is the token now. The portal never sends one of these, and this
    // bundle never sends a portal token.
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 401 && !isPublic(path)) {
    endSession('Your session has ended. Please sign in again.')
  }

  if (!response.ok) {
    // Every non-2xx carries { status, message, field } — surface the message,
    // never "Request failed (409)". The 409s are business guards, not bugs.
    let payload: Partial<ApiErrorBody> = {}
    try {
      payload = (await response.json()) as ApiErrorBody
    } catch {
      /* body was empty or not JSON */
    }
    throw new ApiError(
      response.status,
      payload.message ?? `Request failed (${response.status})`,
      payload.field ?? null,
    )
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

/**
 * Fetches a file and hands it to the browser to save.
 *
 * A download cannot be a plain `<a href>`. The bearer token lives in
 * sessionStorage and is attached by this module, and a navigation started by an
 * anchor carries no headers at all — so every export answered 401 and the
 * browser showed a page of JSON where a file should have been. That is the same
 * shape of mistake as testing an endpoint with curl and a header: the request
 * the app actually makes is not the one that was verified.
 *
 * The server names the file in Content-Disposition; the fallback is only for a
 * response that omits it.
 */
export async function download(path: string, fallbackName: string): Promise<void> {
  const token = getToken()
  if (!token) endSession('Your session has ended. Please sign in again.')

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    if (response.status === 401) endSession('Your session has ended. Please sign in again.')
    let message = 'That file could not be produced.'
    let field: string | null = null
    try {
      const body = (await response.json()) as ApiErrorBody
      message = body.message ?? message
      field = body.field ?? null
    } catch {
      /* not every failure answers in JSON */
    }
    throw new ApiError(response.status, message, field ?? undefined)
  }

  const named = /filename="?([^";]+)"?/.exec(
    response.headers.get('Content-Disposition') ?? '',
  )?.[1]

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = named ?? fallbackName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Freed on the next tick: revoking synchronously can cancel the save in some
  // browsers before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

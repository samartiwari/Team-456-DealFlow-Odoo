import { getActor } from './actor'
import type { ApiErrorBody } from './types'
import { mockFetch, isMocked } from './mock/server'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

export class ApiError extends Error {
  status: number
  field: string | null

  constructor(status: number, message: string, field: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
  }
}

/** Appends the acting user to every call. Mutations require it; reads ignore it. */
function withActor(path: string): string {
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}userId=${getActor().id}`
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = withActor(path)

  // Mocks are resolved per endpoint, so the real API can be adopted one route at a time.
  if (USE_MOCKS && isMocked(method, path)) {
    return mockFetch<T>(method, path, body)
  }

  const response = await fetch(`${BASE_URL}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

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
  del: <T>(path: string) => request<T>('DELETE', path),
}

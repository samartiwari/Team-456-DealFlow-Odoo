import { PortalError } from './types'
import type {
  PortalCounterBody, PortalMessageBody, PortalQuotation, VerifyResult,
} from './types'

/**
 * The portal's own client.
 *
 * Deliberately not shared/api/client.ts: that one carries the workspace's
 * bearer token, which has no business on a customer-facing request. Identity
 * here is the X-Portal-Token header and nothing else — no bearer token leaves
 * this bundle, and no portal token leaves the workspace.
 */

const BASE = '/api/portal'
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'
const STORAGE_KEY = 'df360.portalToken'

let portalToken: string | null = read()

function read(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** sessionStorage, never the URL: a magic link is single use and must not be replayed. */
export function setPortalToken(token: string | null): void {
  portalToken = token
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* private browsing — the session just does not survive a reload */
  }
}

export function hasSession(): boolean {
  return portalToken !== null
}

/**
 * The mock is loaded on demand rather than imported.
 *
 * A static import would pull the whole workspace mock — cost, margin, risk and
 * all — into the portal's own bundle. Behind a dynamic import it becomes a
 * separate chunk that a production build with VITE_USE_MOCKS=false never
 * fetches, and that the portal entry chunk never contains.
 */
async function viaMock<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { mockFetch, setMockPortalToken } = await import('@/shared/api/mock/server')
  setMockPortalToken(portalToken)
  return mockFetch<T>(method, `/portal${path}`, body)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (USE_MOCKS) return viaMock<T>(method, path, body)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (portalToken) headers['X-Portal-Token'] = portalToken

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    let message = 'Something went wrong. Please try again.'
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload.message) message = payload.message
    } catch {
      /* body was empty or not JSON */
    }
    throw new PortalError(response.status, message)
  }

  return (await response.json()) as T
}

/* The magic link is exchanged once, before any session exists. */
export const verify = (token: string) =>
  request<VerifyResult>('POST', '/auth/verify', { token })

export const getQuotation = () => request<PortalQuotation>('GET', '/quotation')

export const postMessage = (body: PortalMessageBody) =>
  request<PortalQuotation>('POST', '/quotation/messages', body)

export const postCounter = (body: PortalCounterBody) =>
  request<PortalQuotation>('POST', '/quotation/counter', body)

export const confirmQuotation = () =>
  request<PortalQuotation>('POST', '/quotation/confirm')

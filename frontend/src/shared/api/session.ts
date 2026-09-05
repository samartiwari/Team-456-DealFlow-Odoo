import { useSyncExternalStore } from 'react'
import { ApiError } from './error'
import type { AuthSession, AuthUser } from './types'

/**
 * The signed-in user.
 *
 * This replaces the actor switcher, which existed only because there was no
 * login. `useActor()` keeps its name and shape, so every screen already reading
 * it works unchanged — the source moved, not the contract.
 *
 * The token lives in sessionStorage rather than localStorage: it is a bearer
 * credential with no refresh and a twelve-hour life, and clearing when the tab
 * closes is what someone expects after shutting the window.
 */

const TOKEN_KEY = 'df360.token'

let token: string | null = readToken()
let current: AuthUser | null = null
const listeners = new Set<() => void>()

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function announce(): void {
  listeners.forEach((l) => l())
}

export function getToken(): string | null {
  return token
}

export function startSession(session: AuthSession): void {
  token = session.token
  current = session.user
  try {
    sessionStorage.setItem(TOKEN_KEY, session.token)
  } catch {
    /* private browsing — the session just does not survive a reload */
  }
  announce()
}

/** Called on boot once `me` confirms a stored token is still good. */
export function adoptUser(user: AuthUser): void {
  current = user
  announce()
}

export function clearSession(): void {
  token = null
  current = null
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* nothing to clear */
  }
  announce()
}

export function currentUser(): AuthUser | null {
  return current
}

/**
 * The acting user, for code that cannot run without one.
 *
 * Throws rather than returning a placeholder: every permission check in the app
 * asks for a specific role, so any stand-in would silently grant something. The
 * client refuses unauthenticated calls before they reach a handler, so this is
 * unreachable in practice — it is a guard against a future call path, not a
 * case anyone should see.
 */
export function getActor(): AuthUser {
  if (!current) throw new ApiError(401, 'Your session has ended. Please sign in again.')
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = () => current

/** React binding. Null while signed out — the guard renders the login screen. */
export function useSession(): AuthUser | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Kept for the screens that already read it; the source is now the session. */
export function useActor(): AuthUser {
  const user = useSession()
  if (!user) throw new Error('useActor called outside an authenticated screen')
  return user
}

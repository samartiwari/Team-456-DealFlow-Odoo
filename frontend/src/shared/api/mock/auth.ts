import { ApiError } from '../error'
import type { AuthSession, AuthUser, LoginBody, SignupBody } from '../types'

/**
 * The mock's stand-in for the auth realm.
 *
 * Enough to exercise the login screen, the guard and the role redirect without
 * a backend: the six seeded accounts, one shared password, and a token that is
 * any non-empty string.
 */

const PASSWORD = 'demo1234'

/** Mirrors the seeded app_user rows. */
export const ACCOUNTS: AuthUser[] = [
  { id: 1, name: 'Rep One', email: 'rep@dealflow.test', role: 'REP' },
  { id: 2, name: 'Meera Manager', email: 'manager@dealflow.test', role: 'MANAGER' },
  { id: 3, name: 'Farid Finance', email: 'finance@dealflow.test', role: 'FINANCE' },
  { id: 4, name: 'Priya Rao', email: 'priya@dealflow.test', role: 'REP' },
  { id: 5, name: 'Arjun Mehta', email: 'arjun@dealflow.test', role: 'REP' },
  { id: 6, name: 'Nina Desai', email: 'nina@dealflow.test', role: 'REP' },
  { id: 7, name: 'Devi Admin', email: 'admin@dealflow.test', role: 'ADMIN' },
]

const TWELVE_HOURS = 12 * 60 * 60 * 1000

/**
 * Tokens the mock has issued, so `me` can answer and a bad one can 401.
 *
 * Persisted, because it has to outlive the module that filled it. `me` runs on
 * every boot -- it is the only way to find out whether a stored token is still
 * good before rendering -- and a reload builds a fresh module graph. Held only
 * in memory, this map came back empty, `me` refused a perfectly valid token,
 * and the guard signed the user out: pressing F5 logged you out, and so did
 * pasting a deep link.
 *
 * Its own key rather than the store's snapshot, on purpose. That snapshot is
 * business state, and reloading the data should not end the session.
 */
const AUTH_KEY = 'df360.mock.auth.v1'

interface AuthSnapshot {
  /** token -> user id, as pairs; a Map does not survive JSON. */
  issued: Array<[string, number]>
  /**
   * Only the accounts signup created. The seeded ones come from ACCOUNTS, so a
   * build that seeds a new role is not masked by an older snapshot -- which is
   * exactly what a wholesale restore would have done to Admin and Operations.
   */
  signedUp: AuthUser[]
}

const authStore: Pick<Storage, 'getItem' | 'setItem'> | null =
  typeof localStorage === 'undefined' ? null : localStorage

const issued = new Map<string, number>()
const SEEDED_IDS = new Set(ACCOUNTS.map((a) => a.id))

function saveAuth(): void {
  try {
    authStore?.setItem(AUTH_KEY, JSON.stringify({
      issued: [...issued],
      signedUp: ACCOUNTS.filter((a) => !SEEDED_IDS.has(a.id)),
    } satisfies AuthSnapshot))
  } catch {
    /* private browsing or quota — the mock just falls back to in-memory */
  }
}

/* Whatever a previous load left behind. */
try {
  const raw = authStore?.getItem(AUTH_KEY)
  if (raw) {
    const snap = JSON.parse(raw) as AuthSnapshot
    for (const [token, id] of snap.issued ?? []) issued.set(token, id)
    for (const user of snap.signedUp ?? []) {
      if (!ACCOUNTS.some((a) => a.id === user.id)) ACCOUNTS.push(user)
    }
  }
} catch {
  /* an unreadable snapshot is no snapshot */
}

function sessionFor(user: AuthUser): AuthSession {
  const token = `mock.${user.id}.${Math.random().toString(36).slice(2)}`
  issued.set(token, user.id)
  saveAuth()
  return {
    token,
    expiresAt: new Date(Date.now() + TWELVE_HOURS).toISOString(),
    user,
  }
}

/**
 * A wrong email and a wrong password answer identically. Telling them apart
 * tells a stranger which addresses have accounts, which is how a login form
 * leaks a user list.
 */
export function login(body: LoginBody): AuthSession {
  const user = ACCOUNTS.find((a) => a.email.toLowerCase() === body.email?.trim().toLowerCase())
  if (!user || body.password !== PASSWORD) {
    throw new ApiError(401, 'Those credentials are not valid.')
  }
  return sessionFor(user)
}

/** New accounts are reps. A form that lets anyone sign up as Finance is not access control. */
export function signup(body: SignupBody): AuthSession {
  const email = body.email?.trim().toLowerCase() ?? ''
  if (!body.name?.trim()) throw new ApiError(422, 'A name is required.', 'name')
  if (!email.includes('@')) throw new ApiError(422, 'That does not look like an email address.', 'email')
  if ((body.password ?? '').length < 8) {
    throw new ApiError(422, 'A password must be at least 8 characters.', 'password')
  }
  if (ACCOUNTS.some((a) => a.email.toLowerCase() === email)) {
    throw new ApiError(409, 'An account already exists for that email.', 'email')
  }

  const user: AuthUser = {
    id: Math.max(...ACCOUNTS.map((a) => a.id)) + 1,
    name: body.name.trim(),
    email,
    role: 'REP',
  }
  ACCOUNTS.push(user)
  // sessionFor persists both, so the new account and its token land together.
  return sessionFor(user)
}

/**
 * Whoever the token belongs to.
 *
 * Called on boot, because an expired token looks exactly like a good one until
 * it is used — this is the only way to find out before rendering the app.
 */
export function me(token: string | null): AuthUser {
  const id = token ? issued.get(token) : undefined
  const user = id === undefined ? undefined : ACCOUNTS.find((a) => a.id === id)
  if (!user) throw new ApiError(401, 'Your session has ended. Please sign in again.')
  return user
}

export function reps(): AuthUser[] {
  return ACCOUNTS.filter((a) => a.role === 'REP')
}

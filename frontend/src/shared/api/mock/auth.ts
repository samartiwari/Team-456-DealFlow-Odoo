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
]

const TWELVE_HOURS = 12 * 60 * 60 * 1000

/** Tokens the mock has issued, so `me` can answer and a bad one can 401. */
const issued = new Map<string, number>()

function sessionFor(user: AuthUser): AuthSession {
  const token = `mock.${user.id}.${Math.random().toString(36).slice(2)}`
  issued.set(token, user.id)
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

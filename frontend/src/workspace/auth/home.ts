import type { UserRole } from '@/shared/api/types'

/**
 * Where signing in lands you.
 *
 * Everybody lands on the dashboard, which is mockup screen 2 and the thing the
 * spec calls Home. It reads the same four sources for every role and simply
 * omits a card whose queue that role may not open, so it is the one screen that
 * is correct for all five without being empty for any of them.
 *
 * This used to send each role to its own list — approvals for a manager,
 * invoices for finance. That was the earlier reading of "each role lands on its
 * own screen", and the dashboard makes it unnecessary: what a role sees is
 * still different, but the difference is now inside one screen rather than
 * expressed by sending people to different URLs. WHERE_WORK_STARTS keeps the
 * old mapping, because the dashboard's cards link into exactly those lists.
 */
export const HOME = '/app/dashboard'

/** Kept per role: the dashboard's cards point at each role's own queue. */
export const WHERE_WORK_STARTS: Record<UserRole, string> = {
  REP: '/app/quotations',
  MANAGER: '/app/approvals',
  FINANCE: '/app/invoices',
  ADMIN: '/app/configuration',
}

/**
 * @deprecated the landing screen no longer varies by role; use {@link HOME}.
 *   Kept as a lookup so anything still asking "where does this role work?" gets
 *   an answer rather than a compile error.
 */
export const HOME_FOR = WHERE_WORK_STARTS

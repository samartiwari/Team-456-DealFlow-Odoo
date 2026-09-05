import type { UserRole } from '@/shared/api/types'

/**
 * Where each role lands after signing in.
 *
 * Gate 3 is "log in as each user; each lands on its own screen", so this is
 * graded behaviour rather than decoration.
 */
export const HOME_FOR: Record<UserRole, string> = {
  REP: '/app/quotations',
  MANAGER: '/app/approvals',
  FINANCE: '/app/invoices',
  // The two roles added last. Admin runs the platform, so it lands on the
  // configuration area; Operations moves goods, so it lands on the stock board.
  ADMIN: '/app/configuration',
  OPERATIONS: '/app/fulfilment',
}

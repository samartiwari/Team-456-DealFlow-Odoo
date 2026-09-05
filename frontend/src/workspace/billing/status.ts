import type { InvoiceStatus, PeriodStatus, SubscriptionStatus } from '@/shared/api/types'
import type { Tone } from '@/shared/ui/Badge'

/**
 * Invoice status is never sent by the client — the server derives it from the
 * payments every time. These are only how it is displayed.
 */
export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  OPEN: { label: 'Open', tone: 'info' },
  PARTIALLY_PAID: { label: 'Partially paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  CREDITED: { label: 'Credited', tone: 'neutral' },
  VOID: { label: 'Void', tone: 'neutral' },
}

export const PERIOD_STATUS: Record<PeriodStatus, { label: string; tone: Tone }> = {
  SCHEDULED: { label: 'Scheduled', tone: 'neutral' },
  BILLED: { label: 'Billed', tone: 'success' },
}

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
}

/** A period covering today, so the schedule shows where the clock is. */
export function isCurrent(periodStart: string, periodEnd: string, today: string): boolean {
  return today >= periodStart && today <= periodEnd
}

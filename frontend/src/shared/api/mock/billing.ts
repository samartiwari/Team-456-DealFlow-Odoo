import type { BillingPeriod } from '../types'

/**
 * Proration and the billing calendar. Kept out of store.ts because this is
 * arithmetic, not state, and it is the part of the phase that produces
 * plausible-looking wrong money if it is rushed.
 */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Days in the calendar month containing this date. 28, 29, 30 or 31. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/**
 * Twelve calendar-month periods, starting with the month that contains
 * `startDate`.
 *
 * Calendar months, not 30-day blocks: February bills less than January, and
 * that difference is the whole reason `days` sits on the period row rather
 * than being assumed by the client.
 */
export function schedule(startDate: string, periodAmount: number, firstId: number): BillingPeriod[] {
  const start = new Date(`${startDate}T00:00:00Z`)
  const out: BillingPeriod[] = []

  for (let i = 0; i < 12; i++) {
    const year = start.getUTCFullYear()
    const month = start.getUTCMonth() + i
    const first = new Date(Date.UTC(year, month, 1))
    const days = daysInMonth(first.getUTCFullYear(), first.getUTCMonth())
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), days))

    out.push({
      id: firstId + i,
      periodStart: iso(first),
      periodEnd: iso(last),
      days,
      amount: round2(periodAmount),
      status: 'SCHEDULED',
      invoiceId: null,
    })
  }
  return out
}

/** The period a date falls inside, or null when it is outside the schedule. */
export function periodContaining(periods: BillingPeriod[], date: string): BillingPeriod | null {
  return periods.find((p) => date >= p.periodStart && date <= p.periodEnd) ?? null
}

/**
 * Days from periodStart to effectiveDate, INCLUSIVE.
 *
 * "Day 10 of a 30-day period" means 10 elapsed and 20 remaining — the day the
 * change happens counts as used. That +1 is the off-by-one everyone gets wrong.
 */
export function elapsedDays(periodStart: string, effectiveDate: string): number {
  const a = Date.parse(`${periodStart}T00:00:00Z`)
  const b = Date.parse(`${effectiveDate}T00:00:00Z`)
  return Math.floor((b - a) / 86_400_000) + 1
}

export interface Proration {
  deltaAmount: number
  remainingDays: number
  days: number
  dailyRate: number
}

/**
 * What a quantity change costs or credits for the rest of the current period.
 *
 *   dailyRate = unitPrice / daysInPeriod        PER UNIT, not per line
 *   delta     = dailyRate x qtyDelta x remainingDays
 *
 * `unitPrice` is per unit and the spec's `periodAmount / daysInPeriod` reads as
 * the whole line — take that reading and every result is wrong by a factor of
 * the quantity, on some scenarios only, which is the worst way to be wrong.
 * Check it against the spec's own figures: qty 3 to 1 on day 10 of a 30-day
 * month at 3,000 a unit credits 4,000, not 12,000.
 *
 * The whole expression is evaluated before rounding. Rounding dailyRate first
 * drifts by rupees on a 31-day month.
 */
export function prorate(
  unitPrice: number,
  qtyDelta: number,
  period: BillingPeriod,
  effectiveDate: string,
): Proration {
  const elapsed = elapsedDays(period.periodStart, effectiveDate)
  const remainingDays = Math.max(0, period.days - elapsed)
  return {
    deltaAmount: round2((unitPrice * qtyDelta * remainingDays) / period.days),
    remainingDays,
    days: period.days,
    dailyRate: unitPrice / period.days,
  }
}

/** Written to be read by a person, and rendered verbatim by the screen. */
export function explain(p: Proration, qtyDelta: number, currency = 'INR'): string {
  if (p.deltaAmount === 0) {
    return qtyDelta === 0
      ? 'No change — the quantity is already what you asked for.'
      : 'No days remain in this period, so there is nothing to prorate.'
  }
  const units = Math.abs(qtyDelta)
  const rate = p.dailyRate.toFixed(2)
  const direction = p.deltaAmount > 0 ? 'charged' : 'credited'
  return `${p.remainingDays} of ${p.days} days remaining, ${units} unit${units === 1 ? '' : 's'} at ${currency} ${rate}/day — ${direction} ${Math.abs(p.deltaAmount).toFixed(2)}.`
}

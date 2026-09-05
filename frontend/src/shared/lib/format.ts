/** Currency comes from the quotation, never hardcoded. */
export const money = (value: number | null | undefined, currency = 'INR'): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value ?? 0)

/** Compact form for dense table cells — no currency symbol repeated per row. */
export const amount = (value: number | null | undefined): string =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value ?? 0)

export const percent = (value: number | null | undefined, digits = 2): string =>
  `${Number(value ?? 0).toFixed(digits)}%`

export const points = (value: number | null | undefined, digits = 0): string =>
  `${Number(value ?? 0).toFixed(digits)} pt`

export const dateTime = (iso: string | null | undefined): string =>
  iso
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
    : '—'

/** How long a quotation has been waiting. Age matters more than a timestamp in a queue. */
export const relativeTime = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

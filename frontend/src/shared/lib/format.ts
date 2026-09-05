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

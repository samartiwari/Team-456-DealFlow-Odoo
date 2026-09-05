export const money = (value: number | null | undefined, currency = 'INR'): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value ?? 0)

export const percent = (value: number | null | undefined, digits = 1): string =>
  `${Number(value ?? 0).toFixed(digits)}%`

export const points = (value: number | null | undefined, digits = 2): string =>
  `${Number(value ?? 0).toFixed(digits)} pt`

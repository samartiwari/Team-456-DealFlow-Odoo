/**
 * Rules for typing a number into a text field.
 *
 * The field has to tolerate the half-finished states a person passes through —
 * an empty box after backspacing, a lone "." mid-number, "1" on the way to "12".
 * Only a value that is actually a number in range is committed to the server;
 * everything else is left alone so the caret is never yanked around.
 */

/** Strip anything that is not a digit or a decimal point, and allow one point only. */
export function sanitisePercent(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const [head, ...rest] = cleaned.split('.')
  const value = rest.length > 0 ? `${head}.${rest.join('')}` : head
  // Two decimal places is the column's precision; more cannot be represented.
  const [whole, frac] = value.split('.')
  return frac === undefined ? whole : `${whole}.${frac.slice(0, 2)}`
}

/** True when the draft is a complete number the server can accept. */
export function isCommittablePercent(draft: string, parsed: number): boolean {
  if (draft === '' || draft.endsWith('.')) return false
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
}

/* ------------------------------------------------------------ integers */

/** Digits only. Quantities have no decimal part. */
export function sanitiseInteger(raw: string): string {
  return raw.replace(/[^0-9]/g, '')
}

/**
 * True when the draft is a whole number the server can accept.
 *
 * An empty box is deliberately not committable: clearing the field on the way
 * to typing a new number must not be read as "zero", or the value snaps back
 * and the caret jumps before the next keystroke lands.
 */
export function isCommittableInteger(draft: string, parsed: number, min: number, max: number): boolean {
  if (draft === '') return false
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
}

import { useState } from 'react'
import { isCommittableInteger, sanitiseInteger } from '@/shared/lib/numericInput'
import { cn } from './cn'

/**
 * Quantity control for a cart line.
 *
 * The box holds a local draft string rather than the numeric prop directly, for
 * two reasons. Clearing it on the way to a new number must not be read as zero
 * and snap the old value back. And the text input is never `disabled` while a
 * save is in flight — a disabled element loses focus, so the caret would vanish
 * mid-number on every keystroke that triggered a request. Read-only blocks
 * edits when the quotation is frozen and keeps focus.
 *
 * The +/- buttons act on the draft, not the prop, so three quick clicks step
 * 6 → 7 → 8 → 9 rather than all computing from a stale 6.
 */
export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  locked = false,
  busy = false,
  className,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  /** Quotation is frozen — read-only, no stepping. */
  locked?: boolean
  /** A write is in flight — buttons wait, the text box does not. */
  busy?: boolean
  className?: string
}) {
  const [draft, setDraft] = useState(String(value))
  const [seen, setSeen] = useState(value)

  // Adjust during render: the server is the authority, so when it reports a
  // different quantity the draft follows it.
  if (seen !== value) {
    setSeen(value)
    setDraft(String(value))
  }

  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const current = draft === '' ? value : Number(draft)

  const step = (delta: number) => {
    const next = clamp(current + delta)
    setDraft(String(next))
    onChange(next)
  }

  return (
    <div
      className={cn(
        'inline-flex h-9 items-stretch overflow-hidden rounded-control border border-default bg-card',
        locked && 'opacity-60',
        className,
      )}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={locked || busy || current <= min}
        onClick={() => step(-1)}
        className="w-7 text-ink-2 hover:bg-hover disabled:pointer-events-none disabled:text-disabled"
      >
        &minus;
      </button>

      <input
        type="text"
        inputMode="numeric"
        aria-label="Quantity"
        value={draft}
        readOnly={locked}
        onChange={(e) => {
          const next = sanitiseInteger(e.target.value)
          setDraft(next)
          const n = Number(next)
          if (isCommittableInteger(next, n, min, max)) onChange(n)
        }}
        onBlur={() => setDraft(String(value))}
        className="w-9 border-x border-default bg-card text-center text-[13px] text-ink tnum focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/30"
      />

      <button
        type="button"
        aria-label="Increase quantity"
        disabled={locked || busy || current >= max}
        onClick={() => step(1)}
        className="w-7 text-ink-2 hover:bg-hover disabled:pointer-events-none disabled:text-disabled"
      >
        +
      </button>
    </div>
  )
}

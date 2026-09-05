import { useEffect, useRef, useState } from 'react'
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
 *
 * At a limit the buttons stay *enabled* and say why. A disabled button cannot
 * receive the click, so it can only fail silently — which reads as the control
 * being broken rather than the value being at its bound.
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
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Adjust during render: the server is the authority, so when it reports a
  // different quantity the draft follows it.
  if (seen !== value) {
    setSeen(value)
    setDraft(String(value))
  }

  /** Transient: a hint that lingers would keep every row a line taller. */
  const say = (message: string) => {
    setNotice(message)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setNotice(null), 2500)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const current = draft === '' ? value : Number(draft)

  const step = (delta: number) => {
    const next = current + delta
    if (next < min) {
      say(`Minimum is ${min}${min === 1 ? ' — remove the line instead' : ''}.`)
      return
    }
    if (next > max) {
      say(`Maximum is ${max}.`)
      return
    }
    setNotice(null)
    setDraft(String(next))
    onChange(next)
  }

  const atMin = current <= min
  const atMax = current >= max

  return (
    <div className={cn('inline-flex flex-col items-start gap-1', className)}>
      <div
        className={cn(
          'inline-flex h-9 items-stretch overflow-hidden rounded-control border border-default bg-card',
          locked && 'opacity-60',
        )}
      >
        <button
          type="button"
          aria-label="Decrease quantity"
          disabled={locked || busy}
          onClick={() => step(-1)}
          // Dimmed at the bound but still clickable, so the click can explain itself.
          className={cn(
            'w-7 hover:bg-hover disabled:pointer-events-none disabled:opacity-50',
            atMin ? 'text-disabled' : 'text-ink-2',
          )}
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
            if (isCommittableInteger(next, n, min, max)) {
              setNotice(null)
              onChange(n)
              return
            }
            // A typed number outside the bounds gets the same explanation a
            // click would, rather than silently snapping back on blur.
            if (next.trim() !== '' && Number.isFinite(n)) {
              if (n < min) say(`Minimum is ${min}.`)
              else if (n > max) say(`Maximum is ${max}.`)
            }
          }}
          onBlur={() => setDraft(String(value))}
          className="w-9 border-x border-default bg-card text-center text-[13px] text-ink tnum focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/30"
        />

        <button
          type="button"
          aria-label="Increase quantity"
          disabled={locked || busy}
          onClick={() => step(1)}
          className={cn(
            'w-7 hover:bg-hover disabled:pointer-events-none disabled:opacity-50',
            atMax ? 'text-disabled' : 'text-ink-2',
          )}
        >
          +
        </button>
      </div>

      {notice && (
        <span role="status" className="text-[11px] font-medium text-warning-tx">
          {notice}
        </span>
      )}
    </div>
  )
}

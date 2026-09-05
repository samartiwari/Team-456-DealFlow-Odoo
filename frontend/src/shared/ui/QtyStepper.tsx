import { cn } from './cn'

/**
 * Quantity +/- control for a cart line. Quantity is an integer >= 1;
 * removing a line is a separate action, not a decrement to zero.
 */
export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  disabled,
  className,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  disabled?: boolean
  className?: string
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  return (
    <div
      className={cn(
        'inline-flex h-9 items-stretch overflow-hidden rounded-control border border-default bg-card',
        disabled && 'opacity-50',
        className,
      )}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="w-7 text-ink-2 hover:bg-hover disabled:pointer-events-none disabled:text-disabled"
      >
        &minus;
      </button>

      <input
        type="text"
        inputMode="numeric"
        aria-label="Quantity"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^0-9]/g, ''))
          if (Number.isFinite(n) && n > 0) onChange(clamp(n))
        }}
        className="w-9 border-x border-default bg-card text-center text-[13px] text-ink tnum focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/30"
      />

      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="w-7 text-ink-2 hover:bg-hover disabled:pointer-events-none disabled:text-disabled"
      >
        +
      </button>
    </div>
  )
}

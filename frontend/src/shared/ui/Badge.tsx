import type { ReactNode } from 'react'
import { cn } from './cn'

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<Tone, string> = {
  neutral: 'bg-neutral-bg text-neutral-tx border-neutral-br',
  success: 'bg-success-bg text-success-tx border-success-br',
  warning: 'bg-warning-bg text-warning-tx border-warning-br',
  danger: 'bg-danger-bg text-danger-tx border-danger-br',
  info: 'bg-info-bg text-info-tx border-info-br',
}

/** Compact pill. Status is always a badge, never coloured body text. */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

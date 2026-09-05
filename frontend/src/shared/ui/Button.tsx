import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'
type Size = 'md' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

/**
 * Primary blue is reserved for the single most important action on a screen.
 * Everything else is secondary or ghost — see the design system.
 */
const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-white border border-transparent hover:bg-primary-hover active:bg-primary-active',
  secondary:
    'bg-card text-ink border border-default hover:bg-hover',
  danger:
    'bg-danger text-white border border-transparent hover:opacity-90',
  success:
    'bg-success text-white border border-transparent hover:opacity-90',
  ghost:
    'bg-transparent text-ink-2 border border-transparent hover:bg-hover hover:text-ink',
}

const sizes: Record<Size, string> = {
  md: 'h-9 px-3.5',
  sm: 'h-8 px-3',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-control text-[13px] font-semibold',
        'transition-colors disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

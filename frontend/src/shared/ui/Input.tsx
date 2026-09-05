import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  align?: 'left' | 'right'
}

/** 40px tall, 6px radius, focus ring in primary blue, danger border when invalid. */
export function Input({ invalid, align = 'left', className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 w-full rounded-control border bg-card px-3 text-sm text-ink',
        'placeholder:text-disabled disabled:opacity-50',
        'focus:outline-none focus:ring-2 focus:ring-primary/30',
        invalid ? 'border-danger focus:border-danger' : 'border-default focus:border-primary',
        align === 'right' && 'text-right tnum',
        className,
      )}
      {...rest}
    />
  )
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-control border border-default bg-card px-3 text-sm text-ink',
        'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

/** Multi-line input. Used for approval reasons, which are mandatory on every decision. */
export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      rows={3}
      className={cn(
        'w-full resize-y rounded-control border bg-card px-3 py-2 text-sm text-ink',
        'placeholder:text-disabled disabled:opacity-50',
        'focus:outline-none focus:ring-2 focus:ring-primary/30',
        invalid ? 'border-danger focus:border-danger' : 'border-default focus:border-primary',
        className,
      )}
      {...rest}
    />
  )
}

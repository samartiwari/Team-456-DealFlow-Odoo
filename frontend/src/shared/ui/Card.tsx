import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/** 1px border, 8px radius, no shadow. Padding lives on CardBody so tables can sit flush. */
export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn('rounded-card border border-default bg-card', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn('flex items-center justify-between gap-3 border-b border-default px-4 py-3', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('text-base font-semibold leading-6 text-ink', className)} {...rest}>
      {children}
    </h2>
  )
}

export function CardBody({ className, children, ...rest }: CardProps) {
  return (
    <div className={cn('p-4', className)} {...rest}>
      {children}
    </div>
  )
}

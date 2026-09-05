import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react'
import { cn } from './cn'

/**
 * Clean horizontal rows, subtle header contrast, no vertical borders.
 * Numeric columns take `numeric` so currency lines up on tabular figures.
 */
export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-[13px]', className)} {...rest}>
        {children}
      </table>
    </div>
  )
}

export function THead({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('bg-neutral-bg', className)} {...rest}>
      {children}
    </thead>
  )
}

export function TBody({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...rest}>
      {children}
    </tbody>
  )
}

export function TR({
  className,
  hover = false,
  children,
  ...rest
}: HTMLAttributes<HTMLTableRowElement> & { hover?: boolean }) {
  return (
    <tr
      className={cn(
        'border-b border-default last:border-0',
        hover && 'hover:bg-hover',
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  )
}

export function TH({
  className,
  numeric = false,
  children,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-2.5 py-2.5 text-[12px] font-semibold text-ink-2 whitespace-nowrap',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  )
}

export function TD({
  className,
  numeric = false,
  children,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        'px-2.5 py-2.5 align-middle text-[13px] text-ink-2',
        numeric && 'text-right tnum',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  )
}

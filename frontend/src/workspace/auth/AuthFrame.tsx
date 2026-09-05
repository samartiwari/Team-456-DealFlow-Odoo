import type { ReactNode } from 'react'
import { ThemeToggle } from '@/shared/ui'

/** The centred card both auth screens sit in. */
export function AuthFrame({
  title, subtitle, children, footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-full items-center justify-center bg-app px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-control bg-primary text-[12px] font-bold text-white">
            DF
          </span>
          <span className="text-sm font-semibold text-ink">DealFlow360</span>
          {/* The login screen is the first thing anyone meets, so the theme
              belongs here too rather than only inside the workspace. */}
          <ThemeToggle className="ml-auto" />
        </div>

        <div className="rounded-card border border-default bg-card p-6">
          <h1 className="text-xl font-bold text-ink">{title}</h1>
          <p className="mb-5 mt-0.5 text-[13px] text-muted">{subtitle}</p>
          {children}
        </div>

        {footer && <div className="mt-4 text-center">{footer}</div>}
      </div>
    </div>
  )
}

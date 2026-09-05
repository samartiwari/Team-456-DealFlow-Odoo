import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearSession, useActor } from '@/shared/api/session'
import type { UserRole } from '@/shared/api/types'
import { ThemeToggle } from '@/shared/ui'

type IconProps = { className?: string }

/* Simple line icons, inline so the bundle carries no icon library. */
const IconHome = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V8.5Z" strokeLinejoin="round" />
  </svg>
)

const IconPipeline = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <rect x="2.5" y="3.5" width="4" height="13" rx="1" />
    <rect x="8" y="3.5" width="4" height="9" rx="1" />
    <rect x="13.5" y="3.5" width="4" height="6" rx="1" />
  </svg>
)

const IconQuote = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <path d="M4.5 2.5h8l3.5 3.5v11a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
    <path d="M12 2.5V6a.5.5 0 0 0 .5.5H16" strokeLinejoin="round" />
    <path d="M7 10.5h6M7 13.5h4" strokeLinecap="round" />
  </svg>
)

const IconApproval = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <path d="M10 2.5 3.5 5v5c0 3.5 2.6 6.6 6.5 7.5 3.9-.9 6.5-4 6.5-7.5V5L10 2.5Z" strokeLinejoin="round" />
    <path d="m7.5 9.8 1.9 1.9 3.4-3.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IconStock = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <path d="M2.5 7.5 10 3.5l7.5 4v9l-7.5 4-7.5-4v-9Z" strokeLinejoin="round" />
    <path d="M2.5 7.5 10 11.5l7.5-4M10 11.5v8" strokeLinejoin="round" />
  </svg>
)

const IconInvoice = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <path d="M4.5 2.5h11v15l-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4L4.5 17.5v-15Z" strokeLinejoin="round" />
    <path d="M7.5 7h5M7.5 10.5h3" strokeLinecap="round" />
  </svg>
)

const IconHealth = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <path d="M2.5 11h3l2-5 3 9 2.5-6 1.5 2h3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IconReport = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <path d="M3 16.5h14" strokeLinecap="round" />
    <path d="M5.5 16.5v-5M9.5 16.5v-9M13.5 16.5v-6" strokeLinecap="round" />
  </svg>
)

const IconCatalog = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <path d="M3 5.5a1 1 0 0 1 1-1h4.5v13H4a1 1 0 0 1-1-1v-11Z" strokeLinejoin="round" />
    <path d="M8.5 4.5H16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8.5" strokeLinejoin="round" />
    <path d="M11 8h3M11 11h3" strokeLinecap="round" />
  </svg>
)

const IconConfig = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <path d="M3 6h7M14 6h3M3 14h3M10 14h7" strokeLinecap="round" />
    <circle cx="12" cy="6" r="2" />
    <circle cx="8" cy="14" r="2" />
  </svg>
)

/**
 * `roles` absent means everyone. Deal health and reporting are manager-only, and
 * a nav item that could only ever return 403 is worse than one that is absent.
 */
/**
 * Every item names the roles that may see it — the same mechanism as before,
 * now driven by the signed-in user rather than a picker.
 *
 * A nav item that could only ever answer 403 is worse than one that is absent,
 * so this list matches what the server actually permits.
 */
const nav: Array<{ to: string; label: string; Icon: (p: IconProps) => JSX.Element; roles: UserRole[] }> = [
  { to: '/app/dashboard', label: 'Home', Icon: IconHome, roles: ['REP', 'MANAGER', 'FINANCE', 'ADMIN', 'OPERATIONS'] },
  { to: '/app/pipeline', label: 'Pipeline', Icon: IconPipeline, roles: ['REP', 'MANAGER', 'ADMIN'] },
  { to: '/app/quotations', label: 'Quotations', Icon: IconQuote, roles: ['REP', 'MANAGER'] },
  { to: '/app/approvals', label: 'Approvals', Icon: IconApproval, roles: ['MANAGER', 'FINANCE'] },
  { to: '/app/fulfilment', label: 'Fulfilment', Icon: IconStock, roles: ['REP', 'MANAGER', 'FINANCE', 'ADMIN', 'OPERATIONS'] },
  { to: '/app/invoices', label: 'Invoices', Icon: IconInvoice, roles: ['MANAGER', 'FINANCE', 'ADMIN'] },
  { to: '/app/products', label: 'Catalog', Icon: IconCatalog, roles: ['REP', 'MANAGER', 'ADMIN'] },
  { to: '/app/deal-health', label: 'Deal health', Icon: IconHealth, roles: ['MANAGER', 'FINANCE', 'ADMIN'] },
  { to: '/app/reports', label: 'Reports', Icon: IconReport, roles: ['MANAGER', 'FINANCE', 'ADMIN'] },
  { to: '/app/configuration', label: 'Configuration', Icon: IconConfig, roles: ['MANAGER', 'ADMIN'] },
]

const ROLE_LABEL: Record<UserRole, string> = {
  REP: 'Sales rep',
  MANAGER: 'Sales manager',
  FINANCE: 'Finance',
  ADMIN: 'Administrator',
  OPERATIONS: 'Operations',
}

/**
 * The workspace actions from the mockup's top menu.
 *
 * Reload data refetches everything rather than reloading the document: the
 * point of the action is to pick up a colleague's change, and a full reload
 * would also throw away the route and any half-typed form. Go to back-end is
 * the configuration area, and is absent for anyone the server would refuse.
 * Close workspace ends the session, which is what leaving it actually means when
 * a token is the only thing holding you here. Sign out sits outside the menu and
 * does the same thing: it is the control people hunt for when they want to leave,
 * and burying it behind a menu they have to guess the name of is how you make a
 * demo look broken. Two affordances, one action, on purpose.
 */
function WorkspaceMenu({ canConfigure }: { canConfigure: boolean }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [reloading, setReloading] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Click-away and Escape, so the menu never strands the keyboard.
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const reload = async () => {
    setOpen(false)
    setReloading(true)
    try {
      await qc.invalidateQueries()
    } finally {
      setReloading(false)
    }
  }

  const item =
    'block w-full px-3 py-2 text-left text-[13px] text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50'

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-control border border-default px-3 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-hover hover:text-ink"
      >
        {reloading ? 'Reloading…' : 'Workspace'}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-card border border-default bg-sidebar py-1 shadow-lg"
        >
          <button type="button" role="menuitem" className={item}
            disabled={reloading} onClick={() => void reload()}>
            Reload data
          </button>

          {canConfigure && (
            <button type="button" role="menuitem" className={item}
              onClick={() => { setOpen(false); navigate('/app/configuration') }}>
              Go to back-end
            </button>
          )}

          <div className="my-1 border-t border-default" />

          <button type="button" role="menuitem" className={item}
            onClick={() => { clearSession(); navigate('/login', { replace: true }) }}>
            Close workspace
          </button>
        </div>
      )}
    </div>
  )
}

/** The control people look for. Same action as the menu's Close workspace. */
function SignOutButton() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => { clearSession(); navigate('/login', { replace: true }) }}
      className="rounded-control border border-default px-3 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-hover hover:text-ink"
    >
      Sign out
    </button>
  )
}

export default function Shell() {
  const actor = useActor()
  const visible = nav.filter((n) => n.roles.includes(actor.role))

  return (
    <div className="flex min-h-full">
      {/* Sidebar — fixed, white in light, #0F172A in dark */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-default bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-default px-4">
          <span className="grid h-6 w-6 place-items-center rounded-[6px] bg-primary text-[11px] font-bold text-white">
            DF
          </span>
          <span className="text-sm font-semibold text-ink">DealFlow360</span>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {visible.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2.5 rounded-[6px] px-3 py-2 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-active text-primary'
                    : 'text-ink-2 hover:bg-hover hover:text-ink',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-muted'}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — deliberately secondary to the content */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-default bg-sidebar px-4 md:px-6">
          <span className="text-sm font-semibold text-ink md:hidden">DealFlow360</span>
          <div className="hidden md:block" />

          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[13px] font-medium text-ink">{actor.name}</span>
              <span className="text-[11px] text-muted">{ROLE_LABEL[actor.role]}</span>
            </div>
            <WorkspaceMenu canConfigure={actor.role === 'MANAGER' || actor.role === 'ADMIN'} />
            <SignOutButton />
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 bg-app p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

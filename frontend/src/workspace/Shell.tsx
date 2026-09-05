import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { ActorSwitcher } from './ActorSwitcher'

type IconProps = { className?: string }

/* Simple line icons, inline so the bundle carries no icon library. */
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

const IconConfig = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <path d="M3 6h7M14 6h3M3 14h3M10 14h7" strokeLinecap="round" />
    <circle cx="12" cy="6" r="2" />
    <circle cx="8" cy="14" r="2" />
  </svg>
)

const IconSun = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <circle cx="10" cy="10" r="3.5" />
    <path d="M10 2v1.5M10 16.5V18M18 10h-1.5M3.5 10H2M15.7 4.3l-1 1M5.3 14.7l-1 1M15.7 15.7l-1-1M5.3 5.3l-1-1" strokeLinecap="round" />
  </svg>
)

const IconMoon = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
    <path d="M16.5 11.8A7 7 0 0 1 8.2 3.5a7 7 0 1 0 8.3 8.3Z" strokeLinejoin="round" />
  </svg>
)

const nav = [
  { to: '/app/quotations', label: 'Quotations', Icon: IconQuote },
  { to: '/app/approvals', label: 'Approvals', Icon: IconApproval },
  { to: '/app/configuration', label: 'Configuration', Icon: IconConfig },
]

const THEME_KEY = 'df360.theme'

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark'
    } catch {
      return false
    }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    } catch {
      /* private browsing — the choice just does not persist */
    }
  }, [dark])

  return { dark, toggle: () => setDark((d) => !d) }
}

export default function Shell() {
  const { dark, toggle } = useTheme()

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
          {nav.map(({ to, label, Icon }) => (
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
            <ActorSwitcher />
            <button
            type="button"
            onClick={toggle}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="grid h-8 w-8 place-items-center rounded-[6px] border border-default text-muted hover:bg-hover hover:text-ink"
          >
            {dark ? <IconSun className="h-4 w-4" /> : <IconMoon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 bg-app p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

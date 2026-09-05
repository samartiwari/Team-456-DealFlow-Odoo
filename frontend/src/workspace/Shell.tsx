import { NavLink, Outlet } from 'react-router-dom'

const links = [
  { to: 'dashboard', label: 'Dashboard' },
  { to: 'quotations', label: 'Quotations' },
]

export default function Shell() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-rule bg-panel">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-8 px-6 py-3">
          <span className="font-mono text-xs font-bold tracking-widest text-ink">
            DEALFLOW<span className="text-amber">360</span>
          </span>
          <nav className="flex gap-1">
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 text-sm ${
                    isActive ? 'bg-inset text-ink' : 'text-slate hover:text-ink'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}

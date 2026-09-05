import { NavLink, Outlet } from 'react-router-dom'
import { PageHeader } from '@/shared/ui'

/**
 * The configuration area.
 *
 * Every screen under here writes to /api/admin/**, which is manager-only, and
 * the whole section is absent from anyone else's navigation — the same rule as
 * deal health and reporting.
 */
const tabs = [
  { to: '/app/configuration', label: 'Discounts & approvals', end: true },
  { to: '/app/configuration/products', label: 'Products' },
  { to: '/app/configuration/price-lists', label: 'Price lists' },
  { to: '/app/configuration/warehouses', label: 'Warehouses' },
  { to: '/app/configuration/plans', label: 'Subscription plans' },
  { to: '/app/configuration/upsell', label: 'Upsell rules' },
]

export default function AdminShell() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Configuration"
        description="The rows behind every engine — ceilings, prices, warehouses, billing and suggestions."
      />

      <nav className="-mb-1 flex flex-wrap gap-1 border-b border-default">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              [
                'rounded-t-control border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-ink',
              ].join(' ')
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}

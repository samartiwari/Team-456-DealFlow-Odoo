import { NavLink, Outlet } from 'react-router-dom'
import { useActor } from '@/shared/api/session'
import { CAN } from '@/shared/api/types'
import { PageHeader } from '@/shared/ui'

/**
 * The configuration area.
 *
 * Two permissions, not one. A Sales Manager configures discount tiers and
 * approval chains — the brief gives them that by name and gives them nothing
 * else — so they see the first tab and only that. Everything after it writes to
 * /api/admin/**, which the brief assigns to Admin: products, price lists,
 * warehouses and subscription plans.
 *
 * The tabs are filtered rather than merely disabled, for the same reason no nav
 * item is shown that can only answer 403: a control that exists to be refused
 * teaches the wrong thing about who is allowed what.
 */
const tabs = [
  { to: '/app/configuration', label: 'Discounts & approvals', end: true, adminOnly: false },
  { to: '/app/configuration/products', label: 'Products', adminOnly: true },
  { to: '/app/configuration/price-lists', label: 'Price lists', adminOnly: true },
  { to: '/app/configuration/warehouses', label: 'Warehouses', adminOnly: true },
  { to: '/app/configuration/plans', label: 'Subscription plans', adminOnly: true },
  { to: '/app/configuration/upsell', label: 'Upsell rules', adminOnly: true },
]

export default function AdminShell() {
  const actor = useActor()
  const platform = CAN.configurePlatform(actor.role)
  const visible = tabs.filter((t) => platform || !t.adminOnly)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Configuration"
        description={
          platform
            ? 'The rows behind every engine — ceilings, prices, warehouses, billing and suggestions.'
            : 'The ceilings and approval chains every quotation is judged against.'
        }
      />

      <nav className="-mb-1 flex flex-wrap gap-1 border-b border-default">
        {visible.map((t) => (
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

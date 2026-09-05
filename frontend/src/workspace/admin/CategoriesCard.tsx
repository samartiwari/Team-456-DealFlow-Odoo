import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { adminListCategories, adminUpdateCategory } from '@/shared/api/endpoints'
import type { CategoryBody } from '@/shared/api/types'
import {
  Badge, Button, Card, CardBody, CardHeader, CardTitle, Spinner,
  TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { useAdminErrors, useInvalidateEverything } from './useAdmin'

/**
 * The two category flags nothing else can set.
 *
 * A category decides three things, each read by a different engine: its ceiling
 * feeds risk, `stockable` decides whether fulfilment reserves stock, and
 * `recurring` decides whether billing raises a subscription. The ceiling is
 * edited on the discounts tab, where it sits beside the tier ceilings it is
 * compared against — so this card owns the other two rather than offering a
 * second way to write the same number.
 *
 * Categories are tunable but not creatable. Three flags wired into three
 * engines is a thing to adjust, not to multiply: a fourth category would reach
 * a state nothing else in the system was built for.
 */
export function CategoriesCard() {
  const invalidate = useInvalidateEverything()
  const { problem, fail, clear } = useAdminErrors()

  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: adminListCategories })
  const update = useMutation({
    mutationFn: (v: { id: number; body: Partial<CategoryBody> }) => adminUpdateCategory(v.id, v.body),
    onSuccess: () => { invalidate(); clear() },
    onError: fail,
  })

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <span className="text-[12px] text-muted">product_category</span>
      </CardHeader>

      {problem && (
        <CardBody className="border-b border-default">
          <p role="alert" className="text-[13px] text-danger-tx">{problem.message}</p>
        </CardBody>
      )}

      {categories.isLoading ? (
        <CardBody className="flex justify-center py-6"><Spinner /></CardBody>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Category</TH>
              <TH numeric>Max discount</TH>
              <TH>Fulfilment</TH>
              <TH>Billing</TH>
            </TR>
          </THead>
          <TBody>
            {(categories.data ?? []).map((c) => (
              <TR key={c.id} hover>
                <TD className="font-medium text-ink">{c.name}</TD>
                <TD numeric className="text-muted">
                  {/* Null is not zero: it means the tier ceiling applies alone. */}
                  {c.ceilingPct === null ? 'tier ceiling' : `${c.ceilingPct}%`}
                </TD>
                <TD>
                  <Toggle
                    on={c.stockable}
                    busy={update.isPending}
                    onLabel="Shipped"
                    offLabel="Delivered"
                    describe={`${c.name} fulfilment`}
                    onToggle={() => update.mutate({ id: c.id, body: { stockable: !c.stockable } })}
                  />
                </TD>
                <TD>
                  <Toggle
                    on={c.recurring}
                    busy={update.isPending}
                    onLabel="Recurring"
                    offLabel="One-time"
                    tone="warning"
                    describe={`${c.name} billing`}
                    onToggle={() => update.mutate({ id: c.id, body: { recurring: !c.recurring } })}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <CardBody className="border-t border-default">
        <p className="text-[12px] text-muted">
          <b>Shipped</b> means fulfilment reserves stock for it; <b>delivered</b> means it
          never enters a warehouse split. <b>Recurring</b> means billing raises a
          subscription instead of a line on today&rsquo;s invoice. The discount ceiling is
          set on{' '}
          <Link to="/app/configuration" className="font-medium text-primary hover:underline">
            discounts &amp; approvals
          </Link>
          , beside the tier ceilings it is compared against.
        </p>
      </CardBody>
    </Card>
  )
}

function Toggle({
  on, busy, onLabel, offLabel, tone = 'neutral', describe, onToggle,
}: {
  on: boolean
  busy: boolean
  onLabel: string
  offLabel: string
  tone?: 'neutral' | 'warning'
  describe: string
  onToggle: () => void
}) {
  return (
    <Button
      size="sm"
      disabled={busy}
      aria-label={`${describe}: currently ${on ? onLabel : offLabel}`}
      onClick={onToggle}
      className="gap-2"
    >
      <Badge tone={on ? (tone === 'warning' ? 'warning' : 'neutral') : 'info'}>
        {on ? onLabel : offLabel}
      </Badge>
      <span className="text-[11px] text-muted">change</span>
    </Button>
  )
}

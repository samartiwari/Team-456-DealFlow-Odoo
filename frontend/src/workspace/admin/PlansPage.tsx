import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  adminCreatePlan, adminDeletePlan, adminListPlans, adminListProducts, adminUpdatePlan,
} from '@/shared/api/endpoints'
import type {
  BillingInterval, CancellationPolicy, PlanBody, ProrationPolicy, SubscriptionPlan,
} from '@/shared/api/types'
import {
  Badge, Button, Card, CardBody, EmptyState, ErrorState, Field, Input, Select,
  Spinner, TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { useAdminErrors, useInvalidateEverything } from './useAdmin'

/** Each option says what it does, because none of these words are self-evident. */
const INTERVALS: Array<[BillingInterval, string]> = [
  ['MONTHLY', 'Monthly'],
  ['QUARTERLY', 'Quarterly'],
  ['YEARLY', 'Yearly'],
]

const PRORATION: Array<[ProrationPolicy, string]> = [
  ['PRORATE', 'Prorate — bill the unused remainder of the period'],
  ['FULL_PERIOD', 'Full period — the change takes effect next period'],
  ['NONE', 'None — applies immediately, no adjustment either way'],
]

const CANCELLATION: Array<[CancellationPolicy, string]> = [
  ['END_OF_PERIOD', 'End of period — runs to the end of what was paid for'],
  ['IMMEDIATE_WITH_CREDIT', 'Immediate, with credit — stops now, credits the remainder'],
  ['IMMEDIATE_NO_CREDIT', 'Immediate, no credit — stops now, keeps the money'],
]

/**
 * A5 — the three billing choices, made explicit.
 *
 * Recurring billing was hardcoded: calendar months, prorate on change, credit
 * on cancel. Every recurring product is seeded with a plan reproducing exactly
 * that, so nothing about billing moves until someone moves it here.
 */
export default function PlansPage() {
  const invalidate = useInvalidateEverything()
  const { problem, fail, clear, fieldError } = useAdminErrors()
  const [creating, setCreating] = useState(false)

  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: adminListPlans })
  const products = useQuery({ queryKey: ['admin-products'], queryFn: adminListProducts })

  const done = () => { invalidate(); clear() }
  const create = useMutation({
    mutationFn: (b: PlanBody) => adminCreatePlan(b),
    onSuccess: () => { done(); setCreating(false) }, onError: fail,
  })
  const update = useMutation({
    mutationFn: (v: { id: number; body: Partial<PlanBody> }) => adminUpdatePlan(v.id, v.body),
    onSuccess: done, onError: fail,
  })
  const remove = useMutation({
    mutationFn: (id: number) => adminDeletePlan(id), onSuccess: done, onError: fail,
  })

  if (plans.isLoading) return <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
  if (plans.isError || !plans.data) {
    return <ErrorState title="Could not load plans" description="Only a sales manager can open this." />
  }

  const recurring = (products.data ?? []).filter((p) => p.recurring && !p.archived)
  const busy = create.isPending || update.isPending || remove.isPending

  return (
    <div className="flex flex-col gap-4">
      {problem && !problem.field && (
        <div role="alert" className="rounded-card border border-danger-br bg-danger-bg px-4 py-3">
          <p className="text-[13px] text-danger-tx">{problem.message}</p>
        </div>
      )}

      <div className="flex justify-end">
        {!creating && recurring.length > 0 && (
          <Button variant="primary" onClick={() => { setCreating(true); clear() }}>New plan</Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardBody>
            <PlanForm products={recurring} busy={create.isPending} fieldError={fieldError}
              onCancel={() => { setCreating(false); clear() }} onSubmit={(b) => create.mutate(b)} />
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden">
        {plans.data.length === 0 ? (
          <EmptyState title="No plans" description="A recurring product needs a plan to bill against." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Plan</TH>
                  <TH>Product</TH>
                  <TH>Interval</TH>
                  <TH>On a quantity change</TH>
                  <TH>On cancellation</TH>
                  <TH>Active</TH>
                  <TH aria-label="Actions" />
                </TR>
              </THead>
              <TBody>
                {plans.data.map((p) => (
                  <PlanRow key={p.id} plan={p} busy={busy}
                    onChange={(body) => update.mutate({ id: p.id, body })}
                    onDelete={() => remove.mutate(p.id)} />
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      <p className="text-[12px] text-muted">
        A product can have at most one active plan. Every recurring product ships with a
        monthly, prorating plan that credits on cancellation — which is exactly what billing
        did before these choices were editable.
      </p>
    </div>
  )
}

function PlanRow({
  plan, busy, onChange, onDelete,
}: {
  plan: SubscriptionPlan
  busy: boolean
  onChange: (b: Partial<PlanBody>) => void
  onDelete: () => void
}) {
  return (
    <TR hover>
      <TD className="font-medium text-ink">{plan.name}</TD>
      <TD className="text-ink-2">{plan.productName}</TD>
      <TD>
        <Select className="h-9 w-[120px]" value={plan.interval} disabled={busy}
          aria-label={`${plan.name} interval`}
          onChange={(e) => onChange({ interval: e.target.value as BillingInterval })}>
          {INTERVALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </TD>
      <TD>
        <Select className="h-9 w-[150px]" value={plan.prorationPolicy} disabled={busy}
          aria-label={`${plan.name} proration policy`}
          onChange={(e) => onChange({ prorationPolicy: e.target.value as ProrationPolicy })}>
          {PRORATION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </TD>
      <TD>
        <Select className="h-9 w-[170px]" value={plan.cancellationPolicy} disabled={busy}
          aria-label={`${plan.name} cancellation policy`}
          onChange={(e) => onChange({ cancellationPolicy: e.target.value as CancellationPolicy })}>
          {CANCELLATION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </TD>
      <TD>
        <Badge tone={plan.active ? 'success' : 'neutral'}>{plan.active ? 'Active' : 'Inactive'}</Badge>
      </TD>
      <TD className="w-px">
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => onChange({ active: !plan.active })}>
            {plan.active ? 'Deactivate' : 'Activate'}
          </Button>
          <Button size="sm" disabled={busy} onClick={onDelete}>Delete</Button>
        </div>
      </TD>
    </TR>
  )
}

function PlanForm({
  products, busy, fieldError, onCancel, onSubmit,
}: {
  products: Array<{ id: number; name: string }>
  busy: boolean
  fieldError: (f: string) => string | null
  onCancel: () => void
  onSubmit: (b: PlanBody) => void
}) {
  const [name, setName] = useState('')
  const [productId, setProductId] = useState(products[0]?.id ?? 0)
  const [interval, setBillingInterval] = useState<BillingInterval>('MONTHLY')
  const [proration, setProration] = useState<ProrationPolicy>('PRORATE')
  const [cancellation, setCancellation] = useState<CancellationPolicy>('IMMEDIATE_WITH_CREDIT')
  const [active, setActive] = useState(true)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Name" htmlFor="pl-name" className="min-w-[200px] flex-1" error={fieldError('name')}>
          <Input id="pl-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Product" htmlFor="pl-product" className="w-[220px]" error={fieldError('productId')}>
          <Select id="pl-product" value={productId} onChange={(e) => setProductId(Number(e.target.value))}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Interval" htmlFor="pl-interval" className="w-[150px]">
          <Select id="pl-interval" value={interval}
            onChange={(e) => setBillingInterval(e.target.value as BillingInterval)}>
            {INTERVALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="On a quantity change" htmlFor="pl-pro" className="min-w-[280px] flex-1">
          <Select id="pl-pro" value={proration}
            onChange={(e) => setProration(e.target.value as ProrationPolicy)}>
            {PRORATION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="On cancellation" htmlFor="pl-cancel" className="min-w-[300px] flex-1">
          <Select id="pl-cancel" value={cancellation}
            onChange={(e) => setCancellation(e.target.value as CancellationPolicy)}>
            {CANCELLATION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 pb-2.5 text-[13px] text-ink-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-strong" />
          Active
        </label>
        <Button variant="primary" disabled={busy || name.trim() === '' || !productId}
          onClick={() => onSubmit({
            name: name.trim(), productId, interval,
            prorationPolicy: proration, cancellationPolicy: cancellation, active,
          })}>
          {busy ? 'Creating…' : 'Create'}
        </Button>
        <Button disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

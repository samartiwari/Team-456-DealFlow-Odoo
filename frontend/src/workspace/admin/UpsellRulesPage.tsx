import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  adminCreateUpsellRule, adminDeleteUpsellRule, adminListProducts, adminListUpsellRules,
  adminUpdateUpsellRule,
} from '@/shared/api/endpoints'
import type { AdminUpsellRule, UpsellRuleBody } from '@/shared/api/types'
import {
  Badge, Button, Card, CardBody, EmptyState, ErrorState, Field, Input, Select,
  Spinner, TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { useAdminErrors, useInvalidateEverything } from './useAdmin'

/**
 * A6 — the two knobs the ranker actually reads.
 *
 * `promoted` is 30% of a suggestion's score, and `minMarginPct` withholds a
 * suggestion whose own margin falls below it. The rest of the ranking is the
 * pairing's confidence, which is 1.0 for every curated rule.
 */
export default function UpsellRulesPage() {
  const invalidate = useInvalidateEverything()
  const { problem, fail, clear, fieldError } = useAdminErrors()
  const [creating, setCreating] = useState(false)

  const rules = useQuery({ queryKey: ['admin-upsell'], queryFn: adminListUpsellRules })
  const products = useQuery({ queryKey: ['admin-products'], queryFn: adminListProducts })

  const done = () => { invalidate(); clear() }
  const create = useMutation({
    mutationFn: (b: UpsellRuleBody) => adminCreateUpsellRule(b),
    onSuccess: () => { done(); setCreating(false) }, onError: fail,
  })
  const update = useMutation({
    mutationFn: (v: { id: number; body: Partial<UpsellRuleBody> }) => adminUpdateUpsellRule(v.id, v.body),
    onSuccess: done, onError: fail,
  })
  const remove = useMutation({
    mutationFn: (id: number) => adminDeleteUpsellRule(id), onSuccess: done, onError: fail,
  })

  if (rules.isLoading) return <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
  if (rules.isError || !rules.data) {
    return <ErrorState title="Could not load upsell rules" description="Only a sales manager can open this." />
  }

  const catalog = (products.data ?? []).filter((p) => !p.archived)
  const busy = create.isPending || update.isPending || remove.isPending

  return (
    <div className="flex flex-col gap-4">
      {problem && !problem.field && (
        <div role="alert" className="rounded-card border border-danger-br bg-danger-bg px-4 py-3">
          <p className="text-[13px] text-danger-tx">{problem.message}</p>
        </div>
      )}

      <div className="flex justify-end">
        {!creating && catalog.length > 1 && (
          <Button variant="primary" onClick={() => { setCreating(true); clear() }}>New pairing</Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <RuleForm products={catalog} busy={create.isPending} fieldError={fieldError}
              onCancel={() => { setCreating(false); clear() }} onSubmit={(b) => create.mutate(b)} />
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden">
        {rules.data.length === 0 ? (
          <EmptyState title="No pairings" description="Without one, the upsell panel has nothing to suggest." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When this is in the cart</TH>
                <TH>Suggest</TH>
                <TH numeric>Margin floor</TH>
                <TH>Promoted</TH>
                <TH aria-label="Actions" />
              </TR>
            </THead>
            <TBody>
              {rules.data.map((r) => (
                <RuleRow key={r.id} rule={r} busy={busy}
                  onChange={(body) => update.mutate({ id: r.id, body })}
                  onDelete={() => remove.mutate(r.id)} />
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-1.5">
          <p className="text-[13px] text-ink-2">Both fields change what the panel shows.</p>
          <p className="text-[12px] text-muted">
            <b>Promoted</b> is worth 30% of a suggestion&rsquo;s score, so a promoted pairing
            outranks an equally good one that is not. <b>Margin floor</b> withholds the
            suggestion entirely when the candidate&rsquo;s own margin falls below it — a
            suggestion that would dilute the deal is worse than none.
          </p>
          <p className="text-[12px] text-muted">
            A product cannot suggest itself, and a pairing cannot be added twice — edit the
            existing one instead.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

function RuleRow({
  rule, busy, onChange, onDelete,
}: {
  rule: AdminUpsellRule
  busy: boolean
  onChange: (b: Partial<UpsellRuleBody>) => void
  onDelete: () => void
}) {
  const [floor, setFloor] = useState(String(rule.minMarginPct))
  const [seen, setSeen] = useState(rule.minMarginPct)
  if (seen !== rule.minMarginPct) { setSeen(rule.minMarginPct); setFloor(String(rule.minMarginPct)) }

  return (
    <TR hover>
      <TD className="font-medium text-ink">{rule.triggerProductName}</TD>
      <TD className="text-ink-2">{rule.suggestedProductName}</TD>
      <TD numeric>
        <span className="inline-flex items-center gap-1.5">
          <input
            inputMode="decimal"
            disabled={busy}
            value={floor}
            onChange={(e) => setFloor(e.target.value.replace(/[^0-9.]/g, ''))}
            onBlur={() => {
              const n = Number(floor)
              if (floor.trim() !== '' && Number.isFinite(n) && n !== rule.minMarginPct) {
                onChange({ minMarginPct: n })
              } else setFloor(String(rule.minMarginPct))
            }}
            aria-label={`Margin floor for ${rule.suggestedProductName}`}
            className="h-9 w-20 rounded-control border border-default bg-card px-2 text-right text-[13px] text-ink tnum focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <span className="text-[12px] text-muted">%</span>
        </span>
      </TD>
      <TD>
        <button type="button" disabled={busy}
          onClick={() => onChange({ promoted: !rule.promoted })}
          className="disabled:opacity-50">
          <Badge tone={rule.promoted ? 'info' : 'neutral'}>
            {rule.promoted ? 'Promoted' : 'Not promoted'}
          </Badge>
        </button>
      </TD>
      <TD className="w-px">
        <Button size="sm" disabled={busy} onClick={onDelete}>Delete</Button>
      </TD>
    </TR>
  )
}

function RuleForm({
  products, busy, fieldError, onCancel, onSubmit,
}: {
  products: Array<{ id: number; name: string }>
  busy: boolean
  fieldError: (f: string) => string | null
  onCancel: () => void
  onSubmit: (b: UpsellRuleBody) => void
}) {
  const [trigger, setTrigger] = useState(products[0]?.id ?? 0)
  const [suggested, setSuggested] = useState(products[1]?.id ?? 0)
  const [floor, setFloor] = useState('10')
  const [promoted, setPromoted] = useState(false)

  return (
    <>
      <Field label="When this is in the cart" htmlFor="ur-trigger" className="min-w-[200px] flex-1">
        <Select id="ur-trigger" value={trigger} onChange={(e) => setTrigger(Number(e.target.value))}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Suggest" htmlFor="ur-suggested" className="min-w-[200px] flex-1"
        error={fieldError('suggestedProductId')}>
        <Select id="ur-suggested" value={suggested} onChange={(e) => setSuggested(Number(e.target.value))}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Margin floor" htmlFor="ur-floor" className="w-[120px]" error={fieldError('minMarginPct')}>
        <Input id="ur-floor" align="right" inputMode="decimal" value={floor}
          onChange={(e) => setFloor(e.target.value.replace(/[^0-9.]/g, ''))} />
      </Field>
      <label className="flex items-center gap-2 pb-2.5 text-[13px] text-ink-2">
        <input type="checkbox" checked={promoted} onChange={(e) => setPromoted(e.target.checked)}
          className="h-4 w-4 rounded border-strong" />
        Promoted
      </label>
      <Button variant="primary" disabled={busy || floor === ''}
        onClick={() => onSubmit({
          triggerProductId: trigger, suggestedProductId: suggested,
          minMarginPct: Number(floor), promoted,
        })}>
        {busy ? 'Adding…' : 'Add pairing'}
      </Button>
      <Button disabled={busy} onClick={onCancel}>Cancel</Button>
    </>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { useActor } from '@/shared/api/session'
import {
  advanceBillingClock, cancelSubscription, changeSubscription, getBilling, recordPayment,
} from '@/shared/api/endpoints'
import type { BillingView, ProrationResult } from '@/shared/api/types'
import { money } from '@/shared/lib/format'
import { Badge, Button, Card, CardBody, ErrorState, PageHeader, Spinner } from '@/shared/ui'
import { InvoicePanel } from './InvoicePanel'
import { SubscriptionPanel } from './SubscriptionPanel'

/**
 * B7 — hybrid billing. One order, both halves, side by side.
 *
 * The order forks but stays one order: there is no second quotation and no
 * separate subscription order. A screen that made these look like two orders
 * would have missed the feature, so they sit under one header that names the
 * quotation they both came from.
 */
export default function BillingPage() {
  const { id: param } = useParams()
  const id = Number(param)
  const qc = useQueryClient()
  const actor = useActor()
  // Finance and admin only, per the permission matrix. No admin is seeded.
  const canManage = actor.role === 'FINANCE'

  const key = ['billing', id]
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: key,
    queryFn: () => getBilling(id),
    enabled: Number.isFinite(id),
    retry: false,
  })

  const fail = (e: unknown) => {
    setNote(null)
    setProblem(e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
  }

  /** A payment changes the invoice, so the list of invoices is stale too. */
  const settled = () => {
    qc.invalidateQueries({ queryKey: key })
    qc.invalidateQueries({ queryKey: ['invoices'] })
    setProblem(null)
  }

  const pay = useMutation({
    mutationFn: (v: { amount: number; reference: string }) =>
      recordPayment(data!.invoice!.id, { amount: v.amount, reference: v.reference || undefined }),
    onSuccess: (inv) => {
      settled()
      setNote(`Recorded ${money(inv.paid, data!.currency)} of ${money(inv.total, data!.currency)}. The status is now ${inv.status.replace('_', ' ').toLowerCase()}.`)
    },
    onError: fail,
  })

  /** Change and cancel answer identically, so one handler renders both. */
  const applied = (r: ProrationResult) => {
    qc.setQueryData(key, r.billing)
    qc.invalidateQueries({ queryKey: ['invoices'] })
    setProblem(null)
    // Rendered verbatim: it is written to be read by a person.
    setNote(r.creditNote ? `${r.explanation} Credit note ${r.creditNote.ref}.` : r.explanation)
  }

  const change = useMutation({
    mutationFn: (v: { id: number; quantity: number }) => changeSubscription(v.id, { quantity: v.quantity }),
    onSuccess: applied,
    onError: fail,
  })

  const cancel = useMutation({
    mutationFn: (v: { id: number; reason: string }) => cancelSubscription(v.id, { reason: v.reason }),
    onSuccess: applied,
    onError: fail,
  })

  const clock = useMutation({
    mutationFn: () => advanceBillingClock(),
    onSuccess: (r) => {
      settled()
      setNote(
        r.periodsBilled === 0
          ? `Clock moved to ${r.billingDate}. Nothing was due — this cycle is already billed.`
          : `Clock moved to ${r.billingDate}. ${r.periodsBilled} period${r.periodsBilled === 1 ? '' : 's'} billed.`,
      )
    },
    onError: fail,
  })

  const back = (
    <Link
      to={`/app/quotations/${id}`}
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
    >
      <span aria-hidden="true">&larr;</span> Back to quotation
    </Link>
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorState
          title="No billing for this quotation"
          description={
            error instanceof ApiError
              ? error.message
              : 'Billing exists once a quotation is approved.'
          }
        />
      </div>
    )
  }

  const busy = pay.isPending || change.isPending || cancel.isPending || clock.isPending

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        {back}
        <PageHeader
          title={`Billing · ${data.ref}`}
          description={`${data.customerName} — one order, invoiced today and scheduled monthly.`}
          actions={
            canManage && data.subscriptions.length > 0 ? (
              <Button disabled={busy} onClick={() => clock.mutate()}>
                {clock.isPending ? 'Advancing…' : 'Advance clock one cycle'}
              </Button>
            ) : null
          }
        />
      </div>

      {problem && (
        <Banner tone="danger" text={problem} onDismiss={() => setProblem(null)} />
      )}
      {note && <Banner tone="success" text={note} onDismiss={() => setNote(null)} />}

      <Summary view={data} />

      {/* Side by side above 1200px, stacked below — one order either way. */}
      <div className="grid gap-4 min-[1200px]:grid-cols-2">
        {data.invoice ? (
          <InvoicePanel
            invoice={data.invoice}
            currency={data.currency}
            canPay={canManage}
            actorName={actor.name}
            busy={pay.isPending}
            onPay={(amount, reference) => pay.mutate({ amount, reference })}
          />
        ) : (
          <Card>
            <CardBody>
              <p className="text-[13px] text-muted">
                Nothing bills today — every line on this order is recurring.
              </p>
            </CardBody>
          </Card>
        )}

        <div className="flex flex-col gap-4">
          {data.subscriptions.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-[13px] text-muted">
                  No recurring lines. This order bills once and is done.
                </p>
              </CardBody>
            </Card>
          ) : (
            data.subscriptions.map((s) => (
              <SubscriptionPanel
                key={s.id}
                subscription={s}
                currency={data.currency}
                canManage={canManage}
                busy={change.isPending || cancel.isPending}
                onChange={(quantity) => change.mutate({ id: s.id, quantity })}
                onCancel={(reason) => cancel.mutate({ id: s.id, reason })}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/** The one-line answer to "what does this order bill?". */
function Summary({ view }: { view: BillingView }) {
  const monthly = view.subscriptions
    .filter((s) => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + s.periodAmount, 0)

  return (
    <Card>
      <CardBody className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <Figure label="Due today" value={money(view.invoice?.outstanding ?? 0, view.currency)} />
        <Figure label="Invoiced today" value={money(view.invoice?.total ?? 0, view.currency)} />
        <Figure label="Then every month" value={money(monthly, view.currency)} />
        <div className="ml-auto">
          <Badge tone="info">
            {view.invoice ? '1 invoice' : 'no invoice'} ·{' '}
            {view.subscriptions.length} subscription{view.subscriptions.length === 1 ? '' : 's'}
          </Badge>
        </div>
      </CardBody>
    </Card>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="text-lg font-bold text-ink tnum">{value}</p>
    </div>
  )
}

function Banner({
  tone, text, onDismiss,
}: {
  tone: 'danger' | 'success'
  text: string
  onDismiss: () => void
}) {
  const cls = tone === 'danger'
    ? 'border-danger-br bg-danger-bg text-danger-tx'
    : 'border-success-br bg-success-bg text-success-tx'
  return (
    <div role={tone === 'danger' ? 'alert' : undefined}
      className={`flex items-start justify-between gap-3 rounded-card border px-4 py-3 ${cls}`}>
      <p className="text-[13px]">{text}</p>
      <button type="button" onClick={onDismiss} className="text-[12px] font-medium hover:underline">
        Dismiss
      </button>
    </div>
  )
}

import { useState } from 'react'
import type { Subscription } from '@/shared/api/types'
import { money } from '@/shared/lib/format'
import { sanitiseInteger } from '@/shared/lib/numericInput'
import {
  Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input,
  TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { PERIOD_STATUS, SUBSCRIPTION_STATUS } from './status'

/**
 * The recurring half of the same order.
 *
 * Twelve calendar months, not twelve 30-day blocks — February bills less than
 * January, and the day count sits on each row because that difference is real
 * money. Changing the quantity mid-period prorates for the days that remain.
 */
export function SubscriptionPanel({
  subscription,
  currency,
  canManage,
  busy,
  onChange,
  onCancel,
}: {
  subscription: Subscription
  currency: string
  canManage: boolean
  busy: boolean
  onChange: (quantity: number) => void
  onCancel: (reason: string) => void
}) {
  const [qty, setQty] = useState(String(subscription.quantity))
  const [seen, setSeen] = useState(subscription.quantity)
  if (seen !== subscription.quantity) {
    setSeen(subscription.quantity)
    setQty(String(subscription.quantity))
  }

  const cancelled = subscription.status === 'CANCELLED'
  const next = Number(qty)
  const canApply = qty.trim() !== '' && Number.isInteger(next) && next >= 1 && next !== subscription.quantity

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Subscription · {subscription.productName}</CardTitle>
        <Badge tone={SUBSCRIPTION_STATUS[subscription.status].tone}>
          {SUBSCRIPTION_STATUS[subscription.status].label}
        </Badge>
      </CardHeader>

      <CardBody className="border-b border-default">
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          <Fact label="Quantity" value={String(subscription.quantity)} />
          <Fact label="Per unit" value={money(subscription.unitPrice, currency)} />
          <Fact label="Per period" value={money(subscription.periodAmount, currency)} />
          <Fact label="Started" value={subscription.startDate} />
          {subscription.cancelledAt && <Fact label="Cancelled" value={subscription.cancelledAt} />}
        </dl>
      </CardBody>

      <Table>
        <THead>
          <TR>
            <TH>Period</TH>
            <TH numeric>Days</TH>
            <TH numeric>Amount</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {subscription.periods.map((p) => (
            <TR key={p.id} hover>
              <TD className="text-ink-2">
                {p.periodStart} &ndash; {p.periodEnd}
              </TD>
              {/* The day count is on the row because 28 and 31 bill different
                  money, and a client that assumed 30 would be wrong twice a year. */}
              <TD numeric className="text-muted">{p.days}</TD>
              <TD numeric className="font-medium text-ink">{money(p.amount, currency)}</TD>
              <TD>
                <Badge tone={PERIOD_STATUS[p.status].tone}>{PERIOD_STATUS[p.status].label}</Badge>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {!cancelled && (
        canManage ? (
          <CardBody className="flex flex-wrap items-end gap-3 border-t border-default">
            <Field
              label="Change quantity"
              htmlFor={`sub-qty-${subscription.id}`}
              className="w-[130px]"
              hint="Prorated for the days left in this period."
            >
              <Input
                id={`sub-qty-${subscription.id}`}
                align="right"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(sanitiseInteger(e.target.value))}
              />
            </Field>
            <Button variant="primary" disabled={!canApply || busy} onClick={() => onChange(next)}>
              {busy ? 'Working…' : 'Apply change'}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              className="ml-auto"
              onClick={() => onCancel('Cancelled by finance')}
            >
              Cancel subscription
            </Button>
          </CardBody>
        ) : (
          <CardBody className="border-t border-default">
            <p className="text-[13px] text-muted">
              Subscription changes are handled by finance.
            </p>
          </CardBody>
        )
      )}
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</dt>
      <dd className="text-sm font-semibold text-ink tnum">{value}</dd>
    </div>
  )
}

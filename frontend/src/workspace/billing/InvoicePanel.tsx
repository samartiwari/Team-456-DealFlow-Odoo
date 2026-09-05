import { useState } from 'react'
import type { Invoice } from '@/shared/api/types'
import { dateTime, money } from '@/shared/lib/format'
import { sanitisePercent } from '@/shared/lib/numericInput'
import {
  Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input,
  TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { INVOICE_STATUS } from './status'

/**
 * The one-time half of the order: what is billed today.
 *
 * The status badge is the point of Quick-Test step 8 — record a payment and it
 * moves on its own, because the server recomputes it from the payments. There
 * is no control here that could set it directly.
 */
export function InvoicePanel({
  invoice,
  currency,
  canPay,
  actorName,
  busy,
  onPay,
}: {
  invoice: Invoice
  currency: string
  /** Finance and admin only, per the permission matrix. */
  canPay: boolean
  actorName: string
  busy: boolean
  onPay: (amount: number, reference: string) => void
}) {
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')

  const settled = invoice.outstanding === 0
  const value = Number(amount)
  const canSubmit = amount.trim() !== '' && Number.isFinite(value) && value > 0 && value <= invoice.outstanding

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Invoice {invoice.ref}</CardTitle>
        <Badge tone={INVOICE_STATUS[invoice.status].tone}>
          {INVOICE_STATUS[invoice.status].label}
        </Badge>
      </CardHeader>

      <CardBody className="border-b border-default">
        <p className="text-[13px] text-muted">
          Billed once, today. Issued {dateTime(invoice.issuedAt)}.
        </p>
      </CardBody>

      <Table>
        <THead>
          <TR>
            <TH>Line</TH>
            <TH numeric>Qty</TH>
            <TH numeric>Unit</TH>
            <TH numeric>Discount</TH>
            <TH numeric>Net</TH>
          </TR>
        </THead>
        <TBody>
          {invoice.lines.map((l) => (
            <TR key={l.id} hover>
              <TD>
                <span className="block text-[13px] font-medium text-ink">{l.description}</span>
                {/* A prorated line came from a mid-period change, not the original
                    order. Saying so stops it reading as a mystery charge. */}
                {l.proration && (
                  <span className="text-[11px] font-medium text-warning-tx">Mid-period adjustment</span>
                )}
              </TD>
              <TD numeric className="text-ink-2">{l.quantity}</TD>
              <TD numeric className="text-ink-2">{money(l.unitPrice, currency)}</TD>
              <TD numeric className="text-muted">
                {l.discountPct > 0 ? `${l.discountPct}%` : '—'}
              </TD>
              <TD numeric className="font-medium text-ink">{money(l.netTotal, currency)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <CardBody className="border-t border-default">
        <dl className="flex flex-col gap-2">
          <Row label="Total" value={money(invoice.total, currency)} />
          <Row label="Paid" value={money(invoice.paid, currency)} />
          {invoice.creditNotes.length > 0 && (
            <Row
              label={`Credited (${invoice.creditNotes.map((c) => c.ref).join(', ')})`}
              value={`− ${money(invoice.creditNotes.reduce((s, c) => s + c.amount, 0), currency)}`}
            />
          )}
          <div className="flex items-baseline justify-between gap-3 border-t border-default pt-2">
            <dt className="text-sm font-semibold text-ink">Outstanding</dt>
            <dd className={`text-lg font-bold tnum ${settled ? 'text-success-tx' : 'text-ink'}`}>
              {money(invoice.outstanding, currency)}
            </dd>
          </div>
        </dl>
      </CardBody>

      {invoice.payments.length > 0 && (
        <CardBody className="border-t border-default">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Payments</p>
          <ul className="flex flex-col gap-1.5">
            {invoice.payments.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-ink-2">
                  {p.recordedByName}
                  {p.reference && <span className="text-muted"> · {p.reference}</span>}
                  <span className="text-muted"> · {dateTime(p.recordedAt)}</span>
                </span>
                <span className="font-medium text-ink tnum">{money(p.amount, currency)}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      )}

      {!settled && (
        canPay ? (
          <CardBody className="flex flex-wrap items-end gap-3 border-t border-default">
            <Field label="Amount" htmlFor="pay-amount" className="w-[150px]">
              <Input
                id="pay-amount"
                align="right"
                inputMode="decimal"
                placeholder={String(invoice.outstanding)}
                value={amount}
                onChange={(e) => setAmount(sanitisePercent(e.target.value))}
              />
            </Field>
            <Field label="Reference" htmlFor="pay-ref" className="min-w-[180px] flex-1">
              <Input
                id="pay-ref"
                placeholder="NEFT / cheque number"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <Button
              variant="primary"
              disabled={!canSubmit || busy}
              onClick={() => { onPay(value, reference); setAmount(''); setReference('') }}
            >
              {busy ? 'Recording…' : 'Record payment'}
            </Button>
            <Button
              disabled={busy}
              onClick={() => setAmount(String(invoice.outstanding))}
            >
              Pay in full
            </Button>
          </CardBody>
        ) : (
          <CardBody className="border-t border-default">
            <p className="text-[13px] text-muted">
              Payments are recorded by finance. You are signed in as{' '}
              <b className="text-ink">{actorName}</b>.
            </p>
          </CardBody>
        )
      )}
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-[13px] text-ink-2 tnum">{value}</dd>
    </div>
  )
}

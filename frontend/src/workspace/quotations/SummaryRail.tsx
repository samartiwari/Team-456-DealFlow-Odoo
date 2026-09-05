import { useState } from 'react'
import type { RecomputeResult } from '@/shared/api/types'
import { useDebouncedCallback } from '@/shared/hooks/useDebouncedCallback'
import { money, percent } from '@/shared/lib/format'
import {
  Button, Card, CardBody, CardHeader, CardTitle, ChainPreview, Field, Input, RiskBadge,
} from '@/shared/ui'

export function SummaryRail({
  quote,
  disabled,
  confirming,
  onOrderDiscount,
  onConfirm,
}: {
  quote: RecomputeResult
  disabled: boolean
  confirming: boolean
  onOrderDiscount: (pct: number) => void
  onConfirm: () => void
}) {
  const [draft, setDraft] = useState(String(quote.orderDiscountPct))
  const [seen, setSeen] = useState(quote.orderDiscountPct)
  if (seen !== quote.orderDiscountPct) {
    setSeen(quote.orderDiscountPct)
    setDraft(String(quote.orderDiscountPct))
  }

  const push = useDebouncedCallback((value: number) => onOrderDiscount(value), 250)

  const canConfirm = quote.lines.length > 0 && (quote.stage === 'DRAFT' || quote.stage === 'RETURNED')

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Order</CardTitle>
          <RiskBadge score={quote.riskScore} chain={quote.requiredChain} />
        </CardHeader>

        <CardBody className="flex flex-col gap-4">
          <Field
            label="Order discount %"
            htmlFor="order-discount"
            hint="Applied to every line before its ceiling is checked."
          >
            <Input
              id="order-discount"
              align="right"
              inputMode="decimal"
              value={draft}
              disabled={disabled}
              onChange={(e) => {
                const next = e.target.value.replace(/[^0-9.]/g, '')
                setDraft(next)
                const n = Number(next)
                if (next !== '' && Number.isFinite(n) && n >= 0 && n <= 100) push(n)
              }}
              onBlur={() => setDraft(String(quote.orderDiscountPct))}
            />
          </Field>

          <dl className="flex flex-col gap-2 border-t border-default pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] text-muted">Subtotal</dt>
              <dd className="text-[13px] text-ink-2 tnum">{money(quote.subtotal, quote.currency)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] text-muted">Margin</dt>
              <dd className="text-[13px] font-medium text-ink tnum">{percent(quote.marginPct)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-default pt-2">
              <dt className="text-sm font-semibold text-ink">Total</dt>
              <dd className="text-lg font-bold text-ink tnum">
                {money(quote.grandTotal, quote.currency)}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approval</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <ChainPreview chain={quote.requiredChain} />

          {/* The rep presses Confirm. Routing is the system's decision, not theirs. */}
          <Button
            variant="primary"
            disabled={disabled || confirming || !canConfirm}
            onClick={onConfirm}
            className="w-full"
          >
            {confirming ? 'Confirming…' : 'Confirm quotation'}
          </Button>

          {!canConfirm && quote.lines.length > 0 && (
            <p className="text-[12px] text-muted">
              This quotation is {quote.stage.toLowerCase().replace(/_/g, ' ')} and can no longer be
              confirmed.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

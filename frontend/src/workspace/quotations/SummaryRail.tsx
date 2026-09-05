import { useState } from 'react'
import type { RecomputeResult } from '@/shared/api/types'
import { useDebouncedCallback } from '@/shared/hooks/useDebouncedCallback'
import { money, percent } from '@/shared/lib/format'
import { isCommittablePercent, sanitisePercent } from '@/shared/lib/numericInput'
import {
  Button, Card, CardBody, CardHeader, CardTitle, ChainPreview, Field, Input, RiskBadge,
} from '@/shared/ui'

export function SummaryRail({
  quote,
  locked,
  busy,
  confirming,
  onOrderDiscount,
  onConfirm,
}: {
  quote: RecomputeResult
  locked: boolean
  busy: boolean
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
              readOnly={locked}
              onChange={(e) => {
                const next = sanitisePercent(e.target.value)
                setDraft(next)
                const n = Number(next)
                if (isCommittablePercent(next, n)) push(n)
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
            disabled={locked || busy || confirming || !canConfirm}
            onClick={onConfirm}
            className="w-full"
          >
            {confirming ? 'Confirming…' : 'Confirm quotation'}
          </Button>

        </CardBody>
      </Card>
    </div>
  )
}

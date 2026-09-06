import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { QuotationStage, RecomputeResult } from '@/shared/api/types'
import { useDebouncedCallback } from '@/shared/hooks/useDebouncedCallback'
import { money, percent } from '@/shared/lib/format'
import { isCommittablePercent, sanitisePercent } from '@/shared/lib/numericInput'
import {
  Button, Card, CardBody, CardHeader, CardTitle, ChainPreview, Field, Input, RiskBadge,
} from '@/shared/ui'

/**
 * What the Approval card says once confirming is behind it.
 *
 * Every stage that is not the rep's to act on gets a sentence naming who has it,
 * so the card reports a position rather than offering an action that is gone.
 */
const WHERE_IT_STANDS: Record<QuotationStage, string> = {
  DRAFT: '',
  RETURNED: '',
  PENDING_APPROVAL: 'Confirmed and waiting on an approver. The queue decides next.',
  APPROVED: 'Approved. Send it to the customer when you are ready.',
  SENT: 'With the customer. Anything they counter is re-scored automatically.',
  UNDER_NEGOTIATION: 'The customer has countered. The terms are still being settled.',
  CONFIRMED: 'The customer has accepted. This deal is agreed.',
  REJECTED: 'Rejected by an approver. Create a new quotation to quote different terms.',
}

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

  const open = quote.stage === 'DRAFT' || quote.stage === 'RETURNED'
  const canConfirm = open && quote.lines.length > 0

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
          {/*
            Only offer the action while it is available. This card used to render
            the same way at every stage, so a quotation already in approval showed
            "Confirming will route to..." above a permanently dead button, with
            nothing saying why. A control that can never be pressed is worse than
            no control: it reads as a broken screen rather than a finished step.
          */}
          {open ? (
            <>
              <ChainPreview chain={quote.requiredChain} />

              {quote.lines.length === 0 && (
                <p className="text-[13px] text-muted">
                  Add a product before confirming.
                </p>
              )}

              {/* The rep presses Confirm. Routing is the system's decision, not theirs. */}
              <Button
                variant="primary"
                disabled={locked || busy || confirming || !canConfirm}
                onClick={onConfirm}
                className="w-full"
              >
                {confirming ? 'Confirming…' : 'Confirm quotation'}
              </Button>
            </>
          ) : (
            <>
              {/* The chain stays visible after confirming: knowing a deal needs
                  Finance as well as a manager is as useful while you wait as it
                  was before you pressed the button. */}
              <ChainPreview chain={quote.requiredChain} />
              <p className="text-[13px] text-muted">{WHERE_IT_STANDS[quote.stage]}</p>

              {/* And a way to get there. Saying a deal is waiting on an approver
                  while offering no route to the approval is how an approver lands
                  on a page where nothing can be done. */}
              {quote.openApprovalId !== null && (
                <Link
                  to={`/app/approvals/${quote.openApprovalId}`}
                  className="inline-flex w-full items-center justify-center rounded-control border border-default px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-hover"
                >
                  Open the approval
                </Link>
              )}
            </>
          )}

        </CardBody>
      </Card>
    </div>
  )
}

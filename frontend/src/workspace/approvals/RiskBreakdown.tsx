import type { RecomputeResult } from '@/shared/api/types'
import { amount, percent, points } from '@/shared/lib/format'
import {
  Card, CardBody, CardHeader, CardTitle, LineChip, RiskBadge,
  TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'

/**
 * The evidence behind the score. Showing a risk number without showing which
 * lines produced it is the most common way this screen loses marks — every
 * column here is a value the server returned, never a comparison computed
 * in the client.
 */
export function RiskBreakdown({ quote, score }: { quote: RecomputeResult; score: number }) {
  const over = quote.lines.filter((l) => l.overagePts > 0)
  const worst = quote.lines.reduce((m, l) => Math.max(m, l.overagePts), 0)

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Why this was flagged</CardTitle>
        <RiskBadge score={score} chain={quote.requiredChain} />
      </CardHeader>

      <CardBody className="border-b border-default">
        <p className="text-[13px] text-muted">
          Every line is checked against <b className="text-ink">its own</b> ceiling — the stricter
          of the customer&rsquo;s tier cap and the product category&rsquo;s cap — never one
          order-wide limit.
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">
              Lines over ceiling
            </dt>
            <dd className="text-sm font-semibold text-ink tnum">
              {over.length} of {quote.lines.length}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">
              Worst single line
            </dt>
            <dd className="text-sm font-semibold text-ink tnum">{points(worst)} over</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">
              Order value
            </dt>
            <dd className="text-sm font-semibold text-ink tnum">
              {amount(quote.grandTotal)} {quote.currency}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">Margin</dt>
            <dd className="text-sm font-semibold text-ink tnum">{percent(quote.marginPct)}</dd>
          </div>
        </dl>
      </CardBody>

      <Table>
        <THead>
          <TR>
            <TH>Line</TH>
            <TH numeric>Given</TH>
            <TH numeric>Allowed</TH>
            <TH numeric>Over by</TH>
            <TH numeric>Weight</TH>
            <TH numeric>Net</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {quote.lines.map((l) => (
            <TR key={l.id} hover>
              <TD>
                <span className="block text-[13px] font-medium text-ink">{l.productName}</span>
                <span className="block text-[12px] text-muted">{l.category}</span>
              </TD>
              <TD numeric className={l.overagePts > 0 ? 'font-medium text-ink' : undefined}>
                {percent(l.effectiveDiscountPct)}
              </TD>
              <TD numeric className="text-muted">{percent(l.allowedDiscountPct)}</TD>
              <TD numeric className={l.overagePts > 0 ? 'font-semibold text-warning-tx' : 'text-muted'}>
                {l.overagePts > 0 ? points(l.overagePts) : '—'}
              </TD>
              {/* Weight is why a big line matters more than a small one. */}
              <TD numeric className="text-muted">{percent(l.weightPct)}</TD>
              <TD numeric>{amount(l.netTotal)}</TD>
              <TD><LineChip overagePts={l.overagePts} /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  )
}

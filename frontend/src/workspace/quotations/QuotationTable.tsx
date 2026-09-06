import type { QuotationSummary } from '@/shared/api/types'
import { money } from '@/shared/lib/format'
import { STAGE_LABEL, STAGE_TONE } from '@/shared/lib/stage'
import { Badge, TBody, TD, TH, THead, TR, Table } from '@/shared/ui'

/**
 * The quotations table, lifted out of QuotationsPage so the pipeline's table
 * view renders the exact same rows (Phase 13 §3.4). A column added here lands
 * in both places rather than drifting between two forks.
 */
export function QuotationTable({
  rows,
  onRowClick,
}: {
  rows: QuotationSummary[]
  onRowClick: (id: number) => void
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Reference</TH>
          <TH>Customer</TH>
          <TH>Stage</TH>
          <TH numeric>Total</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((q) => (
          <TR
            key={q.id}
            hover
            className="cursor-pointer"
            onClick={() => onRowClick(q.id)}
          >
            <TD className="font-medium text-ink">{q.ref}</TD>
            <TD>{q.customerName}</TD>
            <TD>
              <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={STAGE_TONE[q.stage]}>{STAGE_LABEL[q.stage]}</Badge>
                  {/* The stage says where governance stands; this says the ball is
                      with us. Without it a counter is only found by opening the
                      quotation that received it. */}
                  {q.customerCountered && <Badge tone="warning">Customer replied</Badge>}
                </span>
            </TD>
            <TD numeric className="font-medium text-ink">
              {money(q.grandTotal, q.currency)}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}

import { useNavigate } from 'react-router-dom'
import type { FulfilmentOrder, FulfilmentStatus } from '@/shared/api/types'
import { money } from '@/shared/lib/format'
import { Badge, EmptyState, TBody, TD, TH, THead, TR, Table } from '@/shared/ui'
import type { Tone } from '@/shared/ui/Badge'

const STATUS: Record<FulfilmentStatus, { label: string; tone: Tone }> = {
  AWAITING_SPLIT: { label: 'Split pending', tone: 'info' },
  SPLIT_ACCEPTED: { label: 'Split accepted', tone: 'success' },
  BACKORDER: { label: 'Backorder', tone: 'warning' },
}

/**
 * Everything approved and not yet shipped. Clicking a row opens its warehouse
 * split, which is where the decision actually gets made.
 */
export function OrderQueue({ orders }: { orders: FulfilmentOrder[] }) {
  const navigate = useNavigate()

  if (orders.length === 0) {
    return (
      <EmptyState
        title="Nothing awaiting fulfilment"
        description="Approve a quotation and it appears here for a warehouse split."
      />
    )
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Order</TH>
          <TH>Customer</TH>
          <TH>Status</TH>
          <TH>Warehouses</TH>
          <TH numeric>Value</TH>
        </TR>
      </THead>
      <TBody>
        {orders.map((o) => (
          <TR
            key={o.quotationId}
            hover
            className="cursor-pointer"
            onClick={() => navigate(`/app/quotations/${o.quotationId}/fulfilment`)}
          >
            <TD className="font-medium text-ink">{o.ref}</TD>
            <TD>{o.customerName}</TD>
            <TD>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
                {o.backorderedUnits > 0 && (
                  <span className="text-[12px] text-warning-tx tnum">
                    {o.backorderedUnits} short
                  </span>
                )}
              </div>
            </TD>
            <TD className="text-ink-2">
              {/* Empty until a split is accepted — a suggestion commits nothing,
                  so naming warehouses here would overstate what has been decided. */}
              {o.warehouseNames.length > 0
                ? o.warehouseNames.join(' + ')
                : <span className="text-muted">not yet split</span>}
            </TD>
            <TD numeric className="font-medium text-ink">{money(o.grandTotal, o.currency)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}

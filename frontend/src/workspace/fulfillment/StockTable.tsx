import type { StockRow } from '@/shared/api/types'
import { Badge, EmptyState, TBody, TD, TH, THead, TR, Table } from '@/shared/ui'

/**
 * Live stock, one row per warehouse-and-product pair.
 *
 * Available is the number that matters: on-hand says what is on the shelf,
 * but a unit already committed to an accepted split cannot be promised to
 * anyone else, so a split is planned against available rather than on-hand.
 */
export function StockTable({ rows }: { rows: StockRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No stock on record"
        description="Warehouses hold no stock rows yet."
      />
    )
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Warehouse</TH>
          <TH>Product</TH>
          <TH numeric>In stock</TH>
          <TH numeric>Reserved</TH>
          <TH numeric>Available</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={`${r.warehouseId}-${r.productId}`} hover>
            <TD className="font-medium text-ink">{r.warehouseName}</TD>
            <TD>{r.productName}</TD>
            <TD numeric className="text-ink-2">{r.onHand}</TD>
            <TD numeric className={r.reserved > 0 ? 'font-medium text-warning-tx' : 'text-muted'}>
              {r.reserved}
            </TD>
            <TD numeric>
              {/* Nothing left to promise is worth seeing at a glance — it is the
                  reason the next order for this product will split or backorder. */}
              {r.available === 0 ? (
                <Badge tone="danger">None free</Badge>
              ) : (
                <span className="font-semibold text-ink tnum">{r.available}</span>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}

import type { AllocationLine } from '@/shared/api/types'
import { EmptyState, TBody, TD, TH, THead, TR, Table } from '@/shared/ui'

/**
 * One row per warehouse-and-product pair — never one per product.
 *
 * A single product can be split across several warehouses, and that split is
 * the whole point of this screen: six laptops come back as two rows sharing
 * one productId. Rows are keyed on productId + warehouseId for exactly that
 * reason; keying on the product alone would collapse them.
 */
export function AllocationTable({ lines }: { lines: AllocationLine[] }) {
  if (lines.length === 0) {
    return (
      <EmptyState
        title="Nothing to ship"
        description="No stock could be allocated. Check the backorders below."
      />
    )
  }

  const total = lines.reduce((sum, l) => sum + l.quantity, 0)

  return (
    <Table>
      <THead>
        <TR>
          <TH>Product</TH>
          <TH>Ships from</TH>
          <TH numeric>Quantity</TH>
        </TR>
      </THead>
      <TBody>
        {lines.map((l) => (
          <TR key={`${l.productId}-${l.warehouseId}`} hover>
            <TD className="font-medium text-ink">{l.productName}</TD>
            <TD>{l.warehouseName}</TD>
            <TD numeric className="font-medium text-ink">{l.quantity}</TD>
          </TR>
        ))}
        <TR>
          <TD className="font-semibold text-ink">Total units</TD>
          <TD />
          <TD numeric className="font-semibold text-ink">{total}</TD>
        </TR>
      </TBody>
    </Table>
  )
}

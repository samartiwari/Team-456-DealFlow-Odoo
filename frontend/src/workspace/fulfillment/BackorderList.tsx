import type { Backorder } from '@/shared/api/types'
import { Card, CardBody, CardHeader, CardTitle, TBody, TD, TH, THead, TR, Table } from '@/shared/ui'
import { dateTime } from '@/shared/lib/format'

/** Only rendered when stock could not cover the order. */
export function BackorderList({ backorders }: { backorders: Backorder[] }) {
  if (backorders.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Backordered</CardTitle>
        <span className="text-[12px] text-muted">
          {backorders.length} line{backorders.length === 1 ? '' : 's'} awaiting stock
        </span>
      </CardHeader>

      <CardBody className="border-b border-default">
        <p className="text-[13px] text-muted">
          Stock on hand could not cover these. The promised date is today plus that
          warehouse&rsquo;s replenishment window.
        </p>
      </CardBody>

      <Table>
        <THead>
          <TR>
            <TH>Product</TH>
            <TH numeric>Short by</TH>
            <TH numeric>Promised</TH>
          </TR>
        </THead>
        <TBody>
          {backorders.map((b) => (
            <TR key={b.productId} hover>
              <TD className="font-medium text-ink">{b.productName}</TD>
              <TD numeric className="font-semibold text-warning-tx">{b.quantity}</TD>
              <TD numeric className="text-muted">{dateTime(b.promisedDate).split(',')[0]}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  )
}

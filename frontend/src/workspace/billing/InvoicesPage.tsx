import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { listInvoices } from '@/shared/api/endpoints'
import { dateTime, money } from '@/shared/lib/format'
import {
  Badge, Card, EmptyState, ErrorState, PageHeader, Spinner,
  TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { INVOICE_STATUS } from './status'

/**
 * Every invoice the system has raised — the one-time invoice each order issues
 * on approval, plus one per billing period the clock has closed.
 */
export default function InvoicesPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['invoices'],
    queryFn: listInvoices,
  })

  const outstanding = (data ?? []).reduce((sum, i) => sum + i.outstanding, 0)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Invoices"
        description="Raised on approval, and again each time a billing period closes."
        actions={
          data && data.length > 0 ? (
            <Badge tone={outstanding > 0 ? 'warning' : 'success'}>
              {outstanding > 0 ? `${money(outstanding)} outstanding` : 'All settled'}
            </Badge>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6" />
          </div>
        )}

        {isError && (
          <ErrorState
            title="Could not load invoices"
            description={
              error instanceof ApiError
                ? error.message
                : 'Check that the backend is running, or switch VITE_USE_MOCKS back on.'
            }
          />
        )}

        {data?.length === 0 && (
          <EmptyState
            title="No invoices yet"
            description="Approve a quotation and its invoice is raised automatically."
          />
        )}

        {data && data.length > 0 && (
          <Table>
            <THead>
              <TR>
                <TH>Invoice</TH>
                <TH>Order</TH>
                <TH>Status</TH>
                <TH numeric>Total</TH>
                <TH numeric>Outstanding</TH>
                <TH numeric>Issued</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((inv) => (
                <TR
                  key={inv.id}
                  hover
                  className="cursor-pointer"
                  onClick={() => navigate(`/app/invoices/${inv.id}`)}
                >
                  <TD className="font-medium text-ink">{inv.ref}</TD>
                  <TD className="text-ink-2">Q-{String(inv.quotationId).padStart(4, '0')}</TD>
                  <TD>
                    <Badge tone={INVOICE_STATUS[inv.status].tone}>
                      {INVOICE_STATUS[inv.status].label}
                    </Badge>
                  </TD>
                  <TD numeric className="text-ink-2">{money(inv.total)}</TD>
                  <TD numeric className={inv.outstanding > 0 ? 'font-medium text-ink' : 'text-muted'}>
                    {money(inv.outstanding)}
                  </TD>
                  <TD numeric className="text-muted">{dateTime(inv.issuedAt).split(',')[0]}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

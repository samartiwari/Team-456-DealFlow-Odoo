import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { listProducts } from '@/shared/api/endpoints'
import { money, percent } from '@/shared/lib/format'
import {
  Badge, Card, EmptyState, ErrorState, PageHeader, Spinner,
  TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'

/**
 * A2 — the catalog, read-only.
 *
 * The price shown here is the base price. What a given customer pays is
 * resolved on the server from their tier's price list, and appears on the
 * quotation line — never computed by a screen.
 */
export default function CatalogPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['products'],
    queryFn: listProducts,
    staleTime: Infinity,
  })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Products"
        description="Base prices. What a customer pays depends on their tier's price list."
        actions={
          <div className="flex items-center gap-3">
            {data && <Badge tone="neutral">{data.length} products</Badge>}
            <Link
              to="/app/price-lists"
              className="rounded-control border border-default px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-hover"
            >
              Price lists
            </Link>
          </div>
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
            title="Could not load the catalog"
            description={
              error instanceof ApiError
                ? error.message
                : 'Check that the backend is running, or switch VITE_USE_MOCKS back on.'
            }
          />
        )}

        {data?.length === 0 && <EmptyState title="No products in the catalog" />}

        {data && data.length > 0 && (
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Category</TH>
                <TH numeric>Base price</TH>
                <TH numeric>Max discount</TH>
                <TH>Fulfilment</TH>
                <TH>Billing</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((p) => (
                <TR
                  key={p.id}
                  hover
                  className="cursor-pointer"
                  onClick={() => navigate(`/app/products/${p.id}`)}
                >
                  <TD className="font-medium text-ink">{p.name}</TD>
                  <TD className="text-ink-2">{p.category}</TD>
                  <TD numeric className="font-medium text-ink">{money(p.unitPrice)}</TD>
                  <TD numeric className="text-muted">
                    {/* Null is not zero: no ceiling of its own means the tier cap applies. */}
                    {p.categoryCeilingPct === null ? 'tier cap' : percent(p.categoryCeilingPct, 0)}
                  </TD>
                  <TD>
                    <Badge tone={p.stockable ? 'neutral' : 'info'}>
                      {p.stockable ? 'Shipped' : 'Delivered'}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={p.recurring ? 'warning' : 'neutral'}>
                      {p.recurring ? 'Recurring' : 'One-time'}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

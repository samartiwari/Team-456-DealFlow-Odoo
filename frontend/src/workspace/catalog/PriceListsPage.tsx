import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { listPriceLists } from '@/shared/api/endpoints'
import { money } from '@/shared/lib/format'
import {
  Badge, Card, CardBody, CardHeader, CardTitle, ErrorState, PageHeader, Spinner,
  TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'

/**
 * A2 — what each tier is published at, read-only.
 *
 * Every row carries the base price beside the listed one, because the delta is
 * the whole story: a list is a commercial agreement, and seeing only its price
 * says nothing about what it agreed to.
 */
export default function PriceListsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['price-lists'],
    queryFn: listPriceLists,
    staleTime: Infinity,
  })

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/app/products"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
      >
        <span aria-hidden="true">&larr;</span> Products
      </Link>

      <PageHeader
        title="Price lists"
        description="What each tier is published at. Anything a list does not name falls through to the base price."
      />

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Could not load price lists"
          description={
            error instanceof ApiError
              ? error.message
              : 'Check that the backend is running, or switch VITE_USE_MOCKS back on.'
          }
        />
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((list) => (
            <Card key={list.id} className="overflow-hidden">
              <CardHeader>
                <CardTitle>{list.name}</CardTitle>
                <div className="flex items-center gap-2">
                  {list.tier && <Badge tone="info">{list.tier}</Badge>}
                  {!list.active && <Badge tone="neutral">Inactive</Badge>}
                </div>
              </CardHeader>
              <Table>
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH numeric>This tier pays</TH>
                    <TH numeric>Base</TH>
                    <TH numeric>Difference</TH>
                  </TR>
                </THead>
                <TBody>
                  {list.items.map((i) => <ItemRow key={i.productId} item={i} onOpen={() => navigate(`/app/products/${i.productId}`)} />)}
                </TBody>
              </Table>
            </Card>
          ))}

          {/* Gold's absence is a decision, so it is stated rather than left blank. */}
          <Card>
            <CardHeader>
              <CardTitle>Gold</CardTitle>
              <Badge tone="success">Base price</Badge>
            </CardHeader>
            <CardBody className="flex flex-col gap-2">
              <p className="text-[13px] text-ink-2">
                Gold has no price list, and that is not an omission. The base price is the
                keenest rate in the system — the largest customers are already on it.
              </p>
              <p className="text-[13px] text-muted">
                Their advantage shows up again in a wider discount ceiling: 15% against
                Bronze&rsquo;s 5%. Price and ceiling are separate mechanisms, and both move
                with the tier.
              </p>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}

function ItemRow({
  item,
  onOpen,
}: {
  item: { productId: number; productName: string; unitPrice: number; basePrice: number }
  onOpen: () => void
}) {
  const delta = item.unitPrice - item.basePrice
  const pct = item.basePrice === 0 ? 0 : Math.round((delta / item.basePrice) * 1000) / 10

  return (
    <TR hover className="cursor-pointer" onClick={onOpen}>
      <TD className="font-medium text-ink">{item.productName}</TD>
      <TD numeric className="font-semibold text-ink">{money(item.unitPrice)}</TD>
      <TD numeric className="text-muted">{money(item.basePrice)}</TD>
      <TD numeric className={delta > 0 ? 'font-medium text-warning-tx' : 'text-muted'}>
        {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${pct}%`}
      </TD>
    </TR>
  )
}

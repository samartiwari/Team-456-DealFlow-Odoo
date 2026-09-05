import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { getProduct, listPriceLists } from '@/shared/api/endpoints'
import { money, percent } from '@/shared/lib/format'
import {
  Badge, Card, CardBody, CardHeader, CardTitle, ErrorState, PageHeader, Spinner,
  TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'

/**
 * One product, read-only.
 *
 * The tier table is Gate 4 on a single screen: the same product at three
 * prices, with the reason beside each. Gold's row is the base price and that is
 * not an omission — it is the keenest rate in the system.
 */
export default function ProductDetailPage() {
  const { id: param } = useParams()
  const id = Number(param)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['product', id],
    queryFn: () => getProduct(id),
    enabled: Number.isFinite(id),
    retry: false,
  })

  const lists = useQuery({
    queryKey: ['price-lists'],
    queryFn: listPriceLists,
    staleTime: Infinity,
  })

  const back = (
    <Link
      to="/app/products"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
    >
      <span aria-hidden="true">&larr;</span> All products
    </Link>
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorState
          title="Could not load this product"
          description={error instanceof ApiError ? error.message : 'It may have been withdrawn.'}
        />
      </div>
    )
  }

  /** What each tier pays: their list where it names this product, else the base. */
  const byTier = (['BRONZE', 'SILVER', 'GOLD'] as const).map((tier) => {
    const list = lists.data?.find((l) => l.tier === tier && l.active)
    const item = list?.items.find((i) => i.productId === data.id)
    return {
      tier,
      listName: item ? list!.name : null,
      unitPrice: item?.unitPrice ?? data.unitPrice,
    }
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        {back}
        <PageHeader
          title={data.name}
          description={data.category}
          actions={
            <div className="flex items-center gap-2">
              <Badge tone={data.stockable ? 'neutral' : 'info'}>
                {data.stockable ? 'Shipped' : 'Delivered'}
              </Badge>
              <Badge tone={data.recurring ? 'warning' : 'neutral'}>
                {data.recurring ? 'Recurring' : 'One-time'}
              </Badge>
            </div>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>What each tier pays</CardTitle>
            <span className="text-[12px] text-muted">base &rarr; price list</span>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Tier</TH>
                <TH numeric>Unit price</TH>
                <TH>Why</TH>
              </TR>
            </THead>
            <TBody>
              {byTier.map((row) => (
                <TR key={row.tier} hover>
                  <TD className="font-medium text-ink">{row.tier}</TD>
                  <TD numeric className="font-semibold text-ink">{money(row.unitPrice)}</TD>
                  <TD className="text-[12px] text-muted">
                    {row.listName ? `${row.listName} price list` : 'base price — no list'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <CardBody className="border-t border-default">
            <p className="text-[12px] text-muted">
              Gold sits on the base price on purpose: it is the keenest rate in the system,
              and Gold&rsquo;s advantage shows again in a wider discount ceiling. Smaller
              tiers sit on published lists above it.
            </p>
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Also available as</CardTitle>
            <span className="text-[12px] text-muted">product_variant</span>
          </CardHeader>
          {data.variants.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">
                This product comes in one shape only.
              </p>
            </CardBody>
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Variant</TH>
                    <TH numeric>Unit price</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.variants.map((v) => (
                    <TR key={v.id} hover>
                      <TD className="font-medium text-ink">{v.name}</TD>
                      <TD numeric className="text-ink">{money(v.unitPrice)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <CardBody className="border-t border-default">
                {/* A quotation line takes a productId and nothing else, so offering a
                    variant picker here would post something the API rejects. */}
                <p className="text-[12px] text-muted">
                  Shown for reference. A quotation line carries the product, not the variant
                  &mdash; selecting one on a quote arrives later.
                </p>
              </CardBody>
            </>
          )}
        </Card>
      </div>

      <Card>
        <CardBody className="flex flex-wrap gap-x-8 gap-y-3">
          <Fact label="Base price" value={money(data.unitPrice)} />
          <Fact
            label="Category ceiling"
            value={data.categoryCeilingPct === null ? 'tier cap' : percent(data.categoryCeilingPct, 0)}
          />
          <Fact label="Category" value={data.category} />
        </CardBody>
      </Card>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="text-sm font-semibold text-ink tnum">{value}</p>
    </div>
  )
}

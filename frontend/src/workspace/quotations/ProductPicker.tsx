import { useQuery } from '@tanstack/react-query'
import { listProducts } from '@/shared/api/endpoints'
import { money } from '@/shared/lib/format'
import { Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState, Spinner } from '@/shared/ui'

export function ProductPicker({
  onAdd,
  busy,
}: {
  onAdd: (productId: number) => void
  busy: boolean
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['products'],
    queryFn: listProducts,
    staleTime: Infinity,
  })

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Products</CardTitle>
      </CardHeader>

      {isLoading && (
        <CardBody className="flex justify-center py-8">
          <Spinner />
        </CardBody>
      )}

      {isError && (
        <ErrorState
          title="Could not load products"
          description={error instanceof Error ? error.message : undefined}
        />
      )}

      {data && data.length === 0 && <EmptyState title="No products in the catalog" />}

      {data && data.length > 0 && (
        <ul className="flex flex-col">
          {data.map((p) => (
            <li key={p.id} className="border-b border-default last:border-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => onAdd(p.id)}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-hover disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                  <span className="block text-[12px] text-muted">
                    {p.category}
                    {p.categoryCeilingPct !== null && ` · max ${p.categoryCeilingPct}%`}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] text-ink-2 tnum">{money(p.unitPrice)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

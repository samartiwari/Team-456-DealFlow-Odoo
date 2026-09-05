import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getProduct, listProducts } from '@/shared/api/endpoints'
import type { ProductDetail } from '@/shared/api/types'
import { money } from '@/shared/lib/format'
import { Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState, Spinner } from '@/shared/ui'

export function ProductPicker({
  onAdd,
  busy,
}: {
  onAdd: (productId: number, variantId?: number) => void
  busy: boolean
}) {
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['products'],
    queryFn: listProducts,
    staleTime: Infinity,
  })

  /**
   * The product whose shapes are open, if any.
   *
   * The catalog list does not say whether a product has variants, so this is
   * settled on click: fetch the detail, and if it comes back with more than one
   * shape, ask which. Anything with a single shape or none is added straight
   * away, because a chooser with one option is a click that answers itself.
   */
  const [choosing, setChoosing] = useState<ProductDetail | null>(null)
  const [pending, setPending] = useState<number | null>(null)

  const pick = async (productId: number) => {
    setPending(productId)
    try {
      const detail = await qc.fetchQuery({
        queryKey: ['product', productId],
        queryFn: () => getProduct(productId),
        staleTime: Infinity,
      })
      if (detail.variants.length > 1) setChoosing(detail)
      else onAdd(productId)
    } catch {
      // The detail is only needed to offer a choice. If it cannot be had, add
      // the plain product rather than refusing to add anything at all.
      onAdd(productId)
    } finally {
      setPending(null)
    }
  }

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
                disabled={busy || pending === p.id}
                onClick={() => void pick(p.id)}
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

              {choosing?.id === p.id && (
                <VariantChoice
                  detail={choosing}
                  busy={busy}
                  onPick={(variantId) => {
                    setChoosing(null)
                    onAdd(p.id, variantId)
                  }}
                  onCancel={() => setChoosing(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * Which shape of the product.
 *
 * The prices here are the variants' own. What the customer actually pays is
 * resolved on the server and comes back on the line, and for a tier that
 * publishes a list price it will be that instead — so these read as the shapes
 * on offer rather than as a quote.
 */
function VariantChoice({
  detail,
  busy,
  onPick,
  onCancel,
}: {
  detail: ProductDetail
  busy: boolean
  onPick: (variantId: number) => void
  onCancel: () => void
}) {
  return (
    <div className="border-t border-default bg-subtle px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
          Which one?
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>

      <ul className="mt-2 flex flex-col gap-1">
        {detail.variants.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPick(v.id)}
              className="flex w-full items-center justify-between gap-3 rounded-control px-2.5 py-2 text-left text-[13px] hover:bg-hover disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="text-ink">{v.name}</span>
              <span className="text-ink-2 tnum">{money(v.unitPrice)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

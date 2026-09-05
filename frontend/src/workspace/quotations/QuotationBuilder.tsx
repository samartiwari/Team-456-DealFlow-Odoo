import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import {
  addLine, confirmQuotation, deleteLine, getQuotation, setOrderDiscount, updateLine,
} from '@/shared/api/endpoints'
import { ApiError } from '@/shared/api/client'
import type { RecomputeResult } from '@/shared/api/types'
import { Badge, Card, ErrorState, PageHeader, Spinner } from '@/shared/ui'
import { CartTable } from './CartTable'
import { ProductPicker } from './ProductPicker'
import { SummaryRail } from './SummaryRail'
import { STAGE_LABEL, STAGE_TONE } from './stage'

export default function QuotationBuilder() {
  const { id: param } = useParams()
  const id = Number(param)
  const qc = useQueryClient()
  const key = ['quotation', id]
  const [problem, setProblem] = useState<string | null>(null)

  const { data: quote, isLoading, isError, error } = useQuery({
    queryKey: key,
    queryFn: () => getQuotation(id),
    enabled: Number.isFinite(id),
  })

  /**
   * Every mutation returns the whole quotation, so the cache is replaced rather
   * than patched — the margin indicator and the risk badge can never drift from
   * what the server believes.
   */
  const apply = (next: RecomputeResult) => {
    qc.setQueryData(key, next)
    setProblem(null)
  }

  const fail = (e: unknown) =>
    setProblem(e instanceof ApiError ? e.message : 'Something went wrong. Try again.')

  const add = useMutation({
    mutationFn: (productId: number) => addLine(id, { productId, quantity: 1, discountPct: 0 }),
    onSuccess: apply,
    onError: fail,
  })

  const qty = useMutation({
    mutationFn: (v: { lineId: number; quantity: number }) =>
      updateLine(id, v.lineId, { quantity: v.quantity }),
    onSuccess: apply,
    onError: fail,
  })

  const discount = useMutation({
    mutationFn: (v: { lineId: number; discountPct: number }) =>
      updateLine(id, v.lineId, { discountPct: v.discountPct }),
    onSuccess: apply,
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: (lineId: number) => deleteLine(id, lineId),
    onSuccess: apply,
    onError: fail,
  })

  const orderDiscount = useMutation({
    mutationFn: (pct: number) => setOrderDiscount(id, { orderDiscountPct: pct }),
    onSuccess: apply,
    onError: fail,
  })

  const confirm = useMutation({
    mutationFn: () => confirmQuotation(id),
    onSuccess: (result) => {
      apply(result.quotation)
      qc.invalidateQueries({ queryKey: ['approvals'] })
      qc.invalidateQueries({ queryKey: ['quotations'] })
    },
    onError: fail,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (isError || !quote) {
    return (
      <ErrorState
        title="Could not load this quotation"
        description={
          error instanceof ApiError
            ? error.message
            : 'Check that the backend is running, or switch VITE_USE_MOCKS back on.'
        }
      />
    )
  }

  const busy =
    add.isPending || qty.isPending || discount.isPending ||
    remove.isPending || orderDiscount.isPending || confirm.isPending

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={quote.ref}
        description={`${quote.customerName} · ${quote.tier} tier`}
        actions={<Badge tone={STAGE_TONE[quote.stage]}>{STAGE_LABEL[quote.stage]}</Badge>}
      />

      {problem && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-card border border-danger-br bg-danger-bg px-4 py-3"
        >
          <p className="text-[13px] text-danger-tx">{problem}</p>
          <button
            type="button"
            onClick={() => setProblem(null)}
            className="text-[12px] font-medium text-danger-tx hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Three columns need ~1400px for the cart to breathe. Below that the
          summary rail drops under the cart rather than squeezing the table. */}
      <div className="grid gap-4 min-[1440px]:grid-cols-[220px_minmax(0,1fr)_280px]">
        <ProductPicker onAdd={(pid) => add.mutate(pid)} busy={busy} />

        <Card className="min-w-0 overflow-hidden">
          <CartTable
            lines={quote.lines}
            disabled={busy}
            onQty={(lineId, quantity) => qty.mutate({ lineId, quantity })}
            onDiscount={(lineId, discountPct) => discount.mutate({ lineId, discountPct })}
            onRemove={(lineId) => remove.mutate(lineId)}
          />
        </Card>

        <div className="min-w-0">
        <SummaryRail
          quote={quote}
          disabled={busy}
          confirming={confirm.isPending}
          onOrderDiscount={(pct) => orderDiscount.mutate(pct)}
          onConfirm={() => confirm.mutate()}
        />
        </div>
      </div>
    </div>
  )
}

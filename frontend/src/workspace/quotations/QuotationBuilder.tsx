import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  addLine, confirmQuotation, deleteLine, getQuotation, setCustomer, setOrderDiscount, updateLine,
} from '@/shared/api/endpoints'
import { ApiError } from '@/shared/api/client'
import type { RecomputeResult } from '@/shared/api/types'
import { Badge, Card, ErrorState, PageHeader, Spinner } from '@/shared/ui'
import { CartTable } from './CartTable'
import { ProductPicker } from './ProductPicker'
import { QuotationMeta } from './QuotationMeta'
import { SummaryRail } from './SummaryRail'
import { STAGE_LABEL, STAGE_TONE } from '@/shared/lib/stage'

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

  const customer = useMutation({
    mutationFn: (customerId: number) => setCustomer(id, customerId),
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

  /**
   * Confirm is the only control that waits on other writes: routing has to be
   * decided on numbers the server has already accepted.
   *
   * Everything else is deliberately left alone. One shared flag used to grey
   * out the product list and every row's controls on each debounced save, so a
   * single keystroke made the whole page flash — which read as a reload.
   * Quantity and discount writes are debounced and idempotent, so there is
   * nothing to protect against.
   */
  const writing =
    add.isPending || qty.isPending || discount.isPending ||
    remove.isPending || orderDiscount.isPending || customer.isPending

  /** Only the row actually being deleted dims, rather than the whole table. */
  const removingId = remove.isPending ? (remove.variables ?? null) : null

  /**
   * Only a draft — or a quotation a reviewer returned — can be edited. Once it
   * is out for approval the numbers are frozen: an approver decides on specific
   * lines and discounts, and those must not change underneath them.
   */
  const editable = quote.stage === 'DRAFT' || quote.stage === 'RETURNED'
  const locked = !editable

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link
          to="/app/quotations"
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
        >
          <span aria-hidden="true">&larr;</span> All quotations
        </Link>

        {/* No description: the customer used to be repeated here, and it now
            lives in the picker below where it can actually be changed. */}
        <PageHeader
          title={quote.ref}
          actions={<Badge tone={STAGE_TONE[quote.stage]}>{STAGE_LABEL[quote.stage]}</Badge>}
        />
      </div>

      <QuotationMeta
        quote={quote}
        locked={locked}
        onCustomer={(customerId) => customer.mutate(customerId)}
      />

      {quote.stage === 'APPROVED' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-success-br bg-success-bg px-4 py-3">
          <p className="text-[13px] text-success-tx">
            Approved. Stock can now be allocated across warehouses.
          </p>
          <Link
            to={`/app/quotations/${quote.id}/fulfilment`}
            className="rounded-control bg-primary px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover"
          >
            Go to fulfilment
          </Link>
        </div>
      )}

      {locked && (
        <div className="flex items-start gap-2.5 rounded-card border border-info-br bg-info-bg px-4 py-3">
          <span aria-hidden="true" className="mt-px text-info-tx">&#9432;</span>
          <p className="text-[13px] text-info-tx">
            This quotation is <b>{STAGE_LABEL[quote.stage].toLowerCase()}</b> and can no longer be
            edited.{' '}
            {quote.stage === 'PENDING_APPROVAL'
              ? 'An approver is reviewing these exact figures.'
              : 'Create a new quotation to quote different terms.'}
          </p>
        </div>
      )}

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
        <ProductPicker onAdd={(pid) => add.mutate(pid)} busy={add.isPending || locked} />

        <Card className="min-w-0 overflow-hidden">
          <CartTable
            lines={quote.lines}
            locked={locked}
            removingId={removingId}
            onQty={(lineId, quantity) => qty.mutate({ lineId, quantity })}
            onDiscount={(lineId, discountPct) => discount.mutate({ lineId, discountPct })}
            onRemove={(lineId) => remove.mutate(lineId)}
          />
        </Card>

        <div className="min-w-0">
        <SummaryRail
          quote={quote}
          locked={locked}
          busy={writing}
          confirming={confirm.isPending}
          onOrderDiscount={(pct) => orderDiscount.mutate(pct)}
          onConfirm={() => confirm.mutate()}
        />
        </div>
      </div>
    </div>
  )
}

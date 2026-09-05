import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { commitAllocation, getAllocation } from '@/shared/api/endpoints'
import type { AllocationPlan } from '@/shared/api/types'
import { money } from '@/shared/lib/format'
import {
  Badge, Button, Card, CardBody, CardHeader, CardTitle, ErrorState, PageHeader, Spinner,
} from '@/shared/ui'
import { AllocationTable } from './AllocationTable'
import { BackorderList } from './BackorderList'

export default function FulfilmentPage() {
  const { id: param } = useParams()
  const id = Number(param)
  const qc = useQueryClient()
  const key = ['allocation', id]
  const [problem, setProblem] = useState<string | null>(null)

  /* GET is safe to call repeatedly — it computes a suggestion and stores nothing. */
  const { data: plan, isLoading, isError, error } = useQuery({
    queryKey: key,
    queryFn: () => getAllocation(id),
    enabled: Number.isFinite(id),
    retry: false,
  })

  /* Only POST commits the plan and reserves stock. */
  const accept = useMutation({
    mutationFn: () => commitAllocation(id, { lines: null }),
    onSuccess: (next: AllocationPlan) => {
      qc.setQueryData(key, next)
      qc.invalidateQueries({ queryKey: ['quotation', id] })
      setProblem(null)
    },
    onError: (e) =>
      setProblem(e instanceof ApiError ? e.message : 'Could not accept the split.'),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (isError || !plan) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          to={`/app/quotations/${id}`}
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
        >
          <span aria-hidden="true">&larr;</span> Back to quotation
        </Link>
        <ErrorState
          title="No allocation available"
          description={
            error instanceof ApiError
              ? error.message
              : 'Allocation happens after approval — this quotation may not be approved yet.'
          }
        />
      </div>
    )
  }

  const committed = plan.status === 'ACCEPTED'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link
          to={`/app/quotations/${id}`}
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
        >
          <span aria-hidden="true">&larr;</span> Back to quotation
        </Link>

        <PageHeader
          title={`Fulfilment · ${plan.ref}`}
          description="Stock is drawn from the cheapest warehouse that can cover each line."
          actions={
            <Badge tone={committed ? 'success' : 'info'}>
              {committed ? 'Split accepted' : 'Suggested'}
            </Badge>
          }
        />
      </div>

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

      {/* Raised by a stock-arrival event; stays false until that lands. */}
      {plan.consolidatable && (
        <div className="flex items-start gap-2.5 rounded-card border border-info-br bg-info-bg px-4 py-3">
          <span aria-hidden="true" className="mt-px text-info-tx">&#9432;</span>
          <p className="text-[13px] text-info-tx">
            Stock has arrived. The remaining backorder could now ship in one consignment —
            <b> consolidate remaining backorder</b>.
          </p>
        </div>
      )}

      <div className="grid gap-4 min-[1200px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Warehouse split</CardTitle>
              <span className="text-[12px] text-muted">
                {plan.lines.length} line{plan.lines.length === 1 ? '' : 's'}
              </span>
            </CardHeader>
            <AllocationTable lines={plan.lines} />
          </Card>

          <BackorderList backorders={plan.backorders} />
        </div>

        <div className="min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <dl className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[13px] text-muted">Shipments</dt>
                  <dd className="text-[13px] font-medium text-ink tnum">{plan.shipmentCount}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[13px] text-muted">Backordered</dt>
                  <dd className="text-[13px] font-medium text-ink tnum">
                    {plan.backorders.reduce((s, b) => s + b.quantity, 0)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-default pt-2">
                  <dt className="text-sm font-semibold text-ink">Estimated cost</dt>
                  <dd className="text-lg font-bold text-ink tnum">
                    {money(plan.estimatedCost, plan.currency)}
                  </dd>
                </div>
              </dl>

              {committed ? (
                <p className="text-[13px] text-muted">
                  This split has been accepted and stock is reserved.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    variant="primary"
                    className="w-full"
                    disabled={accept.isPending}
                    onClick={() => accept.mutate()}
                  >
                    {accept.isPending ? 'Accepting…' : 'Accept suggested split'}
                  </Button>
                  {/* Wired in the next step. */}
                  <Button className="w-full" disabled>
                    Manual override
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

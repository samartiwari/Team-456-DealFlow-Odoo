import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { useActor } from '@/shared/api/actor'
import { getInvoice, recordPayment } from '@/shared/api/endpoints'
import { dateTime, money } from '@/shared/lib/format'
import {
  Badge, Card, CardBody, CardHeader, CardTitle, ErrorState, PageHeader, Spinner,
} from '@/shared/ui'
import { InvoicePanel } from './InvoicePanel'

/** One invoice, with its payments and any credit notes raised against it. */
export default function InvoiceDetailPage() {
  const { id: param } = useParams()
  const id = Number(param)
  const qc = useQueryClient()
  const actor = useActor()
  const canPay = actor.role === 'FINANCE'
  const key = ['invoice', id]
  const [problem, setProblem] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: key,
    queryFn: () => getInvoice(id),
    enabled: Number.isFinite(id),
    retry: false,
  })

  const pay = useMutation({
    mutationFn: (v: { amount: number; reference: string }) =>
      recordPayment(id, { amount: v.amount, reference: v.reference || undefined }),
    onSuccess: (inv) => {
      qc.setQueryData(key, inv)
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['billing'] })
      setProblem(null)
    },
    onError: (e) =>
      setProblem(e instanceof ApiError ? e.message : 'Could not record the payment.'),
  })

  const back = (
    <Link
      to="/app/invoices"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
    >
      <span aria-hidden="true">&larr;</span> All invoices
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
          title="Could not load this invoice"
          description={error instanceof ApiError ? error.message : 'It may have been voided.'}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        {back}
        <PageHeader
          title={data.ref}
          description={`Raised against Q-${String(data.quotationId).padStart(4, '0')}`}
          actions={
            <Link
              to={`/app/quotations/${data.quotationId}/billing`}
              className="rounded-control border border-default px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-hover"
            >
              Open the order&rsquo;s billing
            </Link>
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

      <div className="grid gap-4 min-[1200px]:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <InvoicePanel
            invoice={data}
            currency="INR"
            canPay={canPay}
            actorName={actor.name}
            busy={pay.isPending}
            onPay={(amount, reference) => pay.mutate({ amount, reference })}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Credit notes</CardTitle>
            <span className="text-[12px] text-muted">{data.creditNotes.length}</span>
          </CardHeader>
          {data.creditNotes.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">
                None. A credit note is raised when a subscription is reduced or cancelled
                part-way through a period.
              </p>
            </CardBody>
          ) : (
            <ul className="flex flex-col">
              {data.creditNotes.map((c) => (
                <li key={c.id} className="border-b border-default px-4 py-3 last:border-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium text-ink">{c.ref}</span>
                    <Badge tone="neutral">− {money(c.amount)}</Badge>
                  </div>
                  <p className="text-[12px] text-muted">{c.reason}</p>
                  <p className="text-[12px] text-faint">{dateTime(c.issuedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

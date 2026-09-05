import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createQuotation, listCustomers, listQuotations } from '@/shared/api/endpoints'
import { ApiError } from '@/shared/api/client'
import { useActor } from '@/shared/api/actor'
import { money } from '@/shared/lib/format'
import {
  Badge, Button, Card, CardBody, EmptyState, ErrorState, Field, Input, PageHeader,
  Select, Spinner, TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { STAGE_LABEL, STAGE_TONE } from '@/shared/lib/stage'

/**
 * Rows per page. 
 */
const PAGE_SIZE = 10

export default function QuotationsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const actor = useActor()
  // The brief gives quotation-building to the Sales Rep alone.
  const canCreate = actor.role === 'REP'
  const [creating, setCreating] = useState(false)
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const quotations = useQuery({ queryKey: ['quotations'], queryFn: listQuotations })
  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: listCustomers,
    enabled: creating,
    staleTime: Infinity,
  })

  const create = useMutation({
    mutationFn: (id: number) => createQuotation({ customerId: id }),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      navigate(`/app/quotations/${quote.id}`)
    },
    onError: (e) =>
      setProblem(e instanceof ApiError ? e.message : 'Could not create the quotation.'),
  })

  const chosen = customerId ?? customers.data?.[0]?.id ?? null

  // The whole record for whatever is selected. `chosen` is only an id, and the
  // remaining fields has to come from the server's response rather than be derived here.
  const selected = customers.data?.find((c) => c.id === chosen) ?? null

  const total = quotations.data?.length ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))


  if (page > pageCount) setPage(pageCount)

  const start = (page - 1) * PAGE_SIZE
  const rows = quotations.data?.slice(start, start + PAGE_SIZE) ?? []

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Quotations"
        description="Build a quote, and the system routes it for approval by itself."
        actions={
          canCreate && !creating ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New quotation
            </Button>
          ) : !canCreate ? (
            <p className="text-[13px] text-muted">
              Quotations are created by sales reps.
            </p>
          ) : null
        }
      />

      {problem && (
        <div role="alert" className="rounded-card border border-danger-br bg-danger-bg px-4 py-3">
          <p className="text-[13px] text-danger-tx">{problem}</p>
        </div>
      )}

      {canCreate && creating && (
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <Field label="Customer" htmlFor="customer" className="min-w-[220px]">
              <Select
                id="customer"
                value={chosen ?? ''}
                disabled={customers.isLoading}
                onChange={(e) => setCustomerId(Number(e.target.value))}
              >
                {customers.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.tier}, max {c.tierCeilingPct}%
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Phone" htmlFor="customer-phone" className="w-[150px]">

              <Input
                id="customer-phone"
                align="right"
                readOnly
                value={selected?.phone ?? ''}
              />
            </Field>

            <Button
              variant="primary"
              disabled={!chosen || create.isPending}
              onClick={() => chosen && create.mutate(chosen)}
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
            <Button onClick={() => { setCreating(false); setProblem(null) }}>Cancel</Button>
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden">
        {quotations.isLoading && (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6" />
          </div>
        )}

        {quotations.isError && (
          <ErrorState
            title="Could not load quotations"
            description={
              quotations.error instanceof ApiError
                ? quotations.error.message
                : 'Check that the backend is running, or switch VITE_USE_MOCKS back on.'
            }
          />
        )}

        {quotations.data?.length === 0 && (
          <EmptyState
            title="No quotations yet"
            description="Create one to see the risk score and approval routing in action."
          />
        )}

        {quotations.data && quotations.data.length > 0 && (
          <Table>
            <THead>
              <TR>
                <TH>Reference</TH>
                <TH>Customer</TH>
                <TH>Stage</TH>
                <TH numeric>Total</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((q) => (
                <TR
                  key={q.id}
                  hover
                  className="cursor-pointer"
                  onClick={() => navigate(`/app/quotations/${q.id}`)}
                >
                  <TD className="font-medium text-ink">{q.ref}</TD>
                  <TD>{q.customerName}</TD>
                  <TD>
                    <Badge tone={STAGE_TONE[q.stage]}>{STAGE_LABEL[q.stage]}</Badge>
                  </TD>
                  <TD numeric className="font-medium text-ink">
                    {money(q.grandTotal, q.currency)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}


        {total > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-default px-4 py-3">
            <p className="text-[12px] text-muted tnum">
              Showing {start + 1}&ndash;{Math.min(start + PAGE_SIZE, total)} of {total}
            </p>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-[12px] text-muted tnum">
                Page {page} of {pageCount}
              </span>
              <Button
                size="sm"
                disabled={page === pageCount}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

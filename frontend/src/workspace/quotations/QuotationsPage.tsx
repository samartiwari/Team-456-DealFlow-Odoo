import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createQuotation, listCustomers, listQuotations } from '@/shared/api/endpoints'
import { ApiError } from '@/shared/api/client'
import { money } from '@/shared/lib/format'
import {
  Badge, Button, Card, CardBody, EmptyState, ErrorState, Field, PageHeader,
  Select, Spinner, TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { STAGE_LABEL, STAGE_TONE } from '@/shared/lib/stage'

export default function QuotationsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

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

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Quotations"
        description="Build a quote, and the system routes it for approval by itself."
        actions={
          !creating && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New quotation
            </Button>
          )
        }
      />

      {problem && (
        <div role="alert" className="rounded-card border border-danger-br bg-danger-bg px-4 py-3">
          <p className="text-[13px] text-danger-tx">{problem}</p>
        </div>
      )}

      {creating && (
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
              {quotations.data.map((q) => (
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
      </Card>
    </div>
  )
}

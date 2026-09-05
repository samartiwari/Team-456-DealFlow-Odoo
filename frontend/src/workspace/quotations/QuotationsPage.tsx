import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createQuotation, listCustomers, listQuotations } from '@/shared/api/endpoints'
import { ApiError } from '@/shared/api/client'
import { useActor } from '@/shared/api/session'
import {
  Button, Card, EmptyState, ErrorState, PageHeader, Spinner,
} from '@/shared/ui'
import { QuotationTable } from './QuotationTable'

/**
 * Rows per page. The list endpoint returns every quotation in one array, so
 * paging happens here rather than on the server — fine at demo scale, and the
 * day the API grows page/size params only this block changes.
 */
const PAGE_SIZE = 10

export default function QuotationsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const actor = useActor()
  // The brief gives quotation-building to the Sales Rep alone.
  const canCreate = actor.role === 'REP'
  const [page, setPage] = useState(1)
  const [problem, setProblem] = useState<string | null>(null)

  const quotations = useQuery({ queryKey: ['quotations'], queryFn: listQuotations })

  /**
   * Fetched up front so pressing New quotation goes straight to the builder.
   * A quotation cannot be created without a customer, so the first one seeds it
   * — and the picker in the builder is where it actually gets chosen.
   */
  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: listCustomers,
    enabled: canCreate,
    staleTime: Infinity,
  })

  const create = useMutation({
    mutationFn: (customerId: number) => createQuotation({ customerId }),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      navigate(`/app/quotations/${quote.id}`)
    },
    onError: (e) =>
      setProblem(e instanceof ApiError ? e.message : 'Could not create the quotation.'),
  })

  const firstCustomer = customers.data?.[0]?.id ?? null

  const total = quotations.data?.length ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Adjust during render rather than in an effect, matching how the input
  // drafts stay in step with the server: if the list shrank under us, fall
  // back to the last page that still exists instead of showing nothing.
  if (page > pageCount) setPage(pageCount)

  const start = (page - 1) * PAGE_SIZE
  const rows = quotations.data?.slice(start, start + PAGE_SIZE) ?? []

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Quotations"
        description="Build a quote, and the system routes it for approval by itself."
        actions={
          canCreate ? (
            /* Straight to the builder — the customer is chosen there, so there
               is no half-filled form sitting on the list page. */
            <Button
              variant="primary"
              disabled={!firstCustomer || create.isPending}
              onClick={() => firstCustomer && create.mutate(firstCustomer)}
            >
              {create.isPending ? 'Creating…' : 'New quotation'}
            </Button>
          ) : (
            <p className="text-[13px] text-muted">Quotations are created by sales reps.</p>
          )
        }
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
          <QuotationTable rows={rows} onRowClick={(id) => navigate(`/app/quotations/${id}`)} />
        )}

        {/* Only worth showing once there is more than one page of results. */}
        {total > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-default px-4 py-3">
            <p className="text-[12px] text-muted tnum">
              Showing {start + 1}&ndash;{Math.min(start + PAGE_SIZE, total)} of {total}
            </p>

            <div className="flex items-center gap-2">
              <Button size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-[12px] text-muted tnum">
                Page {page} of {pageCount}
              </span>
              <Button size="sm" disabled={page === pageCount} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

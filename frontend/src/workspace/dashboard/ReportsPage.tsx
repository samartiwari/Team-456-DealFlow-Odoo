import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { listReps, reportPdfUrl, reportQueryString, runReport } from '@/shared/api/endpoints'
import type { QuotationStage, ReportQuery } from '@/shared/api/types'
import { dateTime, money, percent } from '@/shared/lib/format'
import { STAGE_LABEL, STAGE_TONE } from '@/shared/lib/stage'
import {
  Badge, Button, Card, CardBody, EmptyState, ErrorState, Field, Input,
  PageHeader, Select, Spinner, TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'

const STAGES: QuotationStage[] = [
  'DRAFT', 'PENDING_APPROVAL', 'RETURNED', 'APPROVED', 'REJECTED',
  'SENT', 'UNDER_NEGOTIATION', 'CONFIRMED',
]

const CATEGORIES = [
  { id: 1, name: 'Hardware' },
  { id: 2, name: 'Services' },
  { id: 3, name: 'Subscriptions' },
]

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

/**
 * A7 — one query with four optional filters, and an export built from the very
 * same object.
 *
 * Constructing the export URL separately is how a PDF comes to disagree with
 * the screen it was printed from, so both go through reportQueryString.
 */
export default function ReportsPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState<ReportQuery>({})

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['report', reportQueryString(query)],
    queryFn: () => runReport(query),
    retry: false,
  })

  // The reps come from the server now: a hardcoded list would go stale the
  // first time somebody signed up.
  const repList = useQuery({ queryKey: ['reps'], queryFn: listReps, staleTime: Infinity })
  const reps = repList.data ?? []

  const set = (patch: Partial<ReportQuery>) => setQuery({ ...query, ...patch })
  const clear = () => setQuery({})
  const active = Object.values(query).filter((v) => v !== undefined && v !== '').length

  /** What the server understood, so the export/screen match is visible. */
  const summary = data
    ? [
        data.query.from || data.query.to
          ? `${data.query.from ?? 'the beginning'} to ${data.query.to ?? 'today'}`
          : null,
        data.query.repId ? reps.find((a) => a.id === data.query.repId)?.name : null,
        data.query.status ? STAGE_LABEL[data.query.status] : null,
        data.query.categoryId ? CATEGORIES.find((c) => c.id === data.query.categoryId)?.name : null,
      ].filter(Boolean).join(' · ')
    : ''

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reports"
        description="Period, rep, approval status and category. All optional, and they combine."
        actions={
          <a
            href={reportPdfUrl(query)}
            target="_blank"
            rel="noreferrer"
            className="rounded-control border border-default px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-hover"
          >
            Export PDF
          </a>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label="From" htmlFor="from" className="w-[160px]">
            <Input id="from" type="date" value={query.from ?? ''}
              onChange={(e) => set({ from: e.target.value || undefined })} />
          </Field>
          <Field label="To" htmlFor="to" className="w-[160px]">
            <Input id="to" type="date" value={query.to ?? ''}
              onChange={(e) => set({ to: e.target.value || undefined })} />
          </Field>
          <Field label="Sales rep" htmlFor="rep" className="w-[160px]">
            <Select id="rep" value={query.repId ?? ''}
              onChange={(e) => set({ repId: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Everyone</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Status" htmlFor="status" className="w-[180px]">
            <Select id="status" value={query.status ?? ''}
              onChange={(e) => set({ status: (e.target.value || undefined) as QuotationStage | undefined })}>
              <option value="">Any</option>
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field label="Category" htmlFor="category" className="w-[160px]">
            <Select id="category" value={query.categoryId ?? ''}
              onChange={(e) => set({ categoryId: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Any</option>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {active > 0 && <Button onClick={clear}>Clear filters</Button>}
        </CardBody>
      </Card>

      {isError && (
        <ErrorState
          title="Could not run the report"
          description={error instanceof ApiError ? error.message : 'Check that the backend is running.'}
        />
      )}

      {isLoading && (
        <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
      )}

      {data && (
        <>
          <Card>
            <CardBody className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <Figure label="Quotations" value={String(data.totals.count)} />
              <Figure label="Revenue" value={money(data.totals.revenue)} />
              <Figure label="Average discount" value={percent(data.totals.averageDiscountPct)} />
              <Figure label="Average margin" value={percent(data.totals.averageMarginPct)} />
              <p className="ml-auto text-[12px] text-muted">
                {summary || 'No filters — everything'}
              </p>
            </CardBody>
          </Card>

          {USE_MOCKS && (
            <p className="text-[12px] text-muted">
              Export needs the live API — the PDF is rendered server-side from this same query.
            </p>
          )}

          <Card className="overflow-hidden">
            {data.rows.length === 0 ? (
              <EmptyState
                title="Nothing matches those filters"
                description="Widen the date range, or clear a filter to see more."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Reference</TH>
                      <TH>Customer</TH>
                      <TH>Rep</TH>
                      <TH>Stage</TH>
                      <TH numeric>Discount</TH>
                      <TH numeric>Subtotal</TH>
                      <TH numeric>Margin</TH>
                      <TH numeric>Risk</TH>
                      <TH numeric>Date</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.rows.map((r) => (
                      <TR key={r.quotationId} hover className="cursor-pointer"
                        onClick={() => navigate(`/app/quotations/${r.quotationId}`)}>
                        <TD className="font-medium text-ink">{r.ref}</TD>
                        <TD>{r.customerName}</TD>
                        <TD className="text-ink-2">{r.repName}</TD>
                        <TD><Badge tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Badge></TD>
                        <TD numeric className="text-ink-2">{percent(r.orderDiscountPct)}</TD>
                        <TD numeric className="font-medium text-ink">{money(r.subtotal)}</TD>
                        <TD numeric className="text-ink-2">{percent(r.marginPct)}</TD>
                        <TD numeric className="text-muted">{r.riskScore}</TD>
                        <TD numeric className="text-muted">{dateTime(r.createdAt).split(',')[0]}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="text-lg font-bold text-ink tnum">{value}</p>
    </div>
  )
}

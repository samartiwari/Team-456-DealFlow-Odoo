import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { listQuotations } from '@/shared/api/endpoints'
import { useActor } from '@/shared/api/session'
import type { QuotationStage, QuotationSummary } from '@/shared/api/types'
import { money } from '@/shared/lib/format'
import { PIPELINE_ORDER, PIPELINE_TERMINAL } from '@/shared/lib/pipeline'
import { STAGE_LABEL, STAGE_TONE } from '@/shared/lib/stage'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/shared/ui'
import { QuotationTable } from '../quotations/QuotationTable'

type View = 'board' | 'table'

/** Persisted per user: a manager's board preference is not a rep's. */
function viewKey(userId: number) {
  return `df360.pipeline.view.${userId}`
}

function readView(userId: number): View {
  try {
    return localStorage.getItem(viewKey(userId)) === 'table' ? 'table' : 'board'
  } catch {
    return 'board'
  }
}

/**
 * Mockup screen 3 — the Kanban pipeline (spec B1).
 *
 * Same data as the quotations list, arranged as ordered stage columns. The
 * board is deliberately read-only: stage transitions are governed by the risk
 * engine, the approval chain and the customer's own actions, so there is no
 * "set stage" to drag a card into (Phase 13 §3.5). The toggle is a view
 * control, not an editor.
 */
export default function PipelinePage() {
  const navigate = useNavigate()
  const actor = useActor()
  const [view, setView] = useState<View>(() => readView(actor.id))
  // REJECTED is terminal noise; collapsed by default, with a count so it is not
  // hidden outright.
  const [showRejected, setShowRejected] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['quotations'],
    queryFn: listQuotations,
  })

  const setAndStore = (next: View) => {
    setView(next)
    try {
      localStorage.setItem(viewKey(actor.id), next)
    } catch {
      /* private browsing — the preference just does not persist */
    }
  }

  const open = (id: number) => navigate(`/app/quotations/${id}`)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Pipeline"
        description="Every open deal, by the stage it has reached. A view of the quotations list, not an editor."
        actions={
          <div className="inline-flex overflow-hidden rounded-control border border-default">
            {(['board', 'table'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAndStore(v)}
                className={[
                  'px-3 py-1.5 text-[12px] font-semibold capitalize transition-colors',
                  view === v ? 'bg-active text-primary' : 'text-ink-2 hover:bg-hover hover:text-ink',
                ].join(' ')}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {isError && (
        <Card>
          <ErrorState
            title="Could not load the pipeline"
            description={
              error instanceof ApiError
                ? error.message
                : 'Check that the backend is running, or switch VITE_USE_MOCKS back on.'
            }
          />
        </Card>
      )}

      {data && data.length === 0 && (
        <Card>
          <EmptyState
            title="No quotations yet"
            description="Create one to see it move across the pipeline."
          />
        </Card>
      )}

      {data && data.length > 0 && view === 'table' && (
        <Card className="overflow-hidden">
          <QuotationTable rows={data} onRowClick={open} />
        </Card>
      )}

      {data && data.length > 0 && view === 'board' && (
        <Board
          rows={data}
          showRejected={showRejected}
          onToggleRejected={() => setShowRejected((s) => !s)}
          onOpen={open}
        />
      )}
    </div>
  )
}

function Board({
  rows,
  showRejected,
  onToggleRejected,
  onOpen,
}: {
  rows: QuotationSummary[]
  showRejected: boolean
  onToggleRejected: () => void
  onOpen: (id: number) => void
}) {
  const byStage = (stage: QuotationStage) => rows.filter((q) => q.stage === stage)
  const rejected = byStage(PIPELINE_TERMINAL)

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {PIPELINE_ORDER.map((stage) => (
        <Column key={stage} stage={stage} cards={byStage(stage)} onOpen={onOpen} />
      ))}

      {/* Terminal, collapsed by default — a count, not a full column, unless asked. */}
      <div className="flex w-64 shrink-0 flex-col">
        <button
          type="button"
          onClick={onToggleRejected}
          className="flex items-center justify-between gap-2 rounded-card border border-default bg-card px-3 py-2 text-left hover:bg-hover"
        >
          <span className="text-[12px] font-semibold text-ink-2">
            {STAGE_LABEL[PIPELINE_TERMINAL]}
          </span>
          <span className="text-[11px] text-muted tnum">
            {rejected.length} {showRejected ? '▲' : '▼'}
          </span>
        </button>
        {showRejected && (
          <div className="mt-2 flex flex-col gap-2">
            {rejected.length === 0 ? (
              <p className="px-1 text-[12px] text-muted">Nothing rejected.</p>
            ) : (
              rejected.map((q) => <QuoteCard key={q.id} q={q} onOpen={onOpen} />)
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Column({
  stage,
  cards,
  onOpen,
}: {
  stage: QuotationStage
  cards: QuotationSummary[]
  onOpen: (id: number) => void
}) {
  const total = cards.reduce((sum, q) => sum + q.grandTotal, 0)
  const currency = cards[0]?.currency ?? 'INR'

  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div className="rounded-card border border-default bg-card px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-ink-2">{STAGE_LABEL[stage]}</span>
          <span className="text-[11px] text-muted tnum">{cards.length}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted tnum">{money(total, currency)}</p>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {cards.map((q) => (
          <QuoteCard key={q.id} q={q} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

function QuoteCard({ q, onOpen }: { q: QuotationSummary; onOpen: (id: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(q.id)}
      className="flex flex-col gap-1.5 rounded-card border border-default bg-card px-3 py-2.5 text-left transition-colors hover:bg-hover"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">{q.ref}</span>
        <Badge tone={STAGE_TONE[q.stage]}>{STAGE_LABEL[q.stage]}</Badge>
      </div>
      <span className="text-[12px] text-muted">{q.customerName}</span>
      <span className="text-[13px] font-semibold text-ink tnum">
        {money(q.grandTotal, q.currency)}
      </span>
    </button>
  )
}

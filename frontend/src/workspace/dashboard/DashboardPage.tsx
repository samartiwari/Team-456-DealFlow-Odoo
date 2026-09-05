import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { getDealHealth, listActivity, listApprovals, listQuotations } from '@/shared/api/endpoints'
import { useActor } from '@/shared/api/session'
import type { ActivityEvent, UserRole } from '@/shared/api/types'
import { money, relativeTime } from '@/shared/lib/format'
import { isOpen } from '@/shared/lib/pipeline'
import { STAGE_LABEL } from '@/shared/lib/stage'
import {
  Badge, Card, CardBody, EmptyState, PageHeader, Spinner,
} from '@/shared/ui'
import type { Tone } from '@/shared/ui'

/**
 * Mockup screen 2 — the Sales Dashboard / Home (spec, landing screen).
 *
 * Four summary cards composed over calls that already exist, plus a Recent
 * Activity feed. A card whose data a role may not see is absent, not zero:
 * rendering "0" for a queue a rep cannot open reads as "nothing to do" rather
 * than "not yours" (Phase 13 §2.2). The three data calls resolve independently,
 * so one slow response skeletons its own card and never holds the others.
 *
 * HOME_FOR is deliberately left alone — this screen is reachable from the nav,
 * but whether it becomes the landing page is the Gate 3 owner's call (§2.4).
 */
export default function DashboardPage() {
  const actor = useActor()
  const role = actor.role
  const navigate = useNavigate()

  const canApprovals = role === 'MANAGER' || role === 'FINANCE'
  const canQuotations = role === 'REP' || role === 'MANAGER'
  const canHealth = role === 'MANAGER' || role === 'FINANCE'

  const approvals = useQuery({
    queryKey: ['approvals'],
    queryFn: listApprovals,
    enabled: canApprovals,
  })
  const quotations = useQuery({
    queryKey: ['quotations'],
    queryFn: listQuotations,
    enabled: canQuotations,
  })
  const health = useQuery({
    queryKey: ['deal-health'],
    queryFn: getDealHealth,
    enabled: canHealth,
  })
  const activity = useQuery({ queryKey: ['activity'], queryFn: () => listActivity(20) })

  const openQuotes = quotations.data?.filter((q) => isOpen(q.stage)) ?? []
  const pipelineValue = openQuotes.reduce((sum, q) => sum + q.grandTotal, 0)
  const currency = openQuotes[0]?.currency ?? 'INR'
  const awaitingMe = approvals.data?.filter((a) => a.awaitingRole === role).length ?? 0

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Home"
        description="What needs attention right now, and where the pipeline stands."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canApprovals && (
          <StatCard
            title="Pending approvals"
            loading={approvals.isLoading}
            error={approvals.isError}
            value={String(awaitingMe)}
            sub={`awaiting you · ${approvals.data?.length ?? 0} open in total`}
            tone={awaitingMe > 0 ? 'warning' : 'neutral'}
            to="/app/approvals"
          />
        )}

        {canQuotations && (
          <StatCard
            title="Open quotations"
            loading={quotations.isLoading}
            error={quotations.isError}
            value={String(openQuotes.length)}
            sub="not yet confirmed or rejected"
            tone="info"
            to="/app/pipeline"
          />
        )}

        {canHealth && (
          <StatCard
            title="At-risk deals"
            loading={health.isLoading}
            error={health.isError}
            value={String(health.data?.counts.total ?? 0)}
            sub={
              health.data
                ? `${health.data.counts.high} high · ${health.data.counts.medium} medium`
                : undefined
            }
            tone={health.data && health.data.counts.high > 0 ? 'danger' : 'neutral'}
            to="/app/deal-health"
          />
        )}

        {canQuotations && (
          <StatCard
            title="Pipeline value"
            loading={quotations.isLoading}
            error={quotations.isError}
            value={money(pipelineValue, currency)}
            sub="across open quotations"
            tone="success"
          />
        )}
      </div>

      <RecentActivity
        events={activity.data ?? []}
        loading={activity.isLoading}
        onOpen={(id) => navigate(`/app/quotations/${id}`)}
      />
    </div>
  )
}

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  success: 'text-success-tx',
  warning: 'text-warning-tx',
  danger: 'text-danger-tx',
  info: 'text-info-tx',
}

function StatCard({
  title,
  value,
  sub,
  tone = 'neutral',
  to,
  loading,
  error,
}: {
  title: string
  value: string
  sub?: string
  tone?: Tone
  to?: string
  loading?: boolean
  error?: boolean
}) {
  const body = (
    <CardBody className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-muted">{title}</span>
      {loading ? (
        <span className="mt-1 h-7 w-16 animate-pulse rounded bg-hover" aria-hidden="true" />
      ) : error ? (
        <span className="text-lg font-bold text-danger-tx">—</span>
      ) : (
        <span className={`text-2xl font-bold tnum ${TONE_TEXT[tone]}`}>{value}</span>
      )}
      {!loading && !error && sub && <span className="text-[12px] text-muted">{sub}</span>}
      {error && <span className="text-[12px] text-muted">Could not load</span>}
    </CardBody>
  )

  if (to && !loading && !error) {
    return (
      <Link
        to={to}
        className="rounded-card border border-default bg-card transition-colors hover:bg-hover"
      >
        {body}
      </Link>
    )
  }
  return <Card>{body}</Card>
}

/** QUOTATION_CREATED → "Quotation created". */
function actionLabel(action: string): string {
  const s = action.replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const ACTOR_ROLE_HINT: Record<UserRole, never> = {} as Record<UserRole, never>
void ACTOR_ROLE_HINT

function RecentActivity({
  events,
  loading,
  onOpen,
}: {
  events: ActivityEvent[]
  loading?: boolean
  onOpen: (quotationId: number) => void
}) {
  return (
    <Card>
      <div className="border-b border-default px-4 py-3">
        <h2 className="text-base font-semibold text-ink">Recent activity</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-5 w-5" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          description="Actions across every quotation — created, confirmed, approved — show up here."
        />
      ) : (
        <ul className="divide-y divide-default">
          {events.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onOpen(e.quotationId)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-hover"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="shrink-0 text-[13px] font-medium text-ink">{e.ref}</span>
                  <span className="truncate text-[13px] text-ink-2">
                    {actionLabel(e.action)}
                    {e.toStage && (
                      <span className="text-muted"> → {STAGE_LABEL[e.toStage]}</span>
                    )}
                    {e.actorName && <span className="text-muted"> · {e.actorName}</span>}
                  </span>
                  {e.reason && (
                    <Badge tone="neutral" className="hidden shrink-0 sm:inline-flex">
                      {e.reason}
                    </Badge>
                  )}
                </div>
                <span className="shrink-0 text-[12px] text-muted">{relativeTime(e.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

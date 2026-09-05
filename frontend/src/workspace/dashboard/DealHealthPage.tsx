import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { ackAlert, escalateAlert, getDealHealth, nudgeAlert } from '@/shared/api/endpoints'
import type {
  AlertSeverity, AlertType, DealHealthAlert, DealHealthBoard, NudgeResult,
} from '@/shared/api/types'
import { percent, relativeTime } from '@/shared/lib/format'
import type { Tone } from '@/shared/ui/Badge'
import {
  Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState,
  PageHeader, Spinner,
} from '@/shared/ui'

const SEVERITY: Record<AlertSeverity, Tone> = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'neutral' }

const TYPE_LABEL: Record<AlertType, string> = {
  STALLED: 'Stalled',
  DISCOUNT_ANOMALY: 'Discount anomaly',
  CEILING_HUGGER: 'Ceiling hugger',
  SLIPPAGE: 'Delivery slippage',
}

/**
 * B9 — what needs attention, and why.
 *
 * Every card carries the sentence the detector wrote, naming the numbers that
 * produced it. There is deliberately no fixed discount threshold anywhere on
 * this screen: an anomaly is measured against that rep's own history, and
 * printing a number like "over 20%" would contradict the whole mechanism.
 */
export default function DealHealthPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const key = ['deal-health']
  const [problem, setProblem] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: key,
    queryFn: getDealHealth,
    retry: false,
  })

  const fail = (e: unknown) => {
    setDraft(null)
    setProblem(e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
  }
  const applied = (board: DealHealthBoard) => {
    qc.setQueryData(key, board)
    setProblem(null)
  }

  const nudge = useMutation({
    mutationFn: (id: number) => nudgeAlert(id),
    onSuccess: (r: NudgeResult) => { applied(r.board); setDraft(r.draft) },
    onError: fail,
  })

  const escalate = useMutation({
    mutationFn: (id: number) => escalateAlert(id),
    onSuccess: (board) => {
      applied(board)
      // A new Finance step changes the approval queue and the quotation itself.
      qc.invalidateQueries({ queryKey: ['approvals'] })
      qc.invalidateQueries({ queryKey: ['quotations'] })
      setDraft(null)
    },
    onError: fail,
  })

  const ack = useMutation({
    mutationFn: (id: number) => ackAlert(id),
    onSuccess: applied,
    onError: fail,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Could not load the dashboard"
        description={
          error instanceof ApiError ? error.message : 'Check that the backend is running.'
        }
      />
    )
  }

  const busy = nudge.isPending || escalate.isPending || ack.isPending

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Deal health"
        description="Deals that need attention, each explaining itself. Evaluated on every load."
        actions={
          <div className="flex items-center gap-2">
            {data.counts.high > 0 && <Badge tone="danger">{data.counts.high} high</Badge>}
            {data.counts.medium > 0 && <Badge tone="warning">{data.counts.medium} medium</Badge>}
            {data.counts.low > 0 && <Badge tone="neutral">{data.counts.low} low</Badge>}
          </div>
        }
      />

      {problem && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-card border border-danger-br bg-danger-bg px-4 py-3"
        >
          <p className="text-[13px] text-danger-tx">{problem}</p>
          <button type="button" onClick={() => setProblem(null)} className="text-[12px] font-medium text-danger-tx hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* There is no mail server, so the draft is shown rather than claimed sent. */}
      {draft && (
        <Card>
          <CardHeader>
            <CardTitle>Drafted follow-up</CardTitle>
            <span className="text-[12px] text-muted">Not sent — no mail server in this build</span>
          </CardHeader>
          <CardBody>
            <pre className="whitespace-pre-wrap rounded-card border border-default bg-hover p-3 text-[13px] text-ink">
              {draft}
            </pre>
            <button type="button" onClick={() => setDraft(null)} className="mt-2 text-[12px] font-medium text-muted hover:underline">
              Close
            </button>
          </CardBody>
        </Card>
      )}

      {data.alerts.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing needs attention"
            description="No deal is stalled, no discount is out of character, and every promise is on time."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.alerts.map((a) => (
            <li key={a.id}>
              <AlertCard
                alert={a}
                busy={busy}
                onOpen={() => navigate(`/app/quotations/${a.quotationId}`)}
                onNudge={() => nudge.mutate(a.id)}
                onEscalate={() => escalate.mutate(a.id)}
                onAck={() => ack.mutate(a.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="text-[12px] text-muted">
        Detectors ran {relativeTime(data.evaluatedAt)}. An alert that disappears means the
        condition cleared, not that it was dismissed.
      </p>
    </div>
  )
}

function AlertCard({
  alert, busy, onOpen, onNudge, onEscalate, onAck,
}: {
  alert: DealHealthAlert
  busy: boolean
  onOpen: () => void
  onNudge: () => void
  onEscalate: () => void
  onAck: () => void
}) {
  const m = alert.metrics

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={SEVERITY[alert.severity]}>{TYPE_LABEL[alert.type]}</Badge>
              <button
                type="button"
                onClick={onOpen}
                className="text-[13px] font-semibold text-primary hover:underline"
              >
                {alert.ref}
              </button>
              <span className="text-[13px] text-ink-2">{alert.customerName}</span>
              <span className="text-[12px] text-muted">· {alert.repName}</span>
              {alert.ackedAt && <Badge tone="neutral">Seen</Badge>}
            </div>
            {/* The detector's own sentence, rendered verbatim. */}
            <p className="mt-1.5 text-[13px] text-ink">{alert.explanation}</p>
          </div>
          <span className="shrink-0 text-[12px] text-muted">{relativeTime(alert.openedAt)}</span>
        </div>

        {m && (
          <dl className="flex flex-wrap gap-x-8 gap-y-2 rounded-card border border-default bg-hover px-3 py-2">
            <Fact label="This deal" value={percent(m.discountPct)} />
            <Fact label={m.usedTeamBaseline ? "Team mean" : "Their mean"} value={percent(m.mean)} />
            <Fact label="Std deviation" value={m.stdDev.toFixed(2)} />
            <Fact label="Quotes measured" value={String(m.sampleSize)} />
            {m.usedTeamBaseline && (
              <div className="self-center">
                {/* Fewer than five confirmed quotes: a new rep is not an anomaly. */}
                <Badge tone="info">Measured against the team</Badge>
              </div>
            )}
          </dl>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={onNudge}>Nudge</Button>
          <Button size="sm" disabled={busy} onClick={onEscalate}>Escalate to finance</Button>
          {!alert.ackedAt && (
            <Button size="sm" disabled={busy} onClick={onAck}>Mark seen</Button>
          )}
          <Button size="sm" className="ml-auto" onClick={onOpen}>Open quotation</Button>
        </div>
      </CardBody>
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</dt>
      <dd className="text-sm font-semibold text-ink tnum">{value}</dd>
    </div>
  )
}

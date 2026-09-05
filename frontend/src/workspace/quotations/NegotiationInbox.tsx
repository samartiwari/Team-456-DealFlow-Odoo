import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import { getNegotiation, replyToCustomer } from '@/shared/api/endpoints'
import type { NegotiationThread, QuotationLine } from '@/shared/api/types'
import { dateTime, percent } from '@/shared/lib/format'
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Spinner } from '@/shared/ui'

const ROLE_LABEL = { MANAGER: 'Sales Manager', FINANCE: 'Finance' } as const

/**
 * The rep's side of the portal conversation.
 *
 * There is no "accept counter" button here, deliberately. A counter applies
 * itself: it re-prices the order, re-scores it, and if the terms now exceed
 * what was signed off the quote is already back in the approvals queue by the
 * time the rep looks. This screen is for reading and replying — a second
 * approval mechanism would undo the governance that already exists.
 */
export function NegotiationInbox({
  quotationId,
  lines,
}: {
  quotationId: number
  lines: QuotationLine[]
}) {
  const qc = useQueryClient()
  const key = ['negotiation', quotationId]
  const [body, setBody] = useState('')
  const [lineId, setLineId] = useState<number | ''>('')
  const [problem, setProblem] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => getNegotiation(quotationId),
    enabled: Number.isFinite(quotationId),
  })

  const reply = useMutation({
    mutationFn: () =>
      replyToCustomer(quotationId, { body, lineId: lineId === '' ? undefined : lineId }),
    onSuccess: (next: NegotiationThread) => {
      qc.setQueryData(key, next)
      setBody('')
      setLineId('')
      setProblem(null)
    },
    onError: (e) => setProblem(e instanceof ApiError ? e.message : 'Could not send the reply.'),
  })

  if (isLoading) {
    return (
      <Card>
        <CardBody className="flex justify-center py-6"><Spinner /></CardBody>
      </Card>
    )
  }

  // Nothing to show until the quotation has actually been sent.
  if (!data || (!data.sentAt && data.messages.length === 0 && !data.counter)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer negotiation</CardTitle>
        {data.sentAt && (
          <span className="text-[12px] text-muted">Sent {dateTime(data.sentAt)}</span>
        )}
      </CardHeader>

      {data.counter && (
        <CardBody className="border-b border-default">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[13px] text-ink">
              The customer proposed <b>{data.counter.discountPct}%</b> off
              {data.counter.state === 'ACCEPTED' && <span className="text-muted"> · accepted</span>}
            </p>
            <span className="text-[12px] text-muted">{dateTime(data.counter.proposedAt)}</span>
          </div>
          {data.counter.note && (
            <p className="mt-1 text-[13px] text-ink-2">&ldquo;{data.counter.note}&rdquo;</p>
          )}

          {/* What the counter did to the deal — the figures the portal never sees. */}
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
            <Fact label="Risk now" value={String(data.counter.riskScore)} />
            <Fact
              label="Approved at"
              value={data.approvedBaselineScore === null ? '—' : String(data.approvedBaselineScore)}
            />
            <Fact label="Margin now" value={percent(data.counter.marginPct)} />
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">Needs</dt>
              <dd className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {data.counter.requiredChain.length === 0 ? (
                  <Badge tone="success">No approval</Badge>
                ) : (
                  data.counter.requiredChain.map((r) => (
                    <Badge key={r} tone="warning">{ROLE_LABEL[r]}</Badge>
                  ))
                )}
              </dd>
            </div>
          </dl>

          {data.status === 'PENDING_APPROVAL' && (
            <p className="mt-3 rounded-card border border-warning-br bg-warning-bg px-3 py-2 text-[12px] text-warning-tx">
              These terms scored above what was approved, so the quotation re-entered the
              approval chain on its own. Decide on it from the approvals queue.
            </p>
          )}
          {data.status === 'UNDER_NEGOTIATION' && data.approvedBaselineScore !== null && (
            <p className="mt-3 text-[12px] text-muted">
              No worse than the terms already approved, so nothing was re-routed.
            </p>
          )}
        </CardBody>
      )}

      {problem && (
        <CardBody className="border-b border-default">
          <p className="text-[13px] text-danger-tx">{problem}</p>
        </CardBody>
      )}

      <CardBody className="flex flex-col gap-3">
        {data.messages.length === 0 ? (
          <p className="text-[13px] text-muted">No messages yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.messages.map((m) => {
              const line = lines.find((l) => l.id === m.lineId)
              return (
                <li
                  key={m.id}
                  className={`rounded-card border px-3 py-2 ${
                    m.author === 'CUSTOMER'
                      ? 'border-default bg-hover'
                      : 'border-info-br bg-info-bg'
                  }`}
                >
                  <p className="text-[12px] text-muted">
                    {m.authorName}
                    {line && <span> · about {line.productName}</span>}
                    <span className="text-faint"> · {dateTime(m.createdAt)}</span>
                  </p>
                  <p className="text-[13px] text-ink">{m.body}</p>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t border-default pt-3">
          <Field label="About" htmlFor="reply-line" className="w-[180px]">
            <select
              id="reply-line"
              value={lineId}
              onChange={(e) => setLineId(e.target.value === '' ? '' : Number(e.target.value))}
              className="h-10 w-full rounded-control border border-default bg-card px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">The order</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>{l.productName}</option>
              ))}
            </select>
          </Field>
          <Field label="Reply" htmlFor="reply-body" className="min-w-[200px] flex-1">
            <Input
              id="reply-body"
              value={body}
              placeholder="We can hold 18% if the volume commitment stands…"
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <Button
            variant="primary"
            disabled={body.trim() === '' || reply.isPending}
            onClick={() => reply.mutate()}
          >
            {reply.isPending ? 'Sending…' : 'Reply'}
          </Button>
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

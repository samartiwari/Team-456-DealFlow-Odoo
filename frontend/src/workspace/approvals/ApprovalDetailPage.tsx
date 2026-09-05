import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { decide, getApproval } from '@/shared/api/endpoints'
import type { ApprovalDetail, Decision } from '@/shared/api/types'
import { STAGE_LABEL, STAGE_TONE } from '@/shared/lib/stage'
import { Badge, Card, CardBody, CardHeader, CardTitle, ErrorState, PageHeader, Spinner } from '@/shared/ui'
import { AuditTrail } from './AuditTrail'
import { ChainStepper } from './ChainStepper'
import { DecisionPanel } from './DecisionPanel'
import { RiskBreakdown } from './RiskBreakdown'

export default function ApprovalDetailPage() {
  const { id: param } = useParams()
  const id = Number(param)
  const qc = useQueryClient()
  const key = ['approval', id]
  const [problem, setProblem] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: key,
    queryFn: () => getApproval(id),
    enabled: Number.isFinite(id),
  })

  const act = useMutation({
    mutationFn: (v: { decision: Decision; reason: string }) => decide(id, v),
    onSuccess: (next: ApprovalDetail) => {
      // decide() returns the full detail, so the cache is replaced not patched.
      qc.setQueryData(key, next)
      qc.invalidateQueries({ queryKey: ['approvals'] })
      qc.invalidateQueries({ queryKey: ['quotations'] })
      qc.invalidateQueries({ queryKey: ['quotation', next.quotation.id] })
      setProblem(null)
    },
    // The three 409s are business guards, not bugs — show the sentence, keep the screen.
    onError: (e) =>
      setProblem(e instanceof ApiError ? e.message : 'Something went wrong. Try again.'),
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
        title="Could not load this approval"
        description={error instanceof ApiError ? error.message : 'It may have been withdrawn.'}
      />
    )
  }

  const quote = data.quotation
  const actionable = data.steps.find((s) => s.state === 'PENDING')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link
          to="/app/approvals"
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
        >
          <span aria-hidden="true">&larr;</span> Approval queue
        </Link>

        <PageHeader
          title={quote.ref}
          description={`${quote.customerName} · ${quote.tier} tier`}
          actions={<Badge tone={STAGE_TONE[quote.stage]}>{STAGE_LABEL[quote.stage]}</Badge>}
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

      <Card>
        <CardHeader>
          <CardTitle>Approval chain</CardTitle>
        </CardHeader>
        <CardBody>
          <ChainStepper steps={data.steps} state={data.state} />
        </CardBody>
      </Card>

      <div className="grid gap-4 min-[1280px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <RiskBreakdown quote={quote} score={data.riskScore} />
          <AuditTrail entries={data.audit} />
        </div>

        <div className="min-w-0">
          <DecisionPanel
            step={actionable}
            pending={act.isPending}
            onDecide={(decision, reason) => act.mutate({ decision, reason })}
          />
        </div>
      </div>
    </div>
  )
}

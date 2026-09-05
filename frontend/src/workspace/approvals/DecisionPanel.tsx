import { useState } from 'react'
import { useActor } from '@/shared/api/actor'
import type { ApprovalStep, Decision } from '@/shared/api/types'
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Textarea } from '@/shared/ui'

const ROLE_LABEL = { MANAGER: 'Sales Manager', FINANCE: 'Finance' } as const

/**
 * A reason is mandatory on all three decisions — the backend returns 422
 * without one, so the button is disabled rather than letting the round trip
 * fail for something the screen already knows.
 */
export function DecisionPanel({
  step,
  blockedForMe,
  pending,
  onDecide,
}: {
  step: ApprovalStep | undefined
  /** This user has a step in the chain, but an earlier one has not cleared yet. */
  blockedForMe: ApprovalStep | undefined
  pending: boolean
  onDecide: (decision: Decision, reason: string) => void
}) {
  const actor = useActor()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const missing = reason.trim().length === 0

  /* A rep never decides; an approver only decides on their own step. */
  const mine = step !== undefined && step.role === actor.role

  if (step && !mine) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Decision</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          <p className="text-[13px] text-muted">
            {blockedForMe
              ? `Waiting on the ${ROLE_LABEL[step.role].toLowerCase()} to decide first. Your ${ROLE_LABEL[blockedForMe.role].toLowerCase()} step opens once they approve.`
              : `This step belongs to the ${ROLE_LABEL[step.role].toLowerCase()}. You are signed in as ${actor.name}.`}
          </p>
          {actor.role === 'REP' && (
            <p className="text-[13px] text-muted">
              As the rep you can follow progress here, but you cannot approve your own quotation.
            </p>
          )}
        </CardBody>
      </Card>
    )
  }

  if (!step) {
    return (
      <Card>
        <CardBody>
          <p className="text-[13px] text-muted">
            This approval is settled. No further decision can be recorded.
          </p>
        </CardBody>
      </Card>
    )
  }

  const submit = (decision: Decision) => {
    setTouched(true)
    if (missing) return
    onDecide(decision, reason.trim())
    setReason('')
    setTouched(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your decision</CardTitle>
        <span className="text-[12px] text-muted">as {ROLE_LABEL[step.role]}</span>
      </CardHeader>

      <CardBody className="flex flex-col gap-4">
        <Field
          label="Reason"
          htmlFor="reason"
          error={touched && missing ? 'A reason is required for every decision.' : null}
          hint="Recorded in the audit trail against your name."
        >
          <Textarea
            id="reason"
            value={reason}
            invalid={touched && missing}
            disabled={pending}
            placeholder="Margin acceptable given the volume commitment…"
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          {/* Approve is the primary action; the other two are deliberately not blue. */}
          <Button variant="primary" disabled={pending} onClick={() => submit('APPROVE')}>
            {pending ? 'Working…' : 'Approve'}
          </Button>
          <Button disabled={pending} onClick={() => submit('RETURN')}>
            Return for revision
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => submit('REJECT')}>
            Reject
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

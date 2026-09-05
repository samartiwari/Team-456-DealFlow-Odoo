import type { ApprovalStep, RequestState } from '@/shared/api/types'
import { cn } from '@/shared/ui'

const ROLE_LABEL = { MANAGER: 'Sales Manager', FINANCE: 'Finance' } as const

type Look = 'done' | 'current' | 'pending' | 'failed'

const DOT: Record<Look, string> = {
  done: 'bg-success text-white border-success',
  current: 'bg-primary text-white border-primary',
  pending: 'bg-card text-muted border-strong',
  failed: 'bg-danger text-white border-danger',
}

const TEXT: Record<Look, string> = {
  done: 'text-ink',
  current: 'text-primary font-semibold',
  pending: 'text-muted',
  failed: 'text-danger-tx font-semibold',
}

function lookOf(state: ApprovalStep['state']): Look {
  if (state === 'APPROVED') return 'done'
  if (state === 'PENDING') return 'current'
  if (state === 'REJECTED' || state === 'RETURNED') return 'failed'
  return 'pending' // BLOCKED — waiting on an earlier step
}

/* A div, not an li: the <ol> below owns the list items, and nesting li inside
   li is invalid HTML that React warns about at runtime. */
function Node({ look, label, sub }: { look: Look; label: string; sub?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          'grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold',
          DOT[look],
        )}
        aria-hidden="true"
      >
        {look === 'done' ? '✓' : look === 'failed' ? '!' : ''}
      </span>
      <span className="min-w-0">
        <span className={cn('block truncate text-[13px]', TEXT[look])}>{label}</span>
        {sub && <span className="block truncate text-[11px] text-faint">{sub}</span>}
      </span>
    </div>
  )
}

/**
 * Submitted -> Sales Manager -> Finance -> Approved.
 * A BLOCKED step renders greyed and offers no buttons: Finance can never act
 * before the Manager, so it must not look actionable.
 */
export function ChainStepper({
  steps,
  state,
}: {
  steps: ApprovalStep[]
  state: RequestState
}) {
  const settled = state !== 'OPEN'
  const finalLook: Look =
    state === 'APPROVED' ? 'done'
    : state === 'REJECTED' || state === 'RETURNED' ? 'failed'
    : 'pending'

  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-3">
      <li className="flex items-center gap-3">
        <Node look="done" label="Submitted" />
        <span aria-hidden="true" className="h-px w-6 bg-strong" />
      </li>

      {steps.map((s) => (
        <li key={s.id} className="flex items-center gap-3">
          <Node
            look={lookOf(s.state)}
            label={ROLE_LABEL[s.role]}
            sub={
              s.decidedByName
                ? `${s.state.toLowerCase()} · ${s.decidedByName}`
                : s.state === 'BLOCKED'
                  ? 'waiting on the previous step'
                  : 'awaiting decision'
            }
          />
          <span aria-hidden="true" className="h-px w-6 bg-strong" />
        </li>
      ))}

      <li>
        <Node
          look={finalLook}
          label={state === 'REJECTED' ? 'Rejected' : state === 'RETURNED' ? 'Returned' : 'Approved'}
          sub={settled ? undefined : 'not yet'}
        />
      </li>
    </ol>
  )
}

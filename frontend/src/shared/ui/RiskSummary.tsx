import { Badge } from './Badge'
import type { ApproverRole } from '@/shared/api/types'

const LABEL: Record<ApproverRole, string> = {
  MANAGER: 'Sales Manager',
  FINANCE: 'Finance',
}

/**
 * Colour is derived from requiredChain, never from hardcoded score thresholds —
 * the bands live in approval_rule and an admin can move them without a redeploy.
 */
function toneFor(chain: ApproverRole[]) {
  if (chain.length === 0) return 'success' as const
  if (chain.length === 1) return 'warning' as const
  return 'danger' as const
}

export function RiskBadge({ score, chain }: { score: number; chain: ApproverRole[] }) {
  return (
    <Badge tone={toneFor(chain)}>
      Risk {score}
    </Badge>
  )
}

/** What confirming will do, shown before the rep presses it. */
export function ChainPreview({ chain }: { chain: ApproverRole[] }) {
  if (chain.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        No approval needed — confirming approves this quotation immediately.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] text-muted">Confirming will route to:</p>
      <ol className="flex flex-wrap items-center gap-1.5">
        {chain.map((role, i) => (
          <li key={role} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted">→</span>}
            <span className="rounded-control border border-default bg-neutral-bg px-2 py-1 text-[12px] font-medium text-ink-2">
              {LABEL[role]}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Per-line verdict. Reads overagePts from the server; never a comparison computed here. */
export function LineChip({ overagePts }: { overagePts: number }) {
  return overagePts > 0 ? (
    <Badge tone="warning">OVER +{overagePts} pt</Badge>
  ) : (
    <Badge tone="neutral">OK</Badge>
  )
}

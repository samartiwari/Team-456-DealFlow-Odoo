import type { AuditEntry } from '@/shared/api/types'
import { dateTime } from '@/shared/lib/format'
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@/shared/ui'

const ACTION_LABEL: Record<string, string> = {
  QUOTATION_CREATED: 'Quotation created',
  CONFIRMED: 'Confirmed',
  STEP_APPROVED: 'Step approved',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RETURNED: 'Returned for revision',
}

/** Append-only, newest last. Every entry carries actor, timestamp and reason. */
export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit trail</CardTitle>
        <span className="text-[12px] text-faint tnum">{entries.length} entries</span>
      </CardHeader>

      {entries.length === 0 ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <CardBody>
          <ol className="flex flex-col">
            {entries.map((e, i) => (
              <li
                key={e.id}
                className={i === entries.length - 1 ? 'pb-0' : 'border-b border-default pb-3 mb-3'}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[13px] font-medium text-ink">
                    {ACTION_LABEL[e.action] ?? e.action}
                  </span>
                  <span className="text-[11px] text-faint tnum">{dateTime(e.createdAt)}</span>
                </div>

                <p className="text-[12px] text-muted">
                  {e.actorName ?? 'System'}
                  {e.fromState && e.toState && e.fromState !== e.toState && (
                    <span className="text-faint">
                      {' · '}
                      {e.fromState.replace(/_/g, ' ').toLowerCase()} →{' '}
                      {e.toState.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  )}
                </p>

                {e.reason && (
                  <p className="mt-1 border-l-2 border-default pl-2 text-[12px] italic text-ink-2">
                    {e.reason}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </CardBody>
      )}
    </Card>
  )
}

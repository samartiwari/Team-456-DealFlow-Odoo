import type { Suggestion } from '@/shared/api/types'
import { money } from '@/shared/lib/format'
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/shared/ui'

/**
 * B5 — what else belongs on this order.
 *
 * The cards arrive ranked and filtered; this renders them in the order given
 * and never re-sorts. `score` is deliberately not shown: it orders the list and
 * nothing else, and a bare "0.87" on a card only invites "87% of what?".
 *
 * What is shown is `marginDeltaPt` — what adding this does to *this* deal. The
 * two disagree often, so the top card is not a claim about profitability.
 */
export function UpsellPanel({
  suggestions,
  loading,
  busy,
  onAdd,
  onDismiss,
}: {
  suggestions: Suggestion[]
  loading: boolean
  /** A write is in flight — the buttons wait so a card cannot be added twice. */
  busy: boolean
  onAdd: (productId: number) => void
  onDismiss: (productId: number) => void
}) {
  if (loading) {
    return (
      <Card>
        <CardBody className="flex justify-center py-6">
          <Spinner />
        </CardBody>
      </Card>
    )
  }

  // Nothing to suggest is normal, not an error: an empty cart, every pairing
  // already taken, or a quotation that can no longer be edited. An empty
  // container would be noise, so the panel is simply absent.
  if (suggestions.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upsell and cross-sell</CardTitle>
        <span className="text-[12px] text-muted">
          Margin impact is measured against this order
        </span>
      </CardHeader>

      <CardBody>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {suggestions.map((s) => (
            <li
              key={s.productId}
              className="flex flex-col gap-3 rounded-card border border-default bg-card p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{s.productName}</p>
                  <p className="text-[12px] text-muted">{s.category}</p>
                </div>
                {s.promoted && <Badge tone="info">Promoted</Badge>}
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-ink-2 tnum">{money(s.unitPrice)}</span>
                <MarginDelta pt={s.marginDeltaPt} />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onAdd(s.productId)}
                  className="flex-1"
                >
                  Add to quote
                </Button>
                <Button size="sm" disabled={busy} onClick={() => onDismiss(s.productId)}>
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

/**
 * A negative delta is real information, not a failure: a healthy product can
 * still dilute a healthier order. Amber says "look at this", red would say
 * "something is broken", so it reads as a caution.
 */
function MarginDelta({ pt }: { pt: number }) {
  const sign = pt > 0 ? '+' : ''
  return (
    <span
      className={[
        'text-sm font-semibold tnum',
        pt > 0 ? 'text-success-tx' : pt < 0 ? 'text-warning-tx' : 'text-muted',
      ].join(' ')}
      title={
        pt < 0
          ? 'Adding this lowers the order margin — the product is healthy, but this order is healthier'
          : 'Percentage points the order margin moves if this is added'
      }
    >
      {sign}
      {pt.toFixed(2)} pt
    </span>
  )
}

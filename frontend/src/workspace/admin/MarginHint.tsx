import { Badge } from '@/shared/ui'

/**
 * Margin, with a warning when it goes thin.
 *
 * Shown live as price and cost are typed, because a cost typed one digit short
 * is the kind of mistake a form should catch while it is being made rather than
 * after it has repriced the catalog.
 */
export function MarginHint({ pct }: { pct: number }) {
  if (pct < 0) return <Badge tone="danger">{pct.toFixed(2)}% — sells at a loss</Badge>
  if (pct < 10) return <Badge tone="warning">{pct.toFixed(2)}% — thin</Badge>
  return <span className="text-[13px] font-medium text-ink tnum">{pct.toFixed(2)}%</span>
}

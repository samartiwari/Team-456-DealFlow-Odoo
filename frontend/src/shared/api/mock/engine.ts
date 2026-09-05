import type { ApproverRole, QuotationLine } from '../types'
import { CONFIG, UNIT_COST } from './data'

/**
 * A stand-in for the server, not client logic.
 *
 * The real authority is `com.dealflow.domain.risk.BlendedRiskEngine` and
 * `PricingService`; this mirrors their documented formulas so screens can be
 * built and driven before the API is reachable. Screens still render whatever
 * comes back — they never do this arithmetic themselves.
 *
 * Acceptance: the seeded Acme quote (Laptop Pro x6 @ 12%, Setup Service @ 18%)
 * must produce riskScore 33 and marginPct 17.87. Re-verify against the live
 * backend before trusting any number shown here.
 */

const round = (n: number, dp: number) => {
  const f = 10 ** dp
  return Math.round((n + Number.EPSILON) * f) / f
}

export interface DraftLine {
  id: number
  productId: number
  productName: string
  category: string
  unitPrice: number
  quantity: number
  discountPct: number
  categoryCeilingPct: number | null
}

export interface Priced {
  lines: QuotationLine[]
  subtotal: number
  grandTotal: number
  marginPct: number
  riskScore: number
  requiredChain: ApproverRole[]
}

export function price(
  draft: DraftLine[],
  orderDiscountPct: number,
  tierCeilingPct: number,
): Priced {
  if (draft.length === 0) {
    return { lines: [], subtotal: 0, grandTotal: 0, marginPct: 0, riskScore: 0, requiredChain: [] }
  }

  // Order-level discount is pushed down to every line BEFORE any ceiling check.
  // Without this a rep sits each line at its ceiling, adds 10% at order level,
  // and escapes governance entirely.
  const rows = draft.map((l) => {
    const effective = l.discountPct + orderDiscountPct
    const net = l.unitPrice * l.quantity * (1 - effective / 100)
    const cost = (UNIT_COST[l.productId] ?? 0) * l.quantity
    const allowed = Math.min(tierCeilingPct, l.categoryCeilingPct ?? tierCeilingPct)
    return { l, effective, net, margin: net - cost, allowed, overage: Math.max(0, effective - allowed) }
  })

  const orderNet = rows.reduce((s, r) => s + r.net, 0)
  const orderMargin = rows.reduce((s, r) => s + r.margin, 0)

  const lines: QuotationLine[] = rows.map((r) => ({
    id: r.l.id,
    productName: r.l.productName,
    category: r.l.category,
    quantity: r.l.quantity,
    unitPrice: r.l.unitPrice,
    discountPct: round(r.l.discountPct, 2),
    effectiveDiscountPct: round(r.effective, 2),
    allowedDiscountPct: round(r.allowed, 2),
    overagePts: round(r.overage, 2),
    weightPct: orderNet === 0 ? 0 : round((r.net / orderNet) * 100, 2),
    netTotal: round(r.net, 2),
  }))

  const weightedOverage =
    orderNet === 0 ? 0 : rows.reduce((s, r) => s + r.overage * (r.net / orderNet), 0)
  const maxOverage = rows.reduce((m, r) => Math.max(m, r.overage), 0)

  const riskScore = Math.min(
    100,
    Math.round(weightedOverage * CONFIG.weightedWeight + maxOverage * CONFIG.maxWeight),
  )

  const requiredChain: ApproverRole[] =
    riskScore >= CONFIG.financeBandMin
      ? ['MANAGER', 'FINANCE']
      : riskScore >= CONFIG.managerBandMin
        ? ['MANAGER']
        : []

  return {
    lines,
    subtotal: round(orderNet, 2),
    grandTotal: round(orderNet, 2),
    marginPct: orderNet === 0 ? 0 : round((orderMargin / orderNet) * 100, 2),
    riskScore,
    requiredChain,
  }
}

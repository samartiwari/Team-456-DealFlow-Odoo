import type { ApproverRole, QuotationLine } from '../types'
import { unitCostOf } from './data'
import { APPROVAL, categoryCeiling } from './policy'

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

/**
 * A line stores no ceiling of its own. It is looked up from the category on
 * every recompute, so editing product_category moves quotations that already
 * exist rather than only new ones.
 */
export interface DraftLine {
  id: number
  productId: number
  productName: string
  category: string
  unitPrice: number
  quantity: number
  discountPct: number
  /**
   * The price this line was agreed at, written when the quotation left draft.
   *
   * A line stores no price of its own, so every read re-resolves it from the
   * catalog. That is invisible while the catalog is read-only and a serious
   * problem the moment it is not: correcting Laptop Pro from 80,000 to 85,000
   * would silently reprice every quotation ever made, the approvals taken
   * against them included. Drafts should follow the catalog; settled deals
   * should not.
   */
  frozenUnitPrice?: number
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
    const cost = unitCostOf(l.productId) * l.quantity
    const catCeiling = categoryCeiling(l.category)
    const allowed = Math.min(tierCeilingPct, catCeiling ?? tierCeilingPct)
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
    Math.round(weightedOverage * APPROVAL.weightedWeight + maxOverage * APPROVAL.maxWeight),
  )

  const requiredChain: ApproverRole[] =
    riskScore >= APPROVAL.financeBandMin
      ? ['MANAGER', 'FINANCE']
      : riskScore >= APPROVAL.managerBandMin
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

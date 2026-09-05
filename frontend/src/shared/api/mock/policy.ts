import { getActor } from '../actor'
import { ApiError } from '../client'
import type {
  ApprovalPolicy, CustomerTier, DiscountPolicy, PolicyChange, ProductCategory, UpdatePolicyBody,
} from '../types'

/**
 * The discount policy: the rows behind PDF section A3.
 *
 * These mirror three backend tables — customer_tier, product_category and
 * system_config — and they are the *only* place a ceiling or a band is
 * written down. Everything else joins to them at read time, which is what
 * makes the configuration screen real: change a ceiling here and every
 * existing quotation re-prices and re-routes, exactly as changing the row
 * would.
 *
 * Mutable on purpose. A frozen copy would make the screen a decoration.
 */

/** customer_tier. Ordered as the ladder reads, weakest first. */
export const TIERS: CustomerTier[] = [
  { id: 1, name: 'Bronze', ceilingPct: 5 },
  { id: 2, name: 'Silver', ceilingPct: 10 },
  { id: 3, name: 'Gold', ceilingPct: 15 },
]

/**
 * product_category. ceilingPct is nullable in the schema on purpose: a
 * category without one falls back to the tier ceiling alone.
 */
export const CATEGORIES: ProductCategory[] = [
  { id: 1, name: 'Hardware', ceilingPct: 15, stockable: true },
  { id: 2, name: 'Services', ceilingPct: 10, stockable: false },
  { id: 3, name: 'Subscriptions', ceilingPct: 8, stockable: false },
]

/**
 * system_config, typed. The keys are the seeded rows:
 *   risk.weight.weighted · risk.weight.max
 *   approval.band.manager.min · approval.band.finance.min
 */
export const APPROVAL: ApprovalPolicy = {
  weightedWeight: 6,
  maxWeight: 4,
  managerBandMin: 1,
  financeBandMin: 50,
}

/** Ceiling for a tier by name, matched the way the customer row joins. */
export function tierCeiling(tierName: string): number {
  return TIERS.find((t) => t.name.toUpperCase() === tierName.toUpperCase())?.ceilingPct ?? 0
}

/** Null when the category sets no ceiling of its own. */
export function categoryCeiling(categoryName: string): number | null {
  return CATEGORIES.find((c) => c.name === categoryName)?.ceilingPct ?? null
}

export function isStockable(categoryName: string): boolean {
  return CATEGORIES.find((c) => c.name === categoryName)?.stockable ?? true
}

/* --------------------------------------------------- persistence */

export interface PolicySnapshot {
  tiers: CustomerTier[]
  categories: ProductCategory[]
  approval: ApprovalPolicy
  history?: PolicyChange[]
}

export function policySnapshot(): PolicySnapshot {
  return { tiers: TIERS, categories: CATEGORIES, approval: APPROVAL, history: policyHistory }
}

/** Restores an edited policy after a reload, in place so live references hold. */
export function restorePolicy(snap: PolicySnapshot | undefined): void {
  if (!snap) return
  if (snap.tiers) TIERS.splice(0, TIERS.length, ...snap.tiers)
  if (snap.categories) CATEGORIES.splice(0, CATEGORIES.length, ...snap.categories)
  if (snap.approval) Object.assign(APPROVAL, snap.approval)
  if (snap.history) {
    policyHistory.splice(0, policyHistory.length, ...snap.history)
    seq.change = snap.history.reduce((m, c) => Math.max(m, c.id), 0)
  }
}

/* ------------------------------------------------------ change history */

export const policyHistory: PolicyChange[] = []
const seq = { change: 0 }

/** The whole screen in one shape, newest history first. */
export function readPolicy(): DiscountPolicy {
  return {
    tiers: TIERS,
    categories: CATEGORIES,
    approval: APPROVAL,
    history: [...policyHistory].reverse(),
  }
}

/* ---------------------------------------------------------- validation */

const pctOrThrow = (value: number, what: string, field: string): number => {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new ApiError(422, `${what} must be between 0 and 100.`, field)
  }
  return value
}

const fmt = (pct: number | null) =>
  pct === null ? 'tier ceiling' : `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`

/**
 * Applies an edit, or rejects the whole thing.
 *
 * Validation runs over every field before a single value is written, so a bad
 * band cannot leave half a policy applied — the engine reads these objects on
 * every recompute, and a half-written policy would price quotations wrongly.
 */
export function writePolicy(body: UpdatePolicyBody): DiscountPolicy {
  const actor = getActor()
  if (actor.role !== 'MANAGER') {
    throw new ApiError(
      403,
      `${actor.name} is a ${actor.role.toLowerCase()}. Only a sales manager can change the discount policy.`,
    )
  }

  const changes: string[] = []

  /* ---- validate everything first ---- */

  const tierEdits = (body.tiers ?? []).map((edit) => {
    const row = TIERS.find((t) => t.id === edit.id)
    if (!row) throw new ApiError(404, `Tier ${edit.id} not found.`, 'tiers')
    return { row, next: pctOrThrow(edit.ceilingPct, `The ${row.name} ceiling`, 'tiers') }
  })

  const categoryEdits = (body.categories ?? []).map((edit) => {
    const row = CATEGORIES.find((c) => c.id === edit.id)
    if (!row) throw new ApiError(404, `Category ${edit.id} not found.`, 'categories')
    const next =
      edit.ceilingPct === null
        ? null
        : pctOrThrow(edit.ceilingPct, `The ${row.name} ceiling`, 'categories')
    return { row, next }
  })

  const nextApproval = { ...APPROVAL, ...(body.approval ?? {}) }
  pctOrThrow(nextApproval.managerBandMin, 'The manager band', 'managerBandMin')
  pctOrThrow(nextApproval.financeBandMin, 'The finance band', 'financeBandMin')
  if (nextApproval.managerBandMin > nextApproval.financeBandMin) {
    throw new ApiError(
      422,
      'The finance band cannot start below the manager band — finance is the second step, not the first.',
      'financeBandMin',
    )
  }
  for (const [key, label] of [['weightedWeight', 'weighted overage'], ['maxWeight', 'worst line']] as const) {
    const v = nextApproval[key]
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw new ApiError(422, `The ${label} weight must be between 0 and 100.`, key)
    }
  }
  if (nextApproval.weightedWeight === 0 && nextApproval.maxWeight === 0) {
    throw new ApiError(
      422,
      'Both weights cannot be zero — every quotation would score 0 and nothing would ever need approval.',
      'weightedWeight',
    )
  }

  /* ---- only now write ---- */

  for (const { row, next } of tierEdits) {
    if (row.ceilingPct === next) continue
    changes.push(`${row.name} tier ceiling ${fmt(row.ceilingPct)} to ${fmt(next)}`)
    row.ceilingPct = next
  }

  for (const { row, next } of categoryEdits) {
    if (row.ceilingPct === next) continue
    changes.push(`${row.name} category ceiling ${fmt(row.ceilingPct)} to ${fmt(next)}`)
    row.ceilingPct = next
  }

  const APPROVAL_LABEL: Record<keyof ApprovalPolicy, string> = {
    weightedWeight: 'Weighted overage weight',
    maxWeight: 'Worst line weight',
    managerBandMin: 'Manager band starts at',
    financeBandMin: 'Finance band starts at',
  }
  for (const key of Object.keys(APPROVAL_LABEL) as Array<keyof ApprovalPolicy>) {
    if (APPROVAL[key] === nextApproval[key]) continue
    changes.push(`${APPROVAL_LABEL[key]} ${APPROVAL[key]} to ${nextApproval[key]}`)
    APPROVAL[key] = nextApproval[key]
  }

  if (changes.length > 0) {
    policyHistory.push({
      id: ++seq.change,
      actorName: actor.name,
      summary: changes.join(' · '),
      createdAt: new Date().toISOString(),
    })
  }

  return readPolicy()
}

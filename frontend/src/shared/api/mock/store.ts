import { getActor } from '../actor'
import { ApiError } from '../client'
import type {
  ApprovalDetail, ApprovalStep, ApprovalSummary, ApproverRole, AuditEntry,
  AcceptAllocationBody, AllocationPlan, FulfilmentBoard, FulfilmentOrder, StockRow,
  BillingView, CancelSubscriptionBody, ChangeSubscriptionBody, ClockAdvanceResult,
  ConfirmResult, CreditNote, DecideBody, Invoice, InvoiceLine, ProrationResult,
  NegotiationMessage, NegotiationThread, QuotationStage, QuotationSummary, RecomputeResult,
  RecordPaymentBody, ReplyBody, SendResult, Subscription, Suggestion,
} from '../types'
import { ACTOR_NAMES, UNIT_COST, customers, products } from './data'
import { price, type DraftLine } from './engine'
import {
  STOCK, WAREHOUSES, costOf, receiveStock, restoreStock, stockSnapshot, suggest, validateOverride,
} from './allocation'
import { UPSELL_RULES, isRecurring, policySnapshot, restorePolicy, type PolicySnapshot } from './policy'
import { explain, periodContaining, prorate, round2, schedule } from './billing'

/** In-memory state for the mock server. Resets on reload, which is fine for a slice. */

export interface MockQuotation {
  id: number
  ref: string
  customerId: number
  repId: number
  stage: QuotationStage
  orderDiscountPct: number
  lines: DraftLine[]
  /** The score carried at the last approval — what a counter is measured against. */
  approvedBaselineScore?: number | null
  sentAt?: string | null
}

interface MockApproval {
  approvalId: number
  quotationId: number
  riskScore: number
  state: 'OPEN' | 'APPROVED' | 'REJECTED' | 'RETURNED'
  steps: ApprovalStep[]
  createdAt: string
}

const PERSIST_KEY = 'df360.mock'

interface Snapshot {
  seq: typeof seq
  quotations: MockQuotation[]
  approvals: MockApproval[]
  audit: Record<number, AuditEntry[]>
  /** Absent in snapshots written before the configuration screen existed. */
  policy?: PolicySnapshot
  /** Absent in snapshots written before stock could be received. */
  stock?: Record<number, Record<number, number>>
  accepted?: Record<number, AllocationPlan>
  dismissed?: Record<number, number[]>
}

/**
 * The mock is a stand-in for a server, so its state has to survive a page
 * reload — otherwise confirming a quotation and then opening the approvals
 * queue loses it, which is exactly the flow being demonstrated.
 */
function hydrate(): Snapshot | null {
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY)
    return raw ? (JSON.parse(raw) as Snapshot) : null
  } catch {
    return null
  }
}

export function persist(): void {
  try {
    sessionStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        seq, quotations, approvals, audit,
        policy: policySnapshot(), stock: stockSnapshot(), accepted, dismissed,
      }),
    )
  } catch {
    /* private browsing or quota — the mock just falls back to in-memory */
  }
}

export const seq = { line: 4, quotation: 2, approval: 0, audit: 2 }

/** The demo quote from the contract: Acme Gold, Laptop x6 @ 12%, Setup @ 18% -> risk 33. */
export const quotations: MockQuotation[] = [
  {
    id: 1, ref: 'Q-0001', customerId: 1, repId: 1, stage: 'DRAFT', orderDiscountPct: 0,
    lines: [
      { id: 1, productId: 1, productName: 'Laptop Pro', category: 'Hardware', unitPrice: 80000, quantity: 6, discountPct: 12 },
      { id: 2, productId: 2, productName: 'Setup Service', category: 'Services', unitPrice: 15000, quantity: 1, discountPct: 18 },
    ],
  },
  /**
   * The hybrid-billing fixture: one order carrying both line types.
   *
   * Q-0001 is the risk fixture and must keep scoring 33, so this is a second
   * order rather than a line added to it. Nothing here breaches a ceiling, so
   * it scored 0 and auto-approved — which is also what puts billing on it.
   */
  {
    id: 2, ref: 'Q-0002', customerId: 1, repId: 1, stage: 'APPROVED', orderDiscountPct: 0,
    approvedBaselineScore: 0, sentAt: null,
    lines: [
      { id: 3, productId: 1, productName: 'Laptop Pro', category: 'Hardware', unitPrice: 80000, quantity: 2, discountPct: 0 },
      { id: 4, productId: 3, productName: 'Support Plan', category: 'Subscriptions', unitPrice: 2000, quantity: 1, discountPct: 0 },
    ],
  },
]

const approvals: MockApproval[] = []

/**
 * Committed plans, keyed by quotation. A suggestion is never stored.
 *
 * Declared here rather than beside the allocation functions because the
 * hydrate block below restores it, and a const cannot be read before it is
 * initialised.
 */
const accepted: Record<number, AllocationPlan> = {}

/**
 * Dismissed suggestions, per quotation. A table row rather than browser state:
 * dismissing on one quotation must not touch another, and it has to survive a
 * reload the way any other decision does.
 */
const dismissed: Record<number, number[]> = {}

const audit: Record<number, AuditEntry[]> = {
  1: [{
    id: 1, action: 'QUOTATION_CREATED', fromState: null, toState: 'DRAFT',
    actorName: 'Rep One', reason: null,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  }],
  2: [{
    id: 2, action: 'CONFIRMED', fromState: 'DRAFT', toState: 'APPROVED',
    actorName: 'Rep One', reason: 'auto-approved, risk 0',
    createdAt: new Date(Date.now() - 7_200_000).toISOString(),
  }],
}

/* Restore a previous session's state, if there is one. */
const snap = hydrate()
if (snap) {
  Object.assign(seq, snap.seq)
  quotations.splice(0, quotations.length, ...snap.quotations)
  approvals.splice(0, approvals.length, ...snap.approvals)
  for (const k of Object.keys(audit)) delete audit[Number(k)]
  Object.assign(audit, snap.audit)
  restorePolicy(snap.policy)
  restoreStock(snap.stock)
  if (snap.accepted) Object.assign(accepted, snap.accepted)
  if (snap.dismissed) Object.assign(dismissed, snap.dismissed)
}

export function record(
  quotationId: number, action: string,
  from: QuotationStage | null, to: QuotationStage | null, reason: string | null,
) {
  const list = audit[quotationId] ?? (audit[quotationId] = [])
  list.push({
    id: ++seq.audit, action, fromState: from, toState: to,
    actorName: ACTOR_NAMES[getActor().id] ?? null, reason,
    createdAt: new Date().toISOString(),
  })
  persist()
}

/**
 * The brief gives quotation-building to the Sales Rep. A manager who also wrote
 * quotations would end up approving their own work — and with one manager
 * seeded, such a quotation could never be cleared by anyone.
 */
export function assertCanCreate(): void {
  const actor = getActor()
  if (actor.role !== 'REP') {
    throw new ApiError(
      403,
      `${actor.name} is a ${actor.role.toLowerCase()}. Only a sales rep can create a quotation.`,
    )
  }
}

export function find(id: number): MockQuotation {
  const q = quotations.find((x) => x.id === id)
  if (!q) throw new ApiError(404, `Quotation ${id} not found.`)
  return q
}

/**
 * A quotation is only editable while it is a draft, or after a reviewer returned
 * it for revision. Once it is out for approval — or approved, or rejected — its
 * lines and discounts are frozen: an approver decided on specific numbers, and
 * those numbers must not change underneath them.
 */
export function assertEditable(q: MockQuotation): void {
  if (q.stage !== 'DRAFT' && q.stage !== 'RETURNED') {
    throw new ApiError(409, `A quotation that is ${STAGE_WORD[q.stage]} can no longer be edited.`)
  }
}

const STAGE_WORD: Record<QuotationStage, string> = {
  DRAFT: 'a draft',
  RETURNED: 'returned for revision',
  PENDING_APPROVAL: 'out for approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SENT: 'with the customer',
  UNDER_NEGOTIATION: 'under negotiation',
  CONFIRMED: 'confirmed',
}

export function view(q: MockQuotation): RecomputeResult {
  const customer = customers().find((c) => c.id === q.customerId)!
  return {
    id: q.id, ref: q.ref, customerId: customer.id, customerName: customer.name, tier: customer.tier,
    stage: q.stage, currency: 'INR', orderDiscountPct: q.orderDiscountPct,
    approvedBaselineScore: q.approvedBaselineScore ?? null,
    ...price(q.lines, q.orderDiscountPct, customer.tierCeilingPct),
  }
}

export function summary(q: MockQuotation): QuotationSummary {
  const v = view(q)
  return { id: v.id, ref: v.ref, customerName: v.customerName, stage: v.stage, grandTotal: v.grandTotal, currency: v.currency }
}

export function detail(approvalId: number): ApprovalDetail {
  const a = approvals.find((x) => x.approvalId === approvalId)
  if (!a) throw new ApiError(404, `Approval ${approvalId} not found.`)
  return {
    approvalId: a.approvalId, riskScore: a.riskScore, state: a.state,
    quotation: view(find(a.quotationId)), steps: a.steps, audit: audit[a.quotationId] ?? [],
  }
}

/**
 * Scoped to the acting user's role.
 *
 * A rep sees nothing here — they track status on the quotation itself.
 * A manager sees approvals whose chain includes a MANAGER step.
 * Finance sees only the ones that scored high enough to need a FINANCE step,
 * which is why a low-risk quotation never reaches their queue at all.
 */
export function queue(): ApprovalSummary[] {
  const role = getActor().role
  return approvals
    .filter((a) => a.state === 'OPEN')
    .filter((a) => role === 'MANAGER' || role === 'FINANCE'
      ? a.steps.some((s) => s.role === role)
      : false)
    .map((a) => {
    const v = view(find(a.quotationId))
    return {
      approvalId: a.approvalId, quotationId: a.quotationId, ref: v.ref,
      customerName: v.customerName, riskScore: a.riskScore,
      requiredChain: a.steps.map((s) => s.role),
      awaitingRole: (a.steps.find((s) => s.state === 'PENDING')?.role ?? 'MANAGER') as ApproverRole,
      grandTotal: v.grandTotal, currency: v.currency, createdAt: a.createdAt,
    }
  })
}

/** Routes by itself. There is no "request approval" call — its absence is the feature. */
export function confirm(id: number): ConfirmResult {
  const q = find(id)
  if (q.stage !== 'DRAFT' && q.stage !== 'RETURNED') {
    throw new ApiError(409, 'Only a draft can be confirmed.')
  }
  const v = view(q)
  const from = q.stage

  if (v.requiredChain.length === 0) {
    q.stage = 'APPROVED'
    q.approvedBaselineScore = v.riskScore
    record(q.id, 'CONFIRMED', from, 'APPROVED', 'auto-approved, risk 0')
    return { quotation: view(q), approvalId: null }
  }

  q.stage = 'PENDING_APPROVAL'
  const steps: ApprovalStep[] = v.requiredChain.map((role, i) => ({
    id: i + 1, order: i + 1, role,
    state: i === 0 ? 'PENDING' : 'BLOCKED',
    decidedByName: null, reason: null, decidedAt: null,
  }))
  const approval: MockApproval = {
    approvalId: ++seq.approval, quotationId: q.id, riskScore: v.riskScore,
    state: 'OPEN', steps, createdAt: new Date().toISOString(),
  }
  approvals.push(approval)
  record(q.id, 'CONFIRMED', from, 'PENDING_APPROVAL', `risk ${v.riskScore}`)
  return { quotation: view(q), approvalId: approval.approvalId }
}

export function decide(approvalId: number, body: DecideBody): ApprovalDetail {
  const a = approvals.find((x) => x.approvalId === approvalId)
  if (!a) throw new ApiError(404, `Approval ${approvalId} not found.`)
  if (!body.reason?.trim()) throw new ApiError(422, 'A reason is required for every decision.', 'reason')

  const q = find(a.quotationId)
  const actor = getActor()
  if (actor.id === q.repId) throw new ApiError(409, 'A rep cannot approve their own quotation.')

  const step = a.steps.find((s) => s.state === 'PENDING')
  if (!step) throw new ApiError(409, 'This step is not actionable yet.')

  // The pending step belongs to one role. Finance cannot reach past a manager
  // step that is still open, and a rep can never decide at all.
  if (step.role !== actor.role) {
    const blocked = a.steps.find((s) => s.state === 'BLOCKED' && s.role === actor.role)
    throw new ApiError(
      409,
      blocked
        ? `This is waiting on the ${step.role === 'MANAGER' ? 'sales manager' : 'finance'} step first.`
        : `Only the ${step.role === 'MANAGER' ? 'sales manager' : 'finance'} can decide on this step.`,
    )
  }

  const stamp = {
    decidedByName: ACTOR_NAMES[actor.id] ?? null,
    reason: body.reason,
    decidedAt: new Date().toISOString(),
  }
  const from = q.stage

  if (body.decision === 'APPROVE') {
    Object.assign(step, { state: 'APPROVED', ...stamp })
    const next = a.steps.find((s) => s.state === 'BLOCKED')
    if (next) {
      next.state = 'PENDING'
      record(q.id, 'STEP_APPROVED', from, from, body.reason)
    } else {
      a.state = 'APPROVED'
      q.stage = 'APPROVED'
      // The score it was signed off at. A later counter is compared against
      // this, not against zero, so better terms never re-trigger the chain.
      q.approvedBaselineScore = view(q).riskScore
      record(q.id, 'APPROVED', from, 'APPROVED', body.reason)
    }
  } else if (body.decision === 'REJECT') {
    Object.assign(step, { state: 'REJECTED', ...stamp })
    a.state = 'REJECTED'
    q.stage = 'REJECTED'
    record(q.id, 'REJECTED', from, 'REJECTED', body.reason)
  } else {
    Object.assign(step, { state: 'RETURNED', ...stamp })
    a.state = 'RETURNED'
    q.stage = 'RETURNED'
    record(q.id, 'RETURNED', from, 'RETURNED', body.reason)
  }

  return detail(approvalId)
}

/* ------------------------------------------------ allocation (B6) */

function assertAllocatable(q: MockQuotation): void {
  if (q.stage !== 'APPROVED') {
    throw new ApiError(409, 'Only an approved quotation can be allocated.')
  }
}

/** Safe to call repeatedly — computes a suggestion and stores nothing. */
export function allocationFor(id: number): AllocationPlan {
  const q = find(id)
  assertAllocatable(q)

  const committed = accepted[id]
  if (committed) return committed

  const s = suggest(q.lines)
  return {
    quotationId: q.id, ref: q.ref, status: 'SUGGESTED',
    ...s, currency: 'INR',
    // Flipped by a stock-arrival event, which is a stretch goal.
    consolidatable: false,
  }
}

export function commitAllocation(id: number, body: AcceptAllocationBody): AllocationPlan {
  const q = find(id)
  assertAllocatable(q)
  if (accepted[id]) throw new ApiError(409, 'This allocation has already been accepted.')

  const s = body?.lines
    ? { ...suggest(q.lines), lines: validateOverride(q.lines, body.lines) }
    : suggest(q.lines)

  // Cost and shipment count are derived from the lines that actually won, not
  // from the suggestion — an override changes both, and reporting the
  // suggestion's figures would show the wrong price for the accepted plan.
  const planned: AllocationPlan = {
    quotationId: q.id, ref: q.ref, status: 'ACCEPTED',
    lines: s.lines,
    backorders: s.backorders,
    shipmentCount: new Set(s.lines.map((l) => l.warehouseId)).size,
    estimatedCost: costOf(s.lines),
    currency: 'INR',
    consolidatable: false,
  }

  // Consume the stock, exactly as AllocationService.reserve does: it decrements
  // stock_item.quantity on accept. Leaving it untouched let a second plan draw
  // on units the first had already committed — the stock list showed East Depot
  // holding 5 laptops with 8 of them reserved.
  for (const line of planned.lines) {
    const shelf = STOCK[line.warehouseId]
    if (shelf?.[line.productId] !== undefined) shelf[line.productId] -= line.quantity
  }

  accepted[id] = planned
  record(q.id, 'ALLOCATION_ACCEPTED', q.stage, q.stage,
    `${planned.shipmentCount} shipment${planned.shipmentCount === 1 ? '' : 's'}`)
  persist()
  return planned
}

/* ------------------------------------------- fulfilment board (A4 / screen 7) */

/**
 * Reserved units, per warehouse and product.
 *
 * Only an *accepted* plan reserves anything. A suggestion is recomputed on
 * every read and commits nothing, so counting it would show stock as spoken
 * for when it is still free to promise elsewhere.
 */
function reservedUnits(): Map<string, number> {
  const reserved = new Map<string, number>()
  for (const plan of Object.values(accepted)) {
    for (const line of plan.lines) {
      const k = `${line.warehouseId}:${line.productId}`
      reserved.set(k, (reserved.get(k) ?? 0) + line.quantity)
    }
  }
  return reserved
}

function stockRows(): StockRow[] {
  const reserved = reservedUnits()
  const catalog = products()
  const rows: StockRow[] = []

  for (const w of WAREHOUSES) {
    for (const [productId, onHand] of Object.entries(STOCK[w.id] ?? {})) {
      const pid = Number(productId)
      const taken = reserved.get(`${w.id}:${pid}`) ?? 0
      rows.push({
        warehouseId: w.id,
        warehouseName: w.name,
        productId: pid,
        productName: catalog.find((p) => p.id === pid)?.name ?? `Product ${pid}`,
        // STOCK holds what is free, because accepting a plan consumes it — the
        // same single column the backend keeps. The physical figure is that
        // plus whatever is committed but not yet shipped.
        onHand: onHand + taken,
        reserved: taken,
        available: onHand,
      })
    }
  }

  return rows.sort(
    (a, b) => a.warehouseName.localeCompare(b.warehouseName) || a.productName.localeCompare(b.productName),
  )
}

/** Everything approved but not yet shipped, newest quotations last. */
function fulfilmentOrders(): FulfilmentOrder[] {
  return quotations
    .filter((q) => q.stage === 'APPROVED')
    .map((q) => {
      const v = view(q)
      const plan = accepted[q.id]
      const backordered = plan?.backorders.reduce((s, b) => s + b.quantity, 0) ?? 0
      return {
        quotationId: q.id,
        ref: q.ref,
        customerName: v.customerName,
        status: !plan ? 'AWAITING_SPLIT' : backordered > 0 ? 'BACKORDER' : 'SPLIT_ACCEPTED',
        warehouseNames: plan ? [...new Set(plan.lines.map((l) => l.warehouseName))] : [],
        backorderedUnits: backordered,
        grandTotal: v.grandTotal,
        currency: v.currency,
      } satisfies FulfilmentOrder
    })
}

export function fulfilmentBoard(): FulfilmentBoard {
  return { stock: stockRows(), orders: fulfilmentOrders() }
}

/**
 * Receive stock, then raise the consolidation flag.
 *
 * This is the mock's stand-in for StockArrivedEvent: any accepted plan still
 * waiting on this product can now ship in one consignment, which is what puts
 * the "Consolidate remaining backorder" prompt on its fulfilment screen.
 */
export function receiveStockInto(warehouseId: number, body: { productId: number; quantity: number }): FulfilmentBoard {
  const actor = getActor()
  if (actor.role === 'REP') {
    throw new ApiError(
      403,
      `${actor.name} is a rep. Warehouse stock is managed by operations.`,
    )
  }

  receiveStock(warehouseId, body.productId, body.quantity)

  for (const plan of Object.values(accepted)) {
    if (plan.backorders.some((b) => b.productId === body.productId)) {
      plan.consolidatable = true
    }
  }

  persist()
  return fulfilmentBoard()
}

/* --------------------------------------------------- upsell (A6 / B5) */

/** The candidate's own margin — what its pairing's floor is checked against. */
function ownMarginPct(productId: number, unitPrice: number): number {
  const cost = UNIT_COST[productId] ?? 0
  return unitPrice === 0 ? 0 : ((unitPrice - cost) / unitPrice) * 100
}

/** Free stock across every warehouse. STOCK holds what is not already reserved. */
function availableUnits(productId: number): number {
  return WAREHOUSES.reduce((sum, w) => sum + (STOCK[w.id]?.[productId] ?? 0), 0)
}

/**
 * Suggestions for a quotation, ranked and filtered — mirrors SuggestionRanker.
 *
 *   score = 0.5 x confidence + 0.3 x promoted + 0.2 x candidateMargin%/100
 *
 * confidence is 1.0 for every pairing here: these are admin-authored rows, and
 * mining co-purchase history is Phase 12. 1.0 is the ceiling a mined pairing
 * could reach, so the order is already right.
 *
 * score is a property of the PAIRING; marginDeltaPt is a property of THIS
 * order. They disagree often — the best-fitting suggestion is frequently not
 * the most profitable one — which is why both belong on the card.
 *
 * marginDeltaPt is the difference of two already-rounded margin percentages,
 * not a rounded difference, so it matches the server digit for digit.
 */
export function suggestionsFor(quotationId: number): Suggestion[] {
  const q = find(quotationId)

  // Adding a line to a non-editable quotation is a 409, so a card here would be
  // a dead end. Nothing to show is the honest answer, not an error.
  if (q.stage !== 'DRAFT' && q.stage !== 'RETURNED') return []

  const customer = customers().find((c) => c.id === q.customerId)!
  const inCart = new Set(q.lines.map((l) => l.productId))
  const hidden = new Set(dismissed[quotationId] ?? [])
  const catalog = products()

  const marginWithout = price(q.lines, q.orderDiscountPct, customer.tierCeilingPct).marginPct

  const candidates = new Map<number, { promoted: boolean; minMarginPct: number }>()
  for (const rule of UPSELL_RULES) {
    if (!inCart.has(rule.triggerProductId)) continue
    if (inCart.has(rule.suggestProductId) || hidden.has(rule.suggestProductId)) continue
    const prev = candidates.get(rule.suggestProductId)
    // Two cart lines can trigger the same candidate. Keep the kinder pairing:
    // promoted wins, and the lower floor wins.
    candidates.set(rule.suggestProductId, {
      promoted: (prev?.promoted ?? false) || rule.promoted,
      minMarginPct: Math.min(prev?.minMarginPct ?? rule.minMarginPct, rule.minMarginPct),
    })
  }

  const out: Suggestion[] = []
  for (const [productId, rule] of candidates) {
    const product = catalog.find((p) => p.id === productId)
    if (!product) continue

    // Stock gates physical goods only. A service or subscription holds none,
    // so filtering on it would hide every one of them permanently.
    if (product.stockable && availableUnits(productId) <= 0) continue

    const ownMargin = ownMarginPct(productId, product.unitPrice)
    if (ownMargin < rule.minMarginPct) continue

    const marginWith = price(
      [...q.lines, {
        id: -1, productId, productName: product.name, category: product.category,
        unitPrice: product.unitPrice, quantity: 1, discountPct: 0,
      }],
      q.orderDiscountPct,
      customer.tierCeilingPct,
    ).marginPct

    out.push({
      productId,
      productName: product.name,
      category: product.category,
      unitPrice: product.unitPrice,
      score: round2(0.5 * 1.0 + 0.3 * (rule.promoted ? 1 : 0) + 0.2 * (ownMargin / 100)),
      marginDeltaPt: round2(marginWith - marginWithout),
      promoted: rule.promoted,
    })
  }

  return out.sort((a, b) => b.score - a.score || a.productId - b.productId)
}

/** Idempotent: dismissing something already dismissed is a 200, not an error. */
export function dismissSuggestionFor(quotationId: number, productId: number): Suggestion[] {
  find(quotationId)
  if (!products().some((p) => p.id === productId)) {
    throw new ApiError(404, `Product ${productId} not found.`)
  }
  const list = dismissed[quotationId] ?? (dismissed[quotationId] = [])
  if (!list.includes(productId)) list.push(productId)
  persist()
  return suggestionsFor(quotationId)
}

/* --------------------------------------------- hybrid billing (A5 / B7) */

/**
 * The order forks but stays one order.
 *
 * One-time lines raise a single invoice; each recurring line raises a
 * subscription with twelve scheduled periods. There is no second quotation and
 * no separate subscription order — billingFor() returns both halves of the
 * same one.
 */
const invoices: Record<number, Invoice> = {}
const subscriptions: Record<number, Subscription> = {}
/** Which quotation each artefact belongs to. */
const invoiceOwner: Record<number, number> = {}
const subscriptionOwner: Record<number, number> = {}

const billingSeq = { invoice: 0, subscription: 0, line: 0, payment: 0, credit: 0, period: 0 }

/**
 * Today, for billing purposes. Twelve periods all sit in the future, so nothing
 * bills on its own during a five-minute demo — the clock is moved by hand.
 */
let billingClock = new Date().toISOString().slice(0, 10)

function assertBillable(q: MockQuotation): void {
  if (q.stage !== 'APPROVED') {
    throw new ApiError(404, 'Billing exists once a quotation is approved.')
  }
}

/** Finance and admin only. No admin is seeded, so in practice: finance. */
function assertFinance(): void {
  const actor = getActor()
  if (actor.role !== 'FINANCE') {
    throw new ApiError(
      403,
      `${actor.name} is a ${actor.role.toLowerCase()}. Payments and subscription changes are handled by finance.`,
    )
  }
}

/**
 * Status is derived from the payments and credits, every time.
 *
 * RecordPaymentBody deliberately has no status field: step 8 is exactly
 * "record a payment and watch the status change by itself", and a client that
 * could set it directly would make the step meaningless.
 */
function settle(inv: Invoice): Invoice {
  const paid = round2(inv.payments.reduce((sum, p) => sum + p.amount, 0))
  const credited = round2(inv.creditNotes.reduce((sum, c) => sum + c.amount, 0))
  inv.paid = paid
  inv.outstanding = Math.max(0, round2(inv.total - paid - credited))
  inv.status =
    inv.total > 0 && paid >= inv.total ? 'PAID'
    : paid > 0 ? 'PARTIALLY_PAID'
    : inv.total > 0 && credited >= inv.total ? 'CREDITED'
    : 'OPEN'
  return inv
}

function newInvoice(quotationId: number, lines: InvoiceLine[]): Invoice {
  const id = ++billingSeq.invoice
  const inv: Invoice = {
    id,
    ref: `INV-${String(id).padStart(4, '0')}`,
    quotationId,
    status: 'OPEN',
    issuedAt: new Date().toISOString(),
    lines,
    total: round2(lines.reduce((sum, l) => sum + l.netTotal, 0)),
    paid: 0,
    outstanding: 0,
    payments: [],
    creditNotes: [],
  }
  invoices[id] = settle(inv)
  invoiceOwner[id] = quotationId
  return inv
}

const billedFor = (quotationId: number) =>
  Object.values(invoiceOwner).includes(quotationId) ||
  Object.values(subscriptionOwner).includes(quotationId)

/**
 * Raises the invoice and the subscriptions for a quotation, once.
 *
 * Done on first read rather than inside confirm(), so a quotation approved
 * before this existed still bills correctly.
 */
function ensureBilling(q: MockQuotation): void {
  if (billedFor(q.id)) return

  const customer = customers().find((c) => c.id === q.customerId)!
  const priced = price(q.lines, q.orderDiscountPct, customer.tierCeilingPct)
  const oneTime: InvoiceLine[] = []

  for (const line of priced.lines) {
    // Effective discount, not the typed one: the invoice has to total what the
    // quotation quoted, and the order-level discount is part of that.
    const unitAfterDiscount = round2(line.unitPrice * (1 - line.effectiveDiscountPct / 100))

    if (isRecurring(line.category)) {
      const id = ++billingSeq.subscription
      const start = billingClock
      const periodAmount = round2(unitAfterDiscount * line.quantity)
      billingSeq.period += 12
      subscriptions[id] = {
        id,
        productId: q.lines.find((l) => l.id === line.id)!.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: unitAfterDiscount,
        periodAmount,
        status: 'ACTIVE',
        startDate: start,
        cancelledAt: null,
        periods: schedule(start, periodAmount, billingSeq.period - 11),
      }
      subscriptionOwner[id] = q.id
    } else {
      oneTime.push({
        id: ++billingSeq.line,
        description: `${line.productName} x${line.quantity}`,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPct: line.effectiveDiscountPct,
        netTotal: line.netTotal,
        proration: false,
      })
    }
  }

  if (oneTime.length > 0) newInvoice(q.id, oneTime)
}

export function billingFor(quotationId: number): BillingView {
  const q = find(quotationId)
  assertBillable(q)
  ensureBilling(q)

  const customer = customers().find((c) => c.id === q.customerId)!
  const mine = Object.entries(invoiceOwner)
    .filter(([, qid]) => qid === q.id)
    .map(([id]) => invoices[Number(id)])

  return {
    quotationId: q.id,
    ref: q.ref,
    customerName: customer.name,
    currency: 'INR',
    // The originating invoice is the first raised; later ones come from the
    // billing run and are reached through the invoices list.
    invoice: mine[0] ?? null,
    subscriptions: Object.entries(subscriptionOwner)
      .filter(([, qid]) => qid === q.id)
      .map(([id]) => subscriptions[Number(id)]),
  }
}

export function allInvoices(): Invoice[] {
  return Object.values(invoices).sort((a, b) => b.id - a.id)
}

export function invoiceById(id: number): Invoice {
  const inv = invoices[id]
  if (!inv) throw new ApiError(404, `Invoice ${id} not found.`)
  return inv
}

export function addPayment(invoiceId: number, body: RecordPaymentBody): Invoice {
  assertFinance()
  const inv = invoiceById(invoiceId)

  if (!Number.isFinite(body.amount) || body.amount <= 0) {
    throw new ApiError(422, 'A payment must be for more than zero.', 'amount')
  }
  if (inv.status === 'PAID') {
    throw new ApiError(409, `${inv.ref} is already paid in full.`)
  }
  if (round2(body.amount) > inv.outstanding) {
    throw new ApiError(422, `That is more than the ${inv.outstanding.toFixed(2)} outstanding.`, 'amount')
  }

  inv.payments.push({
    id: ++billingSeq.payment,
    amount: round2(body.amount),
    reference: body.reference?.trim() || null,
    recordedByName: ACTOR_NAMES[getActor().id] ?? 'Unknown',
    recordedAt: new Date().toISOString(),
  })
  settle(inv)
  persist()
  return inv
}

function subscriptionById(id: number): Subscription {
  const sub = subscriptions[id]
  if (!sub) throw new ApiError(404, `Subscription ${id} not found.`)
  return sub
}

/**
 * One code path for change and cancel — a cancellation is a change to quantity
 * zero, so the money is computed identically and the two cannot drift apart.
 */
function applyQuantityChange(
  sub: Subscription,
  nextQuantity: number,
  effectiveDate: string,
  reason: string,
): ProrationResult {
  const quotationId = subscriptionOwner[sub.id]
  const qtyDelta = nextQuantity - sub.quantity
  const period = periodContaining(sub.periods, effectiveDate)

  if (qtyDelta === 0 || !period) {
    return {
      deltaAmount: 0,
      explanation: qtyDelta === 0
        ? 'No change — the quantity is already what you asked for.'
        : 'That date is outside the twelve scheduled periods, so there is nothing to prorate.',
      creditNote: null,
      billing: billingFor(quotationId),
    }
  }

  const p = prorate(sub.unitPrice, qtyDelta, period, effectiveDate)
  const explanation = explain(p, qtyDelta)
  const invoice = billingFor(quotationId).invoice
  let creditNote: CreditNote | null = null

  if (p.deltaAmount > 0) {
    // An increase is charged, as a prorated line on this order's invoice.
    const line: InvoiceLine = {
      id: ++billingSeq.line,
      description: `${sub.productName} qty ${sub.quantity} to ${nextQuantity}, ${p.remainingDays} days`,
      quantity: qtyDelta,
      unitPrice: round2(sub.unitPrice * (p.remainingDays / p.days)),
      discountPct: 0,
      netTotal: p.deltaAmount,
      proration: true,
    }
    if (invoice) {
      invoice.lines.push(line)
      invoice.total = round2(invoice.total + p.deltaAmount)
      settle(invoice)
    } else {
      newInvoice(quotationId, [line])
    }
  } else if (p.deltaAmount < 0) {
    creditNote = {
      id: ++billingSeq.credit,
      ref: `CN-${String(billingSeq.credit).padStart(4, '0')}`,
      amount: Math.abs(p.deltaAmount),
      reason,
      issuedAt: new Date().toISOString(),
    }
    if (invoice) {
      invoice.creditNotes.push(creditNote)
      settle(invoice)
    }
  }

  sub.quantity = nextQuantity
  sub.periodAmount = round2(sub.unitPrice * nextQuantity)
  for (const row of sub.periods) {
    if (row.status === 'SCHEDULED') row.amount = sub.periodAmount
  }
  if (nextQuantity === 0) {
    sub.status = 'CANCELLED'
    sub.cancelledAt = effectiveDate
  }

  persist()
  return { deltaAmount: p.deltaAmount, explanation, creditNote, billing: billingFor(quotationId) }
}

export function changeSubscriptionQty(id: number, body: ChangeSubscriptionBody): ProrationResult {
  assertFinance()
  const sub = subscriptionById(id)
  if (sub.status === 'CANCELLED') throw new ApiError(409, 'That subscription has been cancelled.')
  if (!Number.isInteger(body.quantity) || body.quantity < 1) {
    throw new ApiError(422, 'Quantity must be at least one — cancel the subscription instead.', 'quantity')
  }
  return applyQuantityChange(sub, body.quantity, body.effectiveDate ?? billingClock, 'Quantity reduced mid-period')
}

export function cancelSubscriptionById(id: number, body: CancelSubscriptionBody): ProrationResult {
  assertFinance()
  const sub = subscriptionById(id)
  if (sub.status === 'CANCELLED') {
    throw new ApiError(409, 'That subscription has already been cancelled.')
  }
  return applyQuantityChange(
    sub, 0, body.effectiveDate ?? billingClock, body.reason?.trim() || 'Subscription cancelled',
  )
}

/**
 * The demo aid, and the nightly job. One method and one asOf date — what is
 * demonstrated is what would run in production, not a separate code path.
 *
 * Idempotent on (subscription, period): pressing it twice on the same cycle
 * bills nothing the second time, and periodsBilled 0 is a valid answer.
 */
export function advanceClock(): ClockAdvanceResult {
  assertFinance()

  const cursor = new Date(`${billingClock}T00:00:00Z`)
  cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  billingClock = cursor.toISOString().slice(0, 10)

  const invoiceIds: number[] = []
  let periodsBilled = 0

  for (const sub of Object.values(subscriptions)) {
    for (const row of sub.periods) {
      if (row.status !== 'SCHEDULED') continue
      if (row.periodEnd >= billingClock) continue
      if (sub.status === 'CANCELLED' && sub.cancelledAt && row.periodStart > sub.cancelledAt) continue

      const inv = newInvoice(subscriptionOwner[sub.id], [{
        id: ++billingSeq.line,
        description: `${sub.productName} — ${row.periodStart} to ${row.periodEnd}`,
        quantity: sub.quantity,
        unitPrice: sub.unitPrice,
        discountPct: 0,
        netTotal: row.amount,
        proration: false,
      }])
      row.status = 'BILLED'
      row.invoiceId = inv.id
      invoiceIds.push(inv.id)
      periodsBilled++
    }
  }

  persist()
  return { billingDate: billingClock, periodsBilled, invoiceIds }
}

/* ------------------------------------------------ negotiation (B8) */

/**
 * What the portal is served. Declared here rather than imported from the
 * workspace types, and built field by field rather than spread, so no internal
 * figure can reach a customer by accident. It has no unitCost, no margin, no
 * riskScore, no approval steps and no numeric quotation id.
 */
export interface PortalQuotationDto {
  publicRef: string
  customerName: string
  status: 'SENT' | 'UNDER_NEGOTIATION' | 'PENDING_APPROVAL' | 'CONFIRMED'
  currency: string
  lines: Array<{
    id: number
    productName: string
    category: string
    quantity: number
    unitPrice: number
    discountPct: number
    netTotal: number
  }>
  orderDiscountPct: number
  subtotal: number
  grandTotal: number
  messages: NegotiationMessage[]
  counter: {
    discountPct: number
    note: string | null
    proposedAt: string
    state: 'PENDING' | 'ACCEPTED'
  } | null
  canCounter: boolean
  canConfirm: boolean
}


interface MockMessage {
  id: number
  quotationId: number
  author: 'CUSTOMER' | 'SALES'
  authorName: string
  lineId: number | null
  body: string
  createdAt: string
}

interface MockCounter {
  quotationId: number
  discountPct: number
  note: string | null
  proposedAt: string
  state: 'PENDING' | 'ACCEPTED'
}

interface MockPortalToken {
  /** What appears in the magic link. Burned on first exchange. */
  magic: string
  /** What every later portal call carries. */
  portal: string
  quotationId: number
  expiresAt: string
  used: boolean
}

const messages: MockMessage[] = []
const counters: Record<number, MockCounter> = {}
const portalTokens: MockPortalToken[] = []
const negotiationSeq = { message: 0, token: 0 }

/**
 * A quotation already sent, so /portal.html?token=demo-portal-token works with
 * mocks on without going through the workspace first.
 */
portalTokens.push({
  magic: 'demo-portal-token',
  portal: 'demo-portal-session',
  quotationId: 2,
  expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  used: false,
})

/** Issues the magic link and moves the quotation to SENT. */
export function sendQuotation(id: number): SendResult {
  const q = find(id)
  if (q.stage !== 'APPROVED') {
    throw new ApiError(409, `Only an approved quotation can be sent — this one is ${STAGE_WORD[q.stage]}.`)
  }

  const n = ++negotiationSeq.token
  const token: MockPortalToken = {
    magic: `magic-${n}-${Math.random().toString(36).slice(2, 10)}`,
    portal: `portal-${n}-${Math.random().toString(36).slice(2, 10)}`,
    quotationId: id,
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    used: false,
  }
  portalTokens.push(token)

  const from = q.stage
  q.stage = 'SENT'
  q.sentAt = new Date().toISOString()
  record(q.id, 'SENT_TO_CUSTOMER', from, 'SENT', null)
  persist()

  return {
    portalUrl: `/portal.html?token=${token.magic}`,
    expiresAt: token.expiresAt,
    quotation: view(q),
  }
}

/** The rep's view — risk, margin and the chain belong here, not in the portal. */
export function negotiationFor(id: number): NegotiationThread {
  const q = find(id)
  const v = view(q)
  const c = counters[id]

  return {
    quotationId: q.id,
    ref: q.ref,
    customerName: v.customerName,
    status: q.stage,
    approvedBaselineScore: q.approvedBaselineScore ?? null,
    sentAt: q.sentAt ?? null,
    messages: messages.filter((m) => m.quotationId === id).map(stripOwner),
    counter: c
      ? {
          discountPct: c.discountPct,
          note: c.note,
          proposedAt: c.proposedAt,
          state: c.state,
          // What the counter did to the deal. The portal never receives these.
          riskScore: v.riskScore,
          marginPct: v.marginPct,
          requiredChain: v.requiredChain,
        }
      : null,
  }
}

function stripOwner(m: MockMessage): NegotiationMessage {
  return {
    id: m.id, author: m.author, authorName: m.authorName,
    lineId: m.lineId, body: m.body, createdAt: m.createdAt,
  }
}

export function replyOnQuotation(id: number, body: ReplyBody): NegotiationThread {
  find(id)
  if (!body.body?.trim()) throw new ApiError(422, 'A reply cannot be empty.', 'body')
  messages.push({
    id: ++negotiationSeq.message,
    quotationId: id,
    author: 'SALES',
    authorName: ACTOR_NAMES[getActor().id] ?? 'Sales',
    lineId: body.lineId ?? null,
    body: body.body.trim(),
    createdAt: new Date().toISOString(),
  })
  persist()
  return negotiationFor(id)
}

/* ---------------------------------------------- the portal's own surface */

function tokenFor(portalToken: string): MockPortalToken {
  const t = portalTokens.find((x) => x.portal === portalToken)
  if (!t) throw new ApiError(401, 'Your session has expired. Ask for a new link.')
  return t
}

/**
 * Exchanges a magic link for a session token. Single use: the link is burned
 * here, so a refresh cannot replay it.
 */
export function verifyMagicLink(magic: string): { portalToken: string; expiresAt: string; customerName: string } {
  const t = portalTokens.find((x) => x.magic === magic)
  if (!t || t.used || t.expiresAt < new Date().toISOString()) {
    throw new ApiError(401, 'This link has expired or has already been used.')
  }
  t.used = true
  persist()
  const q = find(t.quotationId)
  return {
    portalToken: t.portal,
    expiresAt: t.expiresAt,
    customerName: customers().find((c) => c.id === q.customerId)!.name,
  }
}

/**
 * Everything a customer may see, and physically nothing else.
 *
 * Built field by field from the priced quotation rather than spread from it:
 * a spread would carry unitCost, margin, riskScore and the approval chain into
 * a customer's browser the moment one of them was added upstream.
 */
export function portalQuotation(portalToken: string): PortalQuotationDto {
  const t = tokenFor(portalToken)
  const q = find(t.quotationId)
  const v = view(q)
  const c = counters[q.id]

  const status: PortalQuotationDto['status'] =
    q.stage === 'CONFIRMED' ? 'CONFIRMED'
    : q.stage === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL'
    : q.stage === 'UNDER_NEGOTIATION' ? 'UNDER_NEGOTIATION'
    : 'SENT'

  return {
    publicRef: publicRefFor(q.id),
    customerName: v.customerName,
    status,
    currency: v.currency,
    lines: v.lines.map((l) => ({
      id: l.id,
      productName: l.productName,
      category: l.category,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPct: l.effectiveDiscountPct,
      netTotal: l.netTotal,
    })),
    orderDiscountPct: v.orderDiscountPct,
    subtotal: v.subtotal,
    grandTotal: v.grandTotal,
    messages: messages.filter((m) => m.quotationId === q.id).map(stripOwner),
    counter: c ? { discountPct: c.discountPct, note: c.note, proposedAt: c.proposedAt, state: c.state } : null,
    // While the quote is back with sales there is nothing for the customer to do.
    canCounter: status === 'SENT' || status === 'UNDER_NEGOTIATION',
    canConfirm: status === 'SENT' || status === 'UNDER_NEGOTIATION',
  }
}

/** A stable UUID-shaped reference. The numeric id never leaves the workspace. */
function publicRefFor(quotationId: number): string {
  const h = quotationId.toString(16).padStart(12, '0')
  return `q-${h.slice(0, 8)}-${h.slice(8)}-portal-ref`
}

export function portalMessage(
  portalToken: string, body: { lineId?: number; body: string },
): PortalQuotationDto {
  const t = tokenFor(portalToken)
  const q = find(t.quotationId)
  if (!body.body?.trim()) throw new ApiError(422, 'Please write something before sending.', 'body')

  messages.push({
    id: ++negotiationSeq.message,
    quotationId: q.id,
    author: 'CUSTOMER',
    authorName: customers().find((c) => c.id === q.customerId)!.name,
    lineId: body.lineId ?? null,
    body: body.body.trim(),
    createdAt: new Date().toISOString(),
  })
  persist()
  return portalQuotation(portalToken)
}

/**
 * A counter applies itself.
 *
 * There is no accept endpoint, for the same reason there is no request-approval
 * endpoint: the customer proposes terms, the order is re-priced and re-scored,
 * and if the new score exceeds what was signed off it re-enters the approval
 * chain on its own. Nobody presses anything.
 */
export function portalCounter(
  portalToken: string, body: { discountPct: number; note?: string },
): PortalQuotationDto {
  const t = tokenFor(portalToken)
  const q = find(t.quotationId)

  if (q.stage !== 'SENT' && q.stage !== 'UNDER_NEGOTIATION') {
    throw new ApiError(409, 'This quotation is not open for changes.')
  }
  if (!Number.isFinite(body.discountPct) || body.discountPct < 0 || body.discountPct > 100) {
    throw new ApiError(422, 'A discount must be between 0 and 100.', 'discountPct')
  }

  q.orderDiscountPct = body.discountPct
  counters[q.id] = {
    quotationId: q.id,
    discountPct: body.discountPct,
    note: body.note?.trim() || null,
    proposedAt: new Date().toISOString(),
    state: 'PENDING',
  }

  const scored = view(q)
  const baseline = q.approvedBaselineScore ?? 0
  const from = q.stage

  if (scored.riskScore > baseline) {
    // Worse than what was signed off, so governance runs again by itself.
    q.stage = 'PENDING_APPROVAL'
    const steps: ApprovalStep[] = scored.requiredChain.map((role, i) => ({
      id: i + 1, order: i + 1, role,
      state: i === 0 ? 'PENDING' : 'BLOCKED',
      decidedByName: null, reason: null, decidedAt: null,
    }))
    approvals.push({
      approvalId: ++seq.approval, quotationId: q.id, riskScore: scored.riskScore,
      state: 'OPEN', steps, createdAt: new Date().toISOString(),
    })
    record(q.id, 'COUNTER_RECEIVED', from, 'PENDING_APPROVAL',
      `counter ${body.discountPct}% scores ${scored.riskScore}, above the approved ${baseline}`)
  } else {
    q.stage = 'UNDER_NEGOTIATION'
    record(q.id, 'COUNTER_RECEIVED', from, 'UNDER_NEGOTIATION',
      `counter ${body.discountPct}% scores ${scored.riskScore}, within the approved ${baseline}`)
  }

  persist()
  return portalQuotation(portalToken)
}

export function portalConfirm(portalToken: string): PortalQuotationDto {
  const t = tokenFor(portalToken)
  const q = find(t.quotationId)

  if (q.stage === 'PENDING_APPROVAL') {
    throw new ApiError(409, 'Your request is with the sales team.')
  }
  if (q.stage !== 'SENT' && q.stage !== 'UNDER_NEGOTIATION') {
    throw new ApiError(409, 'This quotation can no longer be confirmed.')
  }

  const from = q.stage
  q.stage = 'CONFIRMED'
  if (counters[q.id]) counters[q.id].state = 'ACCEPTED'
  record(q.id, 'CUSTOMER_CONFIRMED', from, 'CONFIRMED', null)
  persist()
  return portalQuotation(portalToken)
}

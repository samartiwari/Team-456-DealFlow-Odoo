import { getActor } from '../actor'
import { ApiError } from '../client'
import type {
  ApprovalDetail, ApprovalStep, ApprovalSummary, ApproverRole, AuditEntry,
  AcceptAllocationBody, AllocationPlan,
  ConfirmResult, DecideBody, QuotationStage, QuotationSummary, RecomputeResult,
} from '../types'
import { ACTOR_NAMES, CUSTOMERS } from './data'
import { price, type DraftLine } from './engine'
import { costOf, suggest, validateOverride } from './allocation'

/** In-memory state for the mock server. Resets on reload, which is fine for a slice. */

export interface MockQuotation {
  id: number
  ref: string
  customerId: number
  repId: number
  stage: QuotationStage
  orderDiscountPct: number
  lines: DraftLine[]
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
    sessionStorage.setItem(PERSIST_KEY, JSON.stringify({ seq, quotations, approvals, audit }))
  } catch {
    /* private browsing or quota — the mock just falls back to in-memory */
  }
}

export const seq = { line: 2, quotation: 1, approval: 0, audit: 1 }

/** The demo quote from the contract: Acme Gold, Laptop x6 @ 12%, Setup @ 18% -> risk 33. */
export const quotations: MockQuotation[] = [
  {
    id: 1, ref: 'Q-0001', customerId: 1, repId: 1, stage: 'DRAFT', orderDiscountPct: 0,
    lines: [
      { id: 1, productId: 1, productName: 'Laptop Pro', category: 'Hardware', unitPrice: 80000, quantity: 6, discountPct: 12, categoryCeilingPct: 15 },
      { id: 2, productId: 2, productName: 'Setup Service', category: 'Services', unitPrice: 15000, quantity: 1, discountPct: 18, categoryCeilingPct: 10 },
    ],
  },
]

const approvals: MockApproval[] = []

const audit: Record<number, AuditEntry[]> = {
  1: [{
    id: 1, action: 'QUOTATION_CREATED', fromState: null, toState: 'DRAFT',
    actorName: 'Rep One', reason: null,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
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
}

export function view(q: MockQuotation): RecomputeResult {
  const customer = CUSTOMERS.find((c) => c.id === q.customerId)!
  return {
    id: q.id, ref: q.ref, customerId: customer.id, customerName: customer.name, tier: customer.tier,
    stage: q.stage, currency: 'INR', orderDiscountPct: q.orderDiscountPct,
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

/** Committed plans, keyed by quotation. A suggestion is never stored. */
const accepted: Record<number, AllocationPlan> = {}

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

  accepted[id] = planned
  record(q.id, 'ALLOCATION_ACCEPTED', q.stage, q.stage,
    `${planned.shipmentCount} shipment${planned.shipmentCount === 1 ? '' : 's'}`)
  persist()
  return planned
}

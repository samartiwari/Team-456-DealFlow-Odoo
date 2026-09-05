import { getActor } from '../actor'
import { ApiError } from '../client'
import type {
  ApprovalDetail, ApprovalStep, ApprovalSummary, ApproverRole, AuditEntry,
  ConfirmResult, DecideBody, QuotationStage, QuotationSummary, RecomputeResult,
} from '../types'
import { ACTOR_NAMES, CUSTOMERS } from './data'
import { price, type DraftLine } from './engine'

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
}

export function find(id: number): MockQuotation {
  const q = quotations.find((x) => x.id === id)
  if (!q) throw new ApiError(404, `Quotation ${id} not found.`)
  return q
}

export function view(q: MockQuotation): RecomputeResult {
  const customer = CUSTOMERS.find((c) => c.id === q.customerId)!
  return {
    id: q.id, ref: q.ref, customerName: customer.name, tier: customer.tier,
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

export function queue(): ApprovalSummary[] {
  return approvals.filter((a) => a.state === 'OPEN').map((a) => {
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

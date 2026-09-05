/**
 * Mirrors the backend records in `com.dealflow.api` exactly.
 *
 * Money is a JSON number, not a string — BigDecimal on the wire, plain number
 * here. Every value is exactly representable: format it, never parse or round it.
 */

export type Tier = 'BRONZE' | 'SILVER' | 'GOLD'

export type QuotationStage =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'RETURNED'
  | 'APPROVED'
  | 'REJECTED'
// UNDER_NEGOTIATION and CONFIRMED arrive with the portal phase; not emitted yet.

export type ApproverRole = 'MANAGER' | 'FINANCE'

/** BLOCKED is the one that matters: Finance cannot act before the Manager. */
export type StepState = 'PENDING' | 'BLOCKED' | 'APPROVED' | 'REJECTED' | 'RETURNED'

export type RequestState = 'OPEN' | 'APPROVED' | 'REJECTED' | 'RETURNED'

export type Decision = 'APPROVE' | 'REJECT' | 'RETURN'

export interface QuotationLine {
  id: number
  productName: string
  category: string
  quantity: number
  unitPrice: number
  /** What the rep typed on this line. */
  discountPct: number
  /** Line discount plus the order-level discount pushed down — what the ceiling is checked against. */
  effectiveDiscountPct: number
  /** min(tier ceiling, category ceiling). */
  allowedDiscountPct: number
  /** max(0, effective − allowed), in percentage points. */
  overagePts: number
  /** lineNet / orderNet, as a percentage. */
  weightPct: number
  netTotal: number
}

/** The single shape the whole quotation builder renders. */
export interface RecomputeResult {
  id: number
  ref: string
  customerName: string
  tier: Tier
  stage: QuotationStage
  currency: string
  orderDiscountPct: number
  lines: QuotationLine[]
  subtotal: number
  grandTotal: number
  marginPct: number
  riskScore: number
  requiredChain: ApproverRole[]
}

export interface QuotationSummary {
  id: number
  ref: string
  customerName: string
  stage: QuotationStage
  grandTotal: number
  currency: string
}

/** unitCost is deliberately absent — the picker never needs it. */
export interface Product {
  id: number
  name: string
  category: string
  unitPrice: number
  /** null means no category ceiling, so the tier ceiling applies alone. */
  categoryCeilingPct: number | null
  /**
   * Whether the product is physical. Services and subscriptions are delivered
   * rather than shipped, so they hold no stock and never appear in a
   * fulfilment plan — a quote made only of them allocates nothing at all.
   */
  stockable: boolean
}

export interface Customer {
  id: number
  name: string
  tier: Tier
  tierCeilingPct: number
}

/** approvalId is null when the score was 0 and the quote auto-approved. */
export interface ConfirmResult {
  quotation: RecomputeResult
  approvalId: number | null
}

export interface ApprovalSummary {
  approvalId: number
  quotationId: number
  ref: string
  customerName: string
  riskScore: number
  requiredChain: ApproverRole[]
  /** Whose turn it is right now. */
  awaitingRole: ApproverRole
  grandTotal: number
  currency: string
  createdAt: string
}

export interface ApprovalStep {
  id: number
  order: number
  role: ApproverRole
  state: StepState
  decidedByName: string | null
  reason: string | null
  decidedAt: string | null
}

export interface AuditEntry {
  id: number
  action: string
  fromState: QuotationStage | null
  toState: QuotationStage | null
  actorName: string | null
  reason: string | null
  createdAt: string
}

/** The quotation is embedded, so the approval screen gets the risk breakdown with no second call. */
export interface ApprovalDetail {
  approvalId: number
  riskScore: number
  state: RequestState
  quotation: RecomputeResult
  steps: ApprovalStep[]
  /** Newest last. */
  audit: AuditEntry[]
}

/** Every non-2xx response has this shape. */
export interface ApiErrorBody {
  status: number
  message: string
  field: string | null
}

/* ---------------------------------------------------------------- requests */

export interface CreateQuotationBody {
  customerId: number
}

export interface AddLineBody {
  productId: number
  quantity: number
  discountPct: number
}

/** Both optional — send only what changed. */
export interface UpdateLineBody {
  quantity?: number
  discountPct?: number
}

export interface UpdateQuotationBody {
  orderDiscountPct: number
}

export interface DecideBody {
  decision: Decision
  reason: string
}

/* ------------------------------------------------ warehouse split (B6) */

export interface Warehouse {
  id: number
  name: string
  /** Cost multiplier per unit shipped. */
  shippingWeight: number
  /** Used to promise a date for anything on backorder. */
  replenishmentDays: number
}

/**
 * One row per warehouse-and-product pair — NOT one per product. A single
 * product can be split across several warehouses, and that split is the whole
 * point of the screen. Key rows on productId + warehouseId.
 */
export interface AllocationLine {
  productId: number
  productName: string
  warehouseId: number
  warehouseName: string
  quantity: number
}

export interface Backorder {
  productId: number
  productName: string
  quantity: number
  /** ISO date — today plus that warehouse's replenishmentDays. */
  promisedDate: string
}

export interface AllocationPlan {
  quotationId: number
  ref: string
  status: 'SUGGESTED' | 'ACCEPTED'
  lines: AllocationLine[]
  backorders: Backorder[]
  /** How many warehouses are used. */
  shipmentCount: number
  estimatedCost: number
  currency: string
  /** True once stock arrived and an open backorder could now be filled. */
  consolidatable: boolean
}

/** Send lines: null (or omit) to accept the suggestion unchanged. */
export interface AcceptAllocationBody {
  lines: Array<{ productId: number; warehouseId: number; quantity: number }> | null
}

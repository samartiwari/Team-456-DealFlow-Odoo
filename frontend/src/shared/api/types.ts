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
  /** Needed so the builder's customer picker can show the current selection. */
  customerId: number
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
  /** Billed every month as a subscription rather than once on an invoice. */
  recurring: boolean
}

export interface Customer {
  id: number
  name: string
  tier: Tier
  tierCeilingPct: number
  /** Not null -- V6 made the column mandatory. */
  phone: string
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

/* ------------------------------------------- discount policy (A3) */

/** customer_tier. The ceiling a customer of this tier is allowed. */
export interface CustomerTier {
  id: number
  name: string
  ceilingPct: number
}

/** product_category. A null ceiling means the tier ceiling applies alone. */
export interface ProductCategory {
  id: number
  name: string
  ceilingPct: number | null
  stockable: boolean
  recurring: boolean
}

/**
 * The system_config rows that decide routing, typed.
 *
 * riskScore = round(weightedWeight x weightedOverage + maxWeight x maxOverage),
 * then: below managerBandMin approves itself, up to financeBandMin needs a
 * manager, and at or above it needs the manager then finance.
 */
export interface ApprovalPolicy {
  weightedWeight: number
  maxWeight: number
  managerBandMin: number
  financeBandMin: number
}

/**
 * One line of the policy's change history.
 *
 * A3's Notes require that edits are logged with user, timestamp and reason.
 * The reason is the change itself — "Gold ceiling 15% to 10%" says more than
 * anything a typed note would, and cannot be left blank or lied about.
 */
export interface PolicyChange {
  id: number
  actorName: string | null
  summary: string
  createdAt: string
}

/** Everything the configuration screen renders, in one call. */
export interface DiscountPolicy {
  tiers: CustomerTier[]
  categories: ProductCategory[]
  approval: ApprovalPolicy
  /** Newest first. */
  history: PolicyChange[]
}

/** Send only what changed; each list is matched on id. */
export interface UpdatePolicyBody {
  tiers?: Array<{ id: number; ceilingPct: number }>
  categories?: Array<{ id: number; ceilingPct: number | null }>
  approval?: Partial<ApprovalPolicy>
}

/* ------------------------------------------ fulfilment and stock (A4) */

/** One warehouse-and-product pair, as the stock list shows it. */
export interface StockRow {
  warehouseId: number
  warehouseName: string
  productId: number
  productName: string
  /** Physically present. */
  onHand: number
  /** Committed to an accepted allocation and no longer free to promise. */
  reserved: number
  /** onHand minus reserved. What a new order can actually draw on. */
  available: number
}

export type FulfilmentStatus = 'AWAITING_SPLIT' | 'SPLIT_ACCEPTED' | 'BACKORDER'

export interface FulfilmentOrder {
  quotationId: number
  ref: string
  customerName: string
  status: FulfilmentStatus
  /** Empty until a split is accepted. */
  warehouseNames: string[]
  backorderedUnits: number
  grandTotal: number
  currency: string
}

/** The stock list and the orders queue in one call — they are one screen. */
export interface FulfilmentBoard {
  stock: StockRow[]
  orders: FulfilmentOrder[]
}

/** Matches the backend's StockReceiptRequest exactly. */
export interface StockReceiptBody {
  productId: number
  quantity: number
}

/* ------------------------------------------------ upsell (A6 / B5) */

/**
 * One upsell card beside the cart.
 *
 * Already ranked and already filtered — the server has removed anything in the
 * cart, dismissed, out of stock, or below its pairing's margin floor. Render
 * the array as it arrives; do not re-sort or re-filter.
 */
export interface Suggestion {
  productId: number
  productName: string
  category: string
  /** List price, before any discount. */
  unitPrice: number
  /** 0-1, two decimals. Ordering only — it is not a percentage, don't show it as one. */
  score: number
  /**
   * Percentage points the ORDER's margin moves if this is added at quantity 1.
   * Positive means the deal gets healthier. Negative is possible and real.
   */
  marginDeltaPt: number
  /** Admin-flagged pairing. Worth a badge. */
  promoted: boolean
}

/* --------------------------------------------- hybrid billing (A5 / B7) */

export type InvoiceStatus =
  | 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CREDITED' | 'VOID'

export interface InvoiceLine {
  id: number
  /** "Laptop Pro x2" or "Support Plan qty 1 to 3, 20 days". */
  description: string
  quantity: number
  unitPrice: number
  discountPct: number
  netTotal: number
  /** True for a line added by a mid-period quantity increase. */
  proration: boolean
}

export interface Payment {
  id: number
  amount: number
  reference: string | null
  recordedByName: string
  recordedAt: string
}

export interface CreditNote {
  id: number
  ref: string
  /** Always positive; it is a credit by nature. */
  amount: number
  reason: string
  issuedAt: string
}

export interface Invoice {
  id: number
  ref: string
  quotationId: number
  status: InvoiceStatus
  issuedAt: string
  lines: InvoiceLine[]
  /** Sum of lines, after discounts. */
  total: number
  /** Sum of payments recorded against it. */
  paid: number
  /** total - paid - credited, floored at 0. */
  outstanding: number
  payments: Payment[]
  creditNotes: CreditNote[]
}

export type PeriodStatus = 'SCHEDULED' | 'BILLED'

export interface BillingPeriod {
  id: number
  periodStart: string
  periodEnd: string
  /** Days in THIS period. Calendar months vary — never assume 30. */
  days: number
  amount: number
  status: PeriodStatus
  /** Set once billed. */
  invoiceId: number | null
}

export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED'

export interface Subscription {
  id: number
  productId: number
  productName: string
  quantity: number
  /** Per unit, per period, after the line's effective discount. */
  unitPrice: number
  /** quantity x unitPrice — what a full period bills. */
  periodAmount: number
  status: SubscriptionStatus
  startDate: string
  cancelledAt: string | null
  /** Twelve rows, oldest first. */
  periods: BillingPeriod[]
}

/**
 * Both halves of ONE order's billing, in one call.
 *
 * The order forks but stays one order: there is no second quotation and no
 * separate subscription order. A screen that makes these look like two orders
 * has missed the feature.
 */
export interface BillingView {
  quotationId: number
  ref: string
  customerName: string
  currency: string
  /** The one-time half. null when every line is recurring. */
  invoice: Invoice | null
  /** The recurring half — one subscription per recurring line. */
  subscriptions: Subscription[]
}

/** What a change or cancellation did, and the billing view after it. */
export interface ProrationResult {
  /** Positive = charged. Negative = credited. Never null, may be 0. */
  deltaAmount: number
  /** Plain English, safe to render verbatim. */
  explanation: string
  /** Set when deltaAmount < 0. */
  creditNote: CreditNote | null
  billing: BillingView
}

export interface ChangeSubscriptionBody {
  quantity: number
  /** Defaults to today. ISO date. */
  effectiveDate?: string
}

export interface CancelSubscriptionBody {
  effectiveDate?: string
  reason?: string
}

/** No status field, on purpose — the server derives it from the payments. */
export interface RecordPaymentBody {
  amount: number
  reference?: string
}

/** What the admin "Advance clock" button did. */
export interface ClockAdvanceResult {
  billingDate: string
  periodsBilled: number
  invoiceIds: number[]
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

/**
 * Both optional — send only what changed.
 *
 * customerId is here because the customer is chosen inside the builder rather
 * than before it: the tier ceiling every line is measured against comes from
 * the customer, so switching it re-prices and re-scores the whole quotation.
 */
export interface UpdateQuotationBody {
  orderDiscountPct?: number
  customerId?: number
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

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
  /** Portal link issued, waiting on the customer. */
  | 'SENT'
  /** The customer has countered. */
  | 'UNDER_NEGOTIATION'
  /** The customer accepted; the deal is agreed. */
  | 'CONFIRMED'

export type ApproverRole = 'MANAGER' | 'FINANCE'

/** BLOCKED is the one that matters: Finance cannot act before the Manager. */
export type StepState = 'PENDING' | 'BLOCKED' | 'APPROVED' | 'REJECTED' | 'RETURNED'

export type RequestState = 'OPEN' | 'APPROVED' | 'REJECTED' | 'RETURNED'

export type Decision = 'APPROVE' | 'REJECT' | 'RETURN'

export interface QuotationLine {
  id: number
  productName: string
  /** Null for the plain product. */
  variantId: number | null
  variantName: string | null
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
  /**
   * The score this quotation carried when it was last approved.
   *
   * A counter is measured against this rather than against zero, so a customer
   * asking for *less* than was signed off never re-triggers the chain. Null
   * until the quotation has been approved once.
   */
  approvedBaselineScore: number | null
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

/**
 * One entry in the Recent Activity feed (Phase 13 §5). The audit trail already
 * renders the same facts inside a single approval; this is the same row, across
 * every quotation, with enough identity to link back.
 *
 * Deliberately `AuditEntry` plus `quotationId` and `ref` — without those two a
 * cross-quotation feed cannot link anywhere, and widening `AuditEntry` itself
 * would change the approval detail contract.
 */
export interface ActivityEvent {
  id: number
  quotationId: number
  /** Q-0042 — so the feed can name the deal without a second call. */
  ref: string
  action: string
  fromStage: QuotationStage | null
  toStage: QuotationStage | null
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

/* ------------------------------------- negotiation, workspace side (B8) */

export interface NegotiationMessage {
  id: number
  author: 'CUSTOMER' | 'SALES'
  authorName: string
  /** Null for a message about the order as a whole. */
  lineId: number | null
  body: string
  createdAt: string
}

/** The rep's view of a counter — with the internal figures the portal never sees. */
export interface NegotiationCounter {
  discountPct: number
  note: string | null
  proposedAt: string
  state: 'PENDING' | 'ACCEPTED'
  /** What the counter did to the deal. */
  riskScore: number
  marginPct: number
  requiredChain: ApproverRole[]
}

export interface NegotiationThread {
  quotationId: number
  ref: string
  customerName: string
  status: QuotationStage
  approvedBaselineScore: number | null
  /** Null until the quote has been sent. */
  sentAt: string | null
  messages: NegotiationMessage[]
  counter: NegotiationCounter | null
}

export interface SendResult {
  /** Open this to act as the customer. In production it would be emailed. */
  portalUrl: string
  expiresAt: string
  quotation: RecomputeResult
}

export interface ReplyBody {
  lineId?: number
  body: string
}

/* ---------------------------------------- catalog: variants and lists (A2) */

export interface ProductVariant {
  id: number
  name: string
  /** Its own price, not a delta on the base. */
  unitPrice: number
}

/** One product with the shapes it comes in. */
export interface ProductDetail extends Product {
  variants: ProductVariant[]
}

export interface PriceListItem {
  productId: number
  productName: string
  /** What this tier pays. */
  unitPrice: number
  /** What it would pay without the list — render both, the comparison is the point. */
  basePrice: number
}

/**
 * What one tier is published at.
 *
 * A list need not name every product; anything it misses falls through to the
 * base price. Gold has no list at all — the base price is the keenest rate.
 */
export interface PriceList {
  id: number
  name: string
  /** Null would mean a list for everyone; both seeded lists name a tier. */
  tier: Tier | null
  active: boolean
  items: PriceListItem[]
}

/* ------------------------------------------- deal health (B9) */

export type AlertType = 'STALLED' | 'DISCOUNT_ANOMALY' | 'CEILING_HUGGER' | 'SLIPPAGE'
export type AlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW'

/**
 * The evidence behind an anomaly, so the card can show the rep's own numbers
 * rather than a threshold. Present on DISCOUNT_ANOMALY and CEILING_HUGGER.
 */
export interface AlertMetrics {
  /** The order-level effective discount that tripped it. */
  discountPct: number
  mean: number
  stdDev: number
  /** How many confirmed quotes the baseline was drawn from. */
  sampleSize: number
  /** True when the rep had fewer than 5 confirmed quotes, so the team's were used. */
  usedTeamBaseline: boolean
}

export interface DealHealthAlert {
  id: number
  quotationId: number
  ref: string
  customerName: string
  repName: string
  type: AlertType
  severity: AlertSeverity
  /**
   * Plain English, rendered verbatim. It names the numbers behind this
   * particular flag, because "why was this flagged?" is the question the
   * screen exists to answer.
   */
  explanation: string
  openedAt: string
  /** A manager has seen it. */
  ackedAt: string | null
  /** The condition no longer holds. Resolved alerts are not returned. */
  resolvedAt: string | null
  metrics: AlertMetrics | null
}

export interface DealHealthBoard {
  alerts: DealHealthAlert[]
  counts: { high: number; medium: number; low: number; total: number }
  /** The detectors run on load, so this is "just now". */
  evaluatedAt: string
}

/** What Nudge drafted. There is no mail server, so nothing was sent. */
export interface NudgeResult {
  draft: string
  board: DealHealthBoard
}

/* ------------------------------------------- reporting (A7) */

/** Every field optional — an empty query is "everything". */
export interface ReportQuery {
  from?: string
  to?: string
  repId?: number
  status?: QuotationStage
  categoryId?: number
}

export interface ReportRow {
  quotationId: number
  ref: string
  customerName: string
  repName: string
  stage: QuotationStage
  orderDiscountPct: number
  subtotal: number
  marginPct: number
  riskScore: number
  createdAt: string
}

export interface ReportResult {
  rows: ReportRow[]
  totals: {
    count: number
    revenue: number
    averageDiscountPct: number
    averageMarginPct: number
  }
  /** The query echoed back, so an export can be shown to match what is on screen. */
  query: ReportQuery
}

/* ------------------------------------------------- auth (A1) */

export type UserRole = 'REP' | 'MANAGER' | 'FINANCE'

/**
 * There is no ADMIN role. The spec's nav mapping names one, but the backend
 * has only these three — configuration is manager-gated, which is also who the
 * server lets edit the discount policy.
 */
export interface AuthUser {
  id: number
  name: string
  email: string
  role: UserRole
}

export interface AuthSession {
  /** Send as `Authorization: Bearer <token>` on every call. */
  token: string
  /** ISO timestamp. Twelve hours out, and there is no refresh. */
  expiresAt: string
  user: AuthUser
}

export interface LoginBody {
  email: string
  password: string
}

export interface SignupBody {
  name: string
  email: string
  password: string
}

/* ============================================ admin configuration (A2/A4/A5/A6) */

/**
 * The manager-only view of a product.
 *
 * Deliberately NOT the same type as `Product`. The rep-facing one has no
 * unitCost, because margin is computed server-side and cost never reaches a
 * rep's browser — but a product cannot be edited without setting its cost. The
 * two are not interchangeable, and feeding this one into anything a rep can see
 * is the bug this split exists to prevent.
 */
export interface AdminProduct {
  id: number
  name: string
  categoryId: number
  categoryName: string
  unitPrice: number
  /** Only ever present on admin shapes. */
  unitCost: number
  /** Derived and read-only, so the form can warn on a thin edit. */
  marginPct: number
  stockable: boolean
  recurring: boolean
  archived: boolean
  variants: AdminVariant[]
}

export interface AdminVariant {
  id: number
  name: string
  unitPrice: number
  unitCost: number
}

/**
 * What a price change will and will not touch.
 *
 * A quotation line stores no price, so every read re-resolves it — invisible
 * while the catalog is read-only, and a serious problem the moment it is not.
 * Confirming freezes the price onto the line, so drafts follow the catalog and
 * settled deals keep the terms they were agreed at.
 */
export interface ProductImpact {
  /** Drafts that will reprice when you save. */
  openDrafts: number
  /** Quotations frozen at their agreed price, which will not move. */
  frozenQuotations: number
}

/**
 * Read and tune, never create.
 *
 * These three flags are wired into three different engines — ceilingPct into
 * risk, stockable into fulfilment, recurring into billing. Tuning the existing
 * three is useful; inventing a fourth reaches a state nothing else was built
 * for.
 */
export interface Category {
  id: number
  name: string
  /** Null means "fall back to the customer's tier ceiling". */
  ceilingPct: number | null
  stockable: boolean
  recurring: boolean
}

/** The admin view adds tierId; the read-only one carries only the tier's name. */
export interface AdminPriceList {
  id: number
  name: string
  tierId: number | null
  tierName: string | null
  /** Live for its tier. At most one list per tier may have this set. */
  active: boolean
  /** Withdrawn. Archived lists come back from the admin list and nowhere else. */
  archived: boolean
  items: PriceListItem[]
}

export interface AdminWarehouse {
  id: number
  name: string
  /** Flat fee added when this warehouse ships a split. */
  shipmentFee: number
  /** Cost multiplier used to pick the cheapest split. 1.0 is neutral. */
  shippingWeight: number
  /** Lead time used to promise a backorder date. */
  replenishmentDays: number
  archived: boolean
}

export type BillingInterval = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
export type ProrationPolicy = 'PRORATE' | 'FULL_PERIOD' | 'NONE'
export type CancellationPolicy = 'END_OF_PERIOD' | 'IMMEDIATE_WITH_CREDIT' | 'IMMEDIATE_NO_CREDIT'

/**
 * Recurring billing was hardcoded: calendar months, prorate on change, credit
 * on cancel. A plan makes those three choices explicit and editable, and every
 * recurring product is seeded with one that reproduces exactly that — so
 * nothing about billing moves until an admin moves it.
 */
export interface SubscriptionPlan {
  id: number
  name: string
  /** A plan is attached to exactly one recurring product. */
  productId: number
  productName: string
  interval: BillingInterval
  prorationPolicy: ProrationPolicy
  cancellationPolicy: CancellationPolicy
  active: boolean
}

export interface AdminUpsellRule {
  id: number
  triggerProductId: number
  triggerProductName: string
  suggestedProductId: number
  suggestedProductName: string
  /** The suggestion is withheld below this margin. */
  minMarginPct: number
  /** Weighted up by the ranker — 30% of the score. */
  promoted: boolean
}

/* Every PATCH is a partial: absent means unchanged, not null. */

export interface ProductBody {
  name: string
  categoryId: number
  unitPrice: number
  unitCost: number
}

export interface VariantBody {
  name: string
  unitPrice: number
  unitCost: number
}

export interface CategoryBody {
  ceilingPct: number | null
  stockable: boolean
  recurring: boolean
}

export interface PriceListBody {
  name: string
  tierId: number | null
  active: boolean
}

export interface WarehouseBody {
  name: string
  shipmentFee: number
  shippingWeight: number
  replenishmentDays: number
}

export interface PlanBody {
  name: string
  productId: number
  interval: BillingInterval
  prorationPolicy: ProrationPolicy
  cancellationPolicy: CancellationPolicy
  active: boolean
}

export interface UpsellRuleBody {
  triggerProductId: number
  suggestedProductId: number
  minMarginPct: number
  promoted: boolean
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
  /** Which shape of the product. Must be a variant of productId, or the call is refused. */
  variantId?: number
  quantity: number
  discountPct: number
}

/** Both optional — send only what changed. */
export interface UpdateLineBody {
  quantity?: number
  discountPct?: number
  /**
   * Switches which shape of the product this line is for. Send `0` to clear it back to the
   * plain product — a JSON null cannot say that, because it reads the same as a field that
   * was left out.
   */
  variantId?: number
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

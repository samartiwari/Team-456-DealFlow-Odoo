import { api } from './client'
import type {
  AcceptAllocationBody,
  BillingView,
  CancelSubscriptionBody,
  ChangeSubscriptionBody,
  ClockAdvanceResult,
  AddLineBody,
  AllocationPlan,
  ApprovalDetail,
  ApprovalSummary,
  ConfirmResult,
  CreateQuotationBody,
  Customer,
  DecideBody,
  DealHealthBoard,
  DiscountPolicy,
  Invoice,
  NegotiationThread,
  NudgeResult,
  FulfilmentBoard,
  PriceList,
  Product,
  ProductDetail,
  ProrationResult,
  RecordPaymentBody,
  ReportQuery,
  ReportResult,
  ReplyBody,
  SendResult,
  StockReceiptBody,
  Suggestion,
  QuotationSummary,
  RecomputeResult,
  UpdateLineBody,
  UpdatePolicyBody,
  UpdateQuotationBody,
  Warehouse,
} from './types'

/* catalog */
export const listProducts = () => api.get<Product[]>('/products')
export const getProduct = (id: number) => api.get<ProductDetail>(`/products/${id}`)
export const listPriceLists = () => api.get<PriceList[]>('/price-lists')
export const listCustomers = () => api.get<Customer[]>('/customers')

/* discount policy — PDF A3: tier ceilings, category ceilings, approval chain */
export const getDiscountPolicy = () => api.get<DiscountPolicy>('/config/discount-policy')
export const updateDiscountPolicy = (body: UpdatePolicyBody) =>
  api.patch<DiscountPolicy>('/config/discount-policy', body)

/* quotations — every mutation returns the whole quotation, so one call repaints the screen */
export const listQuotations = () => api.get<QuotationSummary[]>('/quotations')
export const getQuotation = (id: number) => api.get<RecomputeResult>(`/quotations/${id}`)
export const createQuotation = (body: CreateQuotationBody) =>
  api.post<RecomputeResult>('/quotations', body)
export const recompute = (id: number) => api.post<RecomputeResult>(`/quotations/${id}/recompute`)
export const addLine = (id: number, body: AddLineBody) =>
  api.post<RecomputeResult>(`/quotations/${id}/lines`, body)
export const updateLine = (id: number, lineId: number, body: UpdateLineBody) =>
  api.patch<RecomputeResult>(`/quotations/${id}/lines/${lineId}`, body)
export const deleteLine = (id: number, lineId: number) =>
  api.del<RecomputeResult>(`/quotations/${id}/lines/${lineId}`)
export const setOrderDiscount = (id: number, body: UpdateQuotationBody) =>
  api.patch<RecomputeResult>(`/quotations/${id}`, body)
export const setCustomer = (id: number, customerId: number) =>
  api.patch<RecomputeResult>(`/quotations/${id}`, { customerId })
export const confirmQuotation = (id: number) =>
  api.post<ConfirmResult>(`/quotations/${id}/confirm`)

/* upsell — what else belongs on this order (B5) */
export const getSuggestions = (id: number) =>
  api.get<Suggestion[]>(`/quotations/${id}/suggestions`)
/** Dismiss persists for this quotation only. Returns the refreshed list. */
export const dismissSuggestion = (id: number, productId: number) =>
  api.del<Suggestion[]>(`/quotations/${id}/suggestions/${productId}`)

/* deal health — B9, manager only */
export const getDealHealth = () => api.get<DealHealthBoard>('/dashboard/health')
/** Drafts a follow-up. There is no mail server, so nothing is sent. */
export const nudgeAlert = (id: number) => api.post<NudgeResult>(`/alerts/${id}/nudge`)
/** Appends a Finance step to the quotation's approval, audited like any decision. */
export const escalateAlert = (id: number) => api.post<DealHealthBoard>(`/alerts/${id}/escalate`)
export const ackAlert = (id: number) => api.post<DealHealthBoard>(`/alerts/${id}/ack`)

/* reporting — A7, manager only */

/**
 * Built once and handed to both the table and the export, so the two cannot
 * disagree. Constructing the export URL separately is how they drift.
 */
export function reportQueryString(q: ReportQuery): string {
  const params = new URLSearchParams()
  if (q.from) params.set('from', q.from)
  if (q.to) params.set('to', q.to)
  if (q.repId !== undefined) params.set('repId', String(q.repId))
  if (q.status) params.set('status', q.status)
  if (q.categoryId !== undefined) params.set('categoryId', String(q.categoryId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export const runReport = (q: ReportQuery) =>
  api.get<ReportResult>(`/reports${reportQueryString(q)}`)

/** Same query string, different Accept. A blob, not JSON — link straight at it. */
export function reportPdfUrl(q: ReportQuery): string {
  const rest = reportQueryString(q).replace(/^\?/, '')
  return `/api/reports/export?format=pdf${rest ? `&${rest}` : ''}`
}

/* negotiation — the rep's side of the portal conversation (B8) */

/** Issues the magic link and moves the quotation to SENT. */
export const sendToCustomer = (id: number) =>
  api.post<SendResult>(`/quotations/${id}/send`)
export const getNegotiation = (id: number) =>
  api.get<NegotiationThread>(`/quotations/${id}/negotiation`)
export const replyToCustomer = (id: number, body: ReplyBody) =>
  api.post<NegotiationThread>(`/quotations/${id}/negotiation/reply`, body)

/* billing — one order, both halves (B7) */
export const getBilling = (quotationId: number) =>
  api.get<BillingView>(`/quotations/${quotationId}/billing`)

export const listInvoices = () => api.get<Invoice[]>('/invoices')
export const getInvoice = (id: number) => api.get<Invoice>(`/invoices/${id}`)

/** Finance only. Status is recomputed from the payments, never sent. */
export const recordPayment = (invoiceId: number, body: RecordPaymentBody) =>
  api.post<Invoice>(`/invoices/${invoiceId}/payments`, body)

/** Finance only. Both answer with the proration and the refreshed billing view. */
export const changeSubscription = (id: number, body: ChangeSubscriptionBody) =>
  api.post<ProrationResult>(`/subscriptions/${id}/change`, body)
export const cancelSubscription = (id: number, body: CancelSubscriptionBody) =>
  api.post<ProrationResult>(`/subscriptions/${id}/cancel`, body)

/** Demo aid — runs the same nightly job, one cycle forward. */
export const advanceBillingClock = () =>
  api.post<ClockAdvanceResult>('/billing/advance-clock')

/* approvals */
export const listApprovals = () => api.get<ApprovalSummary[]>('/approvals')
export const getApproval = (id: number) => api.get<ApprovalDetail>(`/approvals/${id}`)
export const decide = (id: number, body: DecideBody) =>
  api.post<ApprovalDetail>(`/approvals/${id}/decide`, body)

/* allocation — GET computes a suggestion and stores nothing; POST commits it */
export const listWarehouses = () => api.get<Warehouse[]>('/warehouses')

/* stock — live levels plus everything approved and waiting to ship */
export const getFulfilmentBoard = () => api.get<FulfilmentBoard>('/fulfilment')
/** Receiving stock makes anything backordered on that product consolidatable. */
export const receiveStock = (warehouseId: number, body: StockReceiptBody) =>
  api.post<FulfilmentBoard>(`/warehouses/${warehouseId}/stock`, body)
export const getAllocation = (id: number) =>
  api.get<AllocationPlan>(`/quotations/${id}/allocation`)
export const commitAllocation = (id: number, body: AcceptAllocationBody) =>
  api.post<AllocationPlan>(`/quotations/${id}/allocation`, body)

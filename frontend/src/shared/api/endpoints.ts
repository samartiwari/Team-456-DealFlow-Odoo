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
  DiscountPolicy,
  Invoice,
  NegotiationThread,
  FulfilmentBoard,
  Product,
  ProrationResult,
  RecordPaymentBody,
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

import { api } from './client'
import type {
  AcceptAllocationBody,
  AddLineBody,
  AllocationPlan,
  ApprovalDetail,
  ApprovalSummary,
  ConfirmResult,
  CreateQuotationBody,
  Customer,
  DecideBody,
  Product,
  QuotationSummary,
  RecomputeResult,
  UpdateLineBody,
  UpdateQuotationBody,
  Warehouse,
} from './types'

/* catalog */
export const listProducts = () => api.get<Product[]>('/products')
export const listCustomers = () => api.get<Customer[]>('/customers')

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

/* approvals */
export const listApprovals = () => api.get<ApprovalSummary[]>('/approvals')
export const getApproval = (id: number) => api.get<ApprovalDetail>(`/approvals/${id}`)
export const decide = (id: number, body: DecideBody) =>
  api.post<ApprovalDetail>(`/approvals/${id}/decide`, body)

/* allocation — GET computes a suggestion and stores nothing; POST commits it */
export const listWarehouses = () => api.get<Warehouse[]>('/warehouses')
export const getAllocation = (id: number) =>
  api.get<AllocationPlan>(`/quotations/${id}/allocation`)
export const commitAllocation = (id: number, body: AcceptAllocationBody) =>
  api.post<AllocationPlan>(`/quotations/${id}/allocation`, body)

export type Tier = 'BRONZE' | 'SILVER' | 'GOLD'

export type QuotationStage =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'UNDER_NEGOTIATION'
  | 'CONFIRMED'
  | 'REJECTED'

export type ApproverRole = 'SALES_MANAGER' | 'FINANCE'

export interface QuotationLine {
  id: number
  productName: string
  category: string
  quantity: number
  unitPrice: number
  discountPct: number
  allowedDiscountPct: number
  overagePts: number
  netTotal: number
}

/** Shape returned by POST /api/quotations/{id}/recompute — the client renders this verbatim. */
export interface RecomputeResult {
  id: number
  ref: string
  customerName: string
  tier: Tier
  stage: QuotationStage
  currency: string
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

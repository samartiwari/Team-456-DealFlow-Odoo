/**
 * The portal's own contract.
 *
 * These deliberately do NOT live in shared/api/types.ts and nothing here is
 * imported from it. Isolation is structural, not filtered: there is no
 * unitCost, no margin, no riskScore, no approval chain and no numeric
 * quotation id anywhere in this file, so no serialization mistake upstream can
 * put one in a customer's browser.
 */

export type PortalStatus = 'SENT' | 'UNDER_NEGOTIATION' | 'PENDING_APPROVAL' | 'CONFIRMED'

export interface PortalLine {
  /**
   * A line id is fine: the token already grants this whole quotation, so it
   * reveals nothing the customer cannot already see. It is the QUOTATION id
   * that never appears.
   */
  id: number
  productName: string
  category: string
  quantity: number
  unitPrice: number
  discountPct: number
  netTotal: number
}

export interface PortalMessage {
  id: number
  author: 'CUSTOMER' | 'SALES'
  authorName: string
  /** Null for a message about the order as a whole. */
  lineId: number | null
  body: string
  createdAt: string
}

export interface PortalCounter {
  discountPct: number
  note: string | null
  proposedAt: string
  /** PENDING while the quote is back with sales; ACCEPTED once confirmed. */
  state: 'PENDING' | 'ACCEPTED'
}

/** Everything the customer may see. */
export interface PortalQuotation {
  /** A UUID-shaped reference. There is no numeric id anywhere in this bundle. */
  publicRef: string
  customerName: string
  status: PortalStatus
  currency: string
  lines: PortalLine[]
  /** The discount applied across the order — what a counter proposes changing. */
  orderDiscountPct: number
  subtotal: number
  grandTotal: number
  messages: PortalMessage[]
  counter: PortalCounter | null
  /** False once confirmed, or while the quote is back with the sales team. */
  canCounter: boolean
  canConfirm: boolean
}

export interface VerifyResult {
  portalToken: string
  expiresAt: string
  customerName: string
}

export interface PortalMessageBody {
  lineId?: number
  body: string
}

export interface PortalCounterBody {
  discountPct: number
  note?: string
}

export class PortalError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'PortalError'
    this.status = status
  }
}

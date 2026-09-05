import type { Tone } from '@/shared/ui'
import type { QuotationStage } from '@/shared/api/types'

export const STAGE_LABEL: Record<QuotationStage, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  RETURNED: 'Returned',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SENT: 'Sent to customer',
  UNDER_NEGOTIATION: 'Under negotiation',
  CONFIRMED: 'Confirmed',
}

export const STAGE_TONE: Record<QuotationStage, Tone> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  RETURNED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  SENT: 'info',
  UNDER_NEGOTIATION: 'warning',
  CONFIRMED: 'success',
}

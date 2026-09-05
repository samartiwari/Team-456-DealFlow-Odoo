import type { QuotationStage } from '@/shared/api/types'

/**
 * "Open" means not finished, and finished is exactly these two stages.
 *
 * Defined once and shared, so the dashboard's Open Quotations count and the
 * pipeline's reading of the same set can never drift apart (Phase 13 §2.1).
 */
export const CLOSED_STAGES: QuotationStage[] = ['REJECTED', 'CONFIRMED']

export const isOpen = (stage: QuotationStage): boolean => !CLOSED_STAGES.includes(stage)

/**
 * The columns of the pipeline board, ordered by how a deal actually travels
 * (Phase 13 §3.2). CONFIRMED is a genuine endpoint of the journey and stays a
 * column; REJECTED is terminal noise and is rendered last, collapsed.
 */
export const PIPELINE_ORDER: QuotationStage[] = [
  'DRAFT',
  'RETURNED',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'UNDER_NEGOTIATION',
  'CONFIRMED',
]

/** Kept out of the ordered columns and shown collapsed with a count. */
export const PIPELINE_TERMINAL: QuotationStage = 'REJECTED'

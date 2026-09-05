import type { AllocationPlan } from '@/shared/api/types'

export interface DraftAllocation {
  productId: number
  productName: string
  warehouseId: number
  quantity: number
}

/** Seeds the editor from the server's suggestion, so an override starts from a working plan. */
export function seedFrom(plan: AllocationPlan): DraftAllocation[] {
  return plan.lines.map((l) => ({
    productId: l.productId,
    productName: l.productName,
    warehouseId: l.warehouseId,
    quantity: l.quantity,
  }))
}

/**
 * Ordered quantity per product, reconstructed as suggested lines plus backorders.
 * Both come from the same response, so the tally needs no extra call and always
 * reflects what was actually ordered rather than what could be stocked.
 */
export function orderedFrom(plan: AllocationPlan): Map<number, { name: string; qty: number }> {
  const ordered = new Map<number, { name: string; qty: number }>()
  const add = (productId: number, name: string, qty: number) => {
    const row = ordered.get(productId)
    if (row) row.qty += qty
    else ordered.set(productId, { name, qty })
  }
  plan.lines.forEach((l) => add(l.productId, l.productName, l.quantity))
  plan.backorders.forEach((b) => add(b.productId, b.productName, b.quantity))
  return ordered
}

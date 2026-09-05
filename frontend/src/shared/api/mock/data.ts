import type { Customer, Product, Tier } from '../types'
import { categoryCeiling, isStockable, tierCeiling } from './policy'

/**
 * Mirrors backend V2__seed.sql exactly, so mock and live agree.
 *
 * The rows below hold no ceilings. A ceiling belongs to the tier or the
 * category, never to the customer or product row, and it is joined on at read
 * time — so editing the policy moves every customer and product at once,
 * which is what makes the configuration screen mean anything.
 */

interface ProductRow {
  id: number
  name: string
  category: string
  unitPrice: number
}

const PRODUCT_ROWS: ProductRow[] = [
  { id: 1, name: 'Laptop Pro', category: 'Hardware', unitPrice: 80000 },
  { id: 2, name: 'Setup Service', category: 'Services', unitPrice: 15000 },
  { id: 3, name: 'Support Plan', category: 'Subscriptions', unitPrice: 2000 },
  { id: 4, name: 'Docking Station', category: 'Hardware', unitPrice: 12000 },
  { id: 5, name: 'Onsite Training', category: 'Services', unitPrice: 25000 },
]

interface CustomerRow {
  id: number
  name: string
  tier: Tier
  phone: string
}

const CUSTOMER_ROWS: CustomerRow[] = [
  { id: 1, name: 'Acme Corp', tier: 'GOLD', phone: '9999999999' },
  { id: 2, name: 'Beta Industries', tier: 'SILVER', phone: '9999999999' },
  { id: 3, name: 'Corex Ltd', tier: 'BRONZE', phone: '9999999999' },
]

/** The catalog as the API returns it — ceiling joined from product_category. */
export function products(): Product[] {
  return PRODUCT_ROWS.map((p) => ({
    ...p,
    categoryCeilingPct: categoryCeiling(p.category),
    stockable: isStockable(p.category),
  }))
}

/** Customers as the API returns them — ceiling joined from customer_tier. */
export function customers(): Customer[] {
  return CUSTOMER_ROWS.map((c) => ({ ...c, tierCeilingPct: tierCeiling(c.tier) }))
}

/** unit_cost never leaves the server. Held here only so the mock can compute margin. */
export const UNIT_COST: Record<number, number> = {
  1: 58000,
  2: 9000,
  3: 700,
  4: 8000,
  5: 16000,
}

export const ACTOR_NAMES: Record<number, string> = {
  1: 'Rep One',
  2: 'Meera Manager',
  3: 'Farid Finance',
}

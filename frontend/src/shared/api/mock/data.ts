import type { Customer, Product } from '../types'

/** Mirrors backend V2__seed.sql exactly, so mock and live agree. */

// stockable follows product_category.stockable: Hardware is shipped, Services and
// Subscriptions are delivered and so never enter a fulfilment plan.
export const PRODUCTS: Product[] = [
  { id: 1, name: 'Laptop Pro', category: 'Hardware', unitPrice: 80000, categoryCeilingPct: 15, stockable: true },
  { id: 2, name: 'Setup Service', category: 'Services', unitPrice: 15000, categoryCeilingPct: 10, stockable: false },
  { id: 3, name: 'Support Plan', category: 'Subscriptions', unitPrice: 2000, categoryCeilingPct: 8, stockable: false },
  { id: 4, name: 'Docking Station', category: 'Hardware', unitPrice: 12000, categoryCeilingPct: 15, stockable: true },
  { id: 5, name: 'Onsite Training', category: 'Services', unitPrice: 25000, categoryCeilingPct: 10, stockable: false },
]

/** unit_cost never leaves the server. Held here only so the mock can compute margin. */
export const UNIT_COST: Record<number, number> = {
  1: 58000,
  2: 9000,
  3: 700,
  4: 8000,
  5: 16000,
}

export const CUSTOMERS: Customer[] = [
  { id: 1, name: 'Acme Corp', tier: 'GOLD', tierCeilingPct: 15,  phone: '9999999999' },
  { id: 2, name: 'Beta Industries', tier: 'SILVER', tierCeilingPct: 10,  phone: '9999999999' },
  { id: 3, name: 'Corex Ltd', tier: 'BRONZE', tierCeilingPct: 5,  phone: '9999999999'  },
]

export const ACTOR_NAMES: Record<number, string> = {
  1: 'Rep One',
  2: 'Meera Manager',
  3: 'Farid Finance',
}

/** system_config rows. Changing a band here changes routing, exactly as in the database. */
export const CONFIG = {
  weightedWeight: 6,
  maxWeight: 4,
  managerBandMin: 1,
  financeBandMin: 50,
}

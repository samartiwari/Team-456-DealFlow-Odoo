import type { Customer, PriceList, Product, ProductDetail, Tier } from '../types'
import { categoryCeiling, isRecurring, isStockable, tierCeiling } from './policy'

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

/** Mirrors V2__seed.sql and V11__catalog.sql. Ids 1-5 are unchanged. */
const PRODUCT_ROWS: ProductRow[] = [
  { id: 1, name: 'Laptop Pro', category: 'Hardware', unitPrice: 80000 },
  { id: 2, name: 'Setup Service', category: 'Services', unitPrice: 15000 },
  { id: 3, name: 'Support Plan', category: 'Subscriptions', unitPrice: 2000 },
  { id: 4, name: 'Docking Station', category: 'Hardware', unitPrice: 12000 },
  { id: 5, name: 'Onsite Training', category: 'Services', unitPrice: 25000 },
  { id: 6, name: 'Ultrawide Monitor', category: 'Hardware', unitPrice: 32000 },
  { id: 7, name: 'Wireless Keyboard', category: 'Hardware', unitPrice: 4500 },
  { id: 8, name: 'Server Rack', category: 'Hardware', unitPrice: 140000 },
  { id: 9, name: 'Data Migration', category: 'Services', unitPrice: 45000 },
  { id: 10, name: 'Premium Support Plan', category: 'Subscriptions', unitPrice: 6000 },
  { id: 11, name: 'Analytics Add-on', category: 'Subscriptions', unitPrice: 3500 },
  { id: 12, name: 'Security Audit', category: 'Services', unitPrice: 60000 },
]

/**
 * product_variant. The same product in a different shape, carrying its own
 * price rather than a delta — so a price is always read, never computed from a
 * chain of adjustments nobody can follow.
 *
 * Only three products have them, and a variant cannot go on a quotation line
 * yet: AddLineBody takes a productId and nothing else.
 */
export const VARIANTS: Array<{ id: number; productId: number; name: string; unitPrice: number }> = [
  { id: 1, productId: 1, name: '16GB / 512GB', unitPrice: 80000 },
  { id: 2, productId: 1, name: '32GB / 1TB', unitPrice: 96000 },
  { id: 3, productId: 6, name: '34-inch', unitPrice: 32000 },
  { id: 4, productId: 6, name: '38-inch', unitPrice: 41000 },
  { id: 5, productId: 8, name: '24U', unitPrice: 140000 },
  { id: 6, productId: 8, name: '42U', unitPrice: 185000 },
]

/**
 * price_list and price_list_item.
 *
 * Gold has no list on purpose. The base price is the keenest rate in the
 * system — the largest customers are already on it, and their advantage shows
 * again in a wider discount ceiling. Smaller tiers sit on published lists
 * *above* it. Anything a list does not name falls through to the base price.
 */
interface PriceListRow {
  id: number
  name: string
  tier: Tier | null
  active: boolean
  /** productId -> what this tier pays. */
  prices: Record<number, number>
}

const PRICE_LIST_ROWS: PriceListRow[] = [
  { id: 1, name: 'Standard', tier: 'BRONZE', active: true, prices: { 1: 88000, 4: 13500, 6: 35500, 8: 156000 } },
  { id: 2, name: 'Growth', tier: 'SILVER', active: true, prices: { 1: 84000, 4: 12800, 6: 33500, 8: 148000 } },
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
    recurring: isRecurring(p.category),
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
  6: 21000,
  7: 2600,
  8: 98000,
  9: 28000,
  10: 2100,
  11: 1200,
  12: 39000,
}

export const ACTOR_NAMES: Record<number, string> = {
  1: 'Rep One',
  2: 'Meera Manager',
  3: 'Farid Finance',
  4: 'Priya Rao',
  5: 'Arjun Mehta',
  6: 'Nina Desai',
}

/**
 * What a customer of this tier actually pays: base, overridden by their tier's
 * price list where it names the product.
 *
 * Resolution is the server's job and must never happen in a screen — the client
 * renders whatever unitPrice comes back on the line. This is the mock standing
 * in for that resolution, not the rule leaking outward.
 *
 * A list overrides a variant too: a list is a commercial agreement with a named
 * tier, a variant is a fact about the product, and when they disagree the
 * agreement wins.
 */
export function resolveUnitPrice(productId: number, tier: Tier): number {
  const base = PRODUCT_ROWS.find((p) => p.id === productId)?.unitPrice ?? 0
  const list = PRICE_LIST_ROWS.find((l) => l.active && l.tier === tier)
  return list?.prices[productId] ?? base
}

/** The lists as the API returns them, with the base price alongside for comparison. */
export function priceLists(): PriceList[] {
  return PRICE_LIST_ROWS.map((l) => ({
    id: l.id,
    name: l.name,
    tier: l.tier,
    active: l.active,
    items: Object.entries(l.prices).map(([productId, unitPrice]) => {
      const row = PRODUCT_ROWS.find((p) => p.id === Number(productId))!
      return {
        productId: row.id,
        productName: row.name,
        unitPrice,
        basePrice: row.unitPrice,
      }
    }),
  }))
}

export function productDetail(id: number): ProductDetail | null {
  const row = products().find((p) => p.id === id)
  if (!row) return null
  return {
    ...row,
    variants: VARIANTS.filter((v) => v.productId === id).map((v) => ({
      id: v.id, name: v.name, unitPrice: v.unitPrice,
    })),
  }
}

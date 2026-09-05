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

export interface ProductRow {
  id: number
  name: string
  category: string
  unitPrice: number
  /**
   * Never leaves the server on a rep-facing shape. It lives on the row because
   * a product cannot be edited without it: margin is impossible otherwise, and
   * the column is not null.
   */
  unitCost: number
  /**
   * Archived rather than deleted. Quotations, invoices and stock history all
   * reference products, so deleting one would orphan real records. An archived
   * product leaves the catalog, and every existing line still resolves.
   */
  archived: boolean
}

/** Mirrors V2__seed.sql and V11__catalog.sql. Ids 1-5 are unchanged. */
export const PRODUCT_ROWS: ProductRow[] = [
  { id: 1, name: 'Laptop Pro', category: 'Hardware', unitPrice: 80000, unitCost: 58000, archived: false },
  { id: 2, name: 'Setup Service', category: 'Services', unitPrice: 15000, unitCost: 9000, archived: false },
  { id: 3, name: 'Support Plan', category: 'Subscriptions', unitPrice: 2000, unitCost: 700, archived: false },
  { id: 4, name: 'Docking Station', category: 'Hardware', unitPrice: 12000, unitCost: 8000, archived: false },
  { id: 5, name: 'Onsite Training', category: 'Services', unitPrice: 25000, unitCost: 16000, archived: false },
  { id: 6, name: 'Ultrawide Monitor', category: 'Hardware', unitPrice: 32000, unitCost: 21000, archived: false },
  { id: 7, name: 'Wireless Keyboard', category: 'Hardware', unitPrice: 4500, unitCost: 2600, archived: false },
  { id: 8, name: 'Server Rack', category: 'Hardware', unitPrice: 140000, unitCost: 98000, archived: false },
  { id: 9, name: 'Data Migration', category: 'Services', unitPrice: 45000, unitCost: 28000, archived: false },
  { id: 10, name: 'Premium Support Plan', category: 'Subscriptions', unitPrice: 6000, unitCost: 2100, archived: false },
  { id: 11, name: 'Analytics Add-on', category: 'Subscriptions', unitPrice: 3500, unitCost: 1200, archived: false },
  { id: 12, name: 'Security Audit', category: 'Services', unitPrice: 60000, unitCost: 39000, archived: false },
]

/**
 * product_variant. The same product in a different shape, carrying its own
 * price rather than a delta — so a price is always read, never computed from a
 * chain of adjustments nobody can follow.
 *
 * Only three products have them, and a variant cannot go on a quotation line
 * yet: AddLineBody takes a productId and nothing else.
 */
export interface VariantRow {
  id: number
  productId: number
  name: string
  unitPrice: number
  unitCost: number
}

export const VARIANTS: VariantRow[] = [
  { id: 1, productId: 1, name: '16GB / 512GB', unitPrice: 80000, unitCost: 58000 },
  { id: 2, productId: 1, name: '32GB / 1TB', unitPrice: 96000, unitCost: 69000 },
  { id: 3, productId: 6, name: '34-inch', unitPrice: 32000, unitCost: 21000 },
  { id: 4, productId: 6, name: '38-inch', unitPrice: 41000, unitCost: 27000 },
  { id: 5, productId: 8, name: '24U', unitPrice: 140000, unitCost: 98000 },
  { id: 6, productId: 8, name: '42U', unitPrice: 185000, unitCost: 129000 },
]

/**
 * price_list and price_list_item.
 *
 * Gold has no list on purpose. The base price is the keenest rate in the
 * system — the largest customers are already on it, and their advantage shows
 * again in a wider discount ceiling. Smaller tiers sit on published lists
 * *above* it. Anything a list does not name falls through to the base price.
 */
export interface PriceListRow {
  id: number
  name: string
  tier: Tier | null
  active: boolean
  archived: boolean
  /** productId -> what this tier pays. */
  prices: Record<number, number>
}

export const PRICE_LIST_ROWS: PriceListRow[] = [
  { id: 1, name: 'Standard', tier: 'BRONZE', active: true, archived: false, prices: { 1: 88000, 4: 13500, 6: 35500, 8: 156000 } },
  { id: 2, name: 'Growth', tier: 'SILVER', active: true, archived: false, prices: { 1: 84000, 4: 12800, 6: 33500, 8: 148000 } },
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
  // Archived rows leave the catalog, so no new quotation line can use one.
  //
  // Built field by field rather than spread from the row: the row carries
  // unitCost and archived, and spreading it would put a cost figure on the
  // quote builder — the one thing the rep-facing shape must never do.
  return PRODUCT_ROWS.filter((p) => !p.archived).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    unitPrice: p.unitPrice,
    categoryCeilingPct: categoryCeiling(p.category),
    stockable: isStockable(p.category),
    recurring: isRecurring(p.category),
  }))
}

/** Customers as the API returns them — ceiling joined from customer_tier. */
export function customers(): Customer[] {
  return CUSTOMER_ROWS.map((c) => ({ ...c, tierCeilingPct: tierCeiling(c.tier) }))
}

/**
 * unit_cost never leaves the server on a rep-facing shape. Read through this
 * rather than a frozen table, so editing a cost moves margin everywhere at
 * once.
 */
export function unitCostOf(productId: number, variantId?: number | null): number {
  const variant = variantId ? VARIANTS.find((v) => v.id === variantId) : undefined
  if (variant) return variant.unitCost

  return PRODUCT_ROWS.find((p) => p.id === productId)?.unitCost ?? 0
}

export const ACTOR_NAMES: Record<number, string> = {
  1: 'Rep One',
  2: 'Meera Manager',
  3: 'Farid Finance',
  4: 'Priya Rao',
  5: 'Arjun Mehta',
  6: 'Nina Desai',
  7: 'Devi Admin',
  8: 'Omar Operations',
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
export function resolveUnitPrice(
  productId: number, tier: Tier, variantId?: number | null,
): number {
  const base = PRODUCT_ROWS.find((p) => p.id === productId)?.unitPrice ?? 0
  const variant = variantId ? VARIANTS.find((v) => v.id === variantId) : undefined
  const list = PRICE_LIST_ROWS.find((l) => l.active && !l.archived && l.tier === tier)
  return list?.prices[productId] ?? variant?.unitPrice ?? base
}

/** The variant belongs to the product, or the line would price off a different thing. */
export function variantOf(productId: number, variantId: number | null | undefined) {
  if (!variantId) return null
  const variant = VARIANTS.find((v) => v.id === variantId)
  if (!variant) return undefined
  return variant.productId === productId ? variant : undefined
}

/** The lists as the API returns them, with the base price alongside for comparison. */
export function priceLists(): PriceList[] {
  return PRICE_LIST_ROWS.filter((l) => !l.archived).map((l) => ({
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

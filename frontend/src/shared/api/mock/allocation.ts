import { ApiError } from '../client'
import type { AllocationLine, AllocationPlan, Backorder, Warehouse } from '../types'
import { isStockable } from './policy'
import type { DraftLine } from './engine'

/**
 * Stand-in for the allocation service. Mirrors CLAUDE.md §2.6.3.
 *
 * Seeded so the demo case cannot pass by accident: Main stocks only 3 laptops
 * and East has 5, so an order for 6 must split 3 + 3.
 */

/**
 * The mock's own warehouse record. `shipmentFee` is deliberately absent from
 * the public WarehouseResponse, so it lives here rather than on the shared type
 * — but it belongs on the row, not in a side lookup keyed by id, where an
 * unknown warehouse would silently cost nothing to ship from.
 */
interface MockWarehouse extends Warehouse {
  shipmentFee: number
}

/** Values from V4__warehouse_seed.sql. */
export const WAREHOUSES: MockWarehouse[] = [
  { id: 1, name: 'Main Warehouse', shipmentFee: 500, shippingWeight: 1.0, replenishmentDays: 5 },
  { id: 2, name: 'East Depot', shipmentFee: 500, shippingWeight: 1.4, replenishmentDays: 7 },
]

/**
 * warehouseId -> productId -> units on hand. Mirrors V4__warehouse_seed.sql
 * after V5__stockable_categories.sql.
 *
 * Only Hardware is here. Products 2, 3 and 5 are Services and Subscriptions:
 * they are delivered rather than shipped, so V5 removed their stock rows and
 * allocation skips them entirely. Listing them here would make the mock
 * allocate services that the live API does not.
 */
export const STOCK: Record<number, Record<number, number>> = {
  // Main deliberately holds only 3 laptops, so an order for 6 must split.
  1: { 1: 3, 4: 10, 6: 12, 7: 60, 8: 2 },
  2: { 1: 5, 4: 20, 6: 20, 7: 90, 8: 4 },
}

/** Stock is mutated by receipts, so it has to survive a reload like any state. */
export function stockSnapshot(): Record<number, Record<number, number>> {
  return STOCK
}

export function restoreStock(snap: Record<number, Record<number, number>> | undefined): void {
  if (!snap) return
  for (const k of Object.keys(STOCK)) delete STOCK[Number(k)]
  Object.assign(STOCK, snap)
}

/**
 * Receive stock into a warehouse.
 *
 * Mirrors AllocationService.receiveStock: the row must already exist, because
 * a warehouse that has never carried a product has no shelf for it — stocking
 * something new is a setup action, not a receipt.
 */
export function receiveStock(warehouseId: number, productId: number, quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ApiError(422, 'A receipt must be for at least one unit.', 'quantity')
  }
  const w = WAREHOUSES.find((x) => x.id === warehouseId)
  if (!w) throw new ApiError(404, `Warehouse ${warehouseId} not found.`)

  const shelf = STOCK[warehouseId]
  if (!shelf || shelf[productId] === undefined) {
    throw new ApiError(404, `${w.name} does not carry that product.`, 'productId')
  }
  shelf[productId] += quantity
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function promisedDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Shortest restock among the warehouses that stock this product at all — a
 * shortfall is refilled by whoever can replenish soonest, not by whoever
 * happens to be slowest. Falls back to the fastest site overall if nobody
 * carries it.
 */
function replenishDaysFor(productId: number): number {
  const carriers = WAREHOUSES
    .filter((w) => (STOCK[w.id]?.[productId] ?? 0) > 0)
    .map((w) => w.replenishmentDays)
  return carriers.length > 0
    ? Math.min(...carriers)
    : Math.min(...WAREHOUSES.map((w) => w.replenishmentDays))
}

export function costOf(lines: AllocationLine[]): number {
  const used = new Map<number, number>()
  for (const l of lines) used.set(l.warehouseId, (used.get(l.warehouseId) ?? 0) + l.quantity)

  let total = 0
  for (const [warehouseId, units] of used) {
    const w = WAREHOUSES.find((x) => x.id === warehouseId)!
    total += w.shipmentFee + w.shippingWeight * units
  }
  return round2(total)
}

function shipmentCount(lines: AllocationLine[]): number {
  return new Set(lines.map((l) => l.warehouseId)).size
}

export function plan(lines: AllocationLine[], backorders: Backorder[]): {
  lines: AllocationLine[]
  backorders: Backorder[]
  shipmentCount: number
  estimatedCost: number
} {
  return {
    lines,
    backorders,
    shipmentCount: shipmentCount(lines),
    estimatedCost: costOf(lines),
  }
}

/**
 * 1. If one warehouse holds everything, ship from it — one shipment always
 *    beats two, however pricey that warehouse is.
 * 2. If several could, take the cheapest of them.
 * 3. Otherwise split, drawing from the lightest warehouse first until its
 *    stock runs out, then the next.
 * 4. Whatever is still unfilled becomes a backorder, promised from the fastest
 *    warehouse that stocks it.
 *
 * Weight decides the draw order in step 3, which is the whole reason it is
 * configurable per warehouse. Mirrors com.dealflow.domain.allocation.WarehouseSplitter
 * so the mock and the live API give the same answer.
 */

interface Wanted { name: string; qty: number }

export function suggest(demand: DraftLine[]): ReturnType<typeof plan> {
  const wanted = new Map<number, Wanted>()
  for (const l of demand) {
    if (!isStockable(l.category)) continue
    const row = wanted.get(l.productId)
    if (row) row.qty += l.quantity
    else wanted.set(l.productId, { name: l.productName, qty: l.quantity })
  }
  if (wanted.size === 0) return plan([], [])

  const totalUnits = [...wanted.values()].reduce((s, r) => s + r.qty, 0)

  // 1 + 2 — a single warehouse that covers every line, cheapest of those.
  const single = WAREHOUSES
    .filter((w) => [...wanted].every(([pid, r]) => (STOCK[w.id]?.[pid] ?? 0) >= r.qty))
    .sort((a, b) =>
      (a.shipmentFee + a.shippingWeight * totalUnits) -
      (b.shipmentFee + b.shippingWeight * totalUnits))[0]

  if (single) {
    return plan(
      [...wanted].map(([productId, r]) => ({
        productId, productName: r.name,
        warehouseId: single.id, warehouseName: single.name,
        quantity: r.qty,
      })),
      [],
    )
  }

  // 3 — split, lightest warehouse first.
  const remaining = new Map([...wanted].map(([pid, r]) => [pid, { ...r }]))
  const lines: AllocationLine[] = []

  for (const w of [...WAREHOUSES].sort((a, b) => a.shippingWeight - b.shippingWeight)) {
    if (![...remaining.values()].some((r) => r.qty > 0)) break
    for (const [pid, r] of remaining) {
      const take = Math.min(r.qty, STOCK[w.id]?.[pid] ?? 0)
      if (take <= 0) continue
      lines.push({
        productId: pid, productName: r.name,
        warehouseId: w.id, warehouseName: w.name,
        quantity: take,
      })
      r.qty -= take
    }
  }

  // 4 — the shortfall.
  const backorders: Backorder[] = [...remaining]
    .filter(([, r]) => r.qty > 0)
    .map(([productId, r]) => ({
      productId, productName: r.name, quantity: r.qty,
      promisedDate: promisedDate(replenishDaysFor(productId)),
    }))

  return plan(lines, backorders)
}

/** Manual override: quantities must match the order and must exist in stock. */
export function validateOverride(
  demand: DraftLine[],
  lines: Array<{ productId: number; warehouseId: number; quantity: number }>,
): AllocationLine[] {
  const ordered = new Map<number, number>()
  for (const l of demand) {
    if (!isStockable(l.category)) continue
    ordered.set(l.productId, (ordered.get(l.productId) ?? 0) + l.quantity)
  }

  const nameOf = (productId: number) =>
    demand.find((d) => d.productId === productId)?.productName ?? `Product ${productId}`

  // Merge rows first. The same product may legitimately be listed twice for one
  // warehouse, and checking each row alone would let two rows of 2 pass against
  // a warehouse holding only 3.
  const merged = new Map<string, AllocationLine>()
  for (const l of lines) {
    if (l.quantity <= 0) continue
    const w = WAREHOUSES.find((x) => x.id === l.warehouseId)
    if (!w) throw new ApiError(404, `Warehouse ${l.warehouseId} not found.`)

    const k = `${l.warehouseId}:${l.productId}`
    const row = merged.get(k)
    if (row) row.quantity += l.quantity
    else {
      merged.set(k, {
        productId: l.productId, productName: nameOf(l.productId),
        warehouseId: w.id, warehouseName: w.name,
        quantity: l.quantity,
      })
    }
  }

  // Totals must match the order, per product.
  const allocated = new Map<number, number>()
  for (const l of merged.values()) {
    allocated.set(l.productId, (allocated.get(l.productId) ?? 0) + l.quantity)
  }
  for (const [productId, qty] of ordered) {
    if ((allocated.get(productId) ?? 0) !== qty) {
      throw new ApiError(422, 'Allocated quantity must equal the ordered quantity.')
    }
  }
  for (const productId of allocated.keys()) {
    if (!ordered.has(productId)) {
      throw new ApiError(422, `${nameOf(productId)} is not a shippable line on this quotation.`)
    }
  }

  // Then stock, against the merged total rather than a single row.
  for (const l of merged.values()) {
    const onHand = STOCK[l.warehouseId]?.[l.productId] ?? 0
    if (l.quantity > onHand) {
      throw new ApiError(409, `${l.warehouseName} has only ${onHand} of ${l.productName}.`)
    }
  }

  return [...merged.values()]
}

export type { AllocationPlan }

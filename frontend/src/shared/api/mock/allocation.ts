import { ApiError } from '../client'
import type { AllocationLine, AllocationPlan, Backorder, Warehouse } from '../types'
import type { DraftLine } from './engine'

/**
 * Stand-in for the allocation service. Mirrors CLAUDE.md §2.6.3.
 *
 * Seeded so the demo case cannot pass by accident: Main stocks only 3 laptops
 * and East has 5, so an order for 6 must split 3 + 3.
 */

export const WAREHOUSES: Warehouse[] = [
  { id: 1, name: 'Main Warehouse', shippingWeight: 1.0, replenishmentDays: 5 },
  { id: 2, name: 'East Depot', shippingWeight: 1.4, replenishmentDays: 7 },
]

/** shipmentFee is not specified in the contract; see the note in the PR. */
const SHIPMENT_FEE = 500

/** warehouseId -> productId -> units on hand. */
export const STOCK: Record<number, Record<number, number>> = {
  1: { 1: 3, 2: 99, 3: 99, 4: 40, 5: 99 },
  2: { 1: 5, 2: 0, 3: 0, 4: 10, 5: 0 },
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function promisedDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function costOf(lines: AllocationLine[]): number {
  const used = new Map<number, number>()
  for (const l of lines) used.set(l.warehouseId, (used.get(l.warehouseId) ?? 0) + l.quantity)

  let total = 0
  for (const [warehouseId, units] of used) {
    const w = WAREHOUSES.find((x) => x.id === warehouseId)!
    total += SHIPMENT_FEE + w.shippingWeight * units
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
 * Fewest shipments first, then lowest cost.
 *
 * Each shipment carries a fixed fee, so the number of warehouses used dominates
 * the total — which means a per-warehouse greedy is the wrong tool. Taking the
 * most from the cheapest shipper can drag in a third warehouse that a smarter
 * pairing would have avoided, and that extra fee swamps any per-unit saving.
 *
 * So this searches combinations instead: try every subset of warehouses, small
 * first, and take the cheapest one that ships as much as any subset can. With a
 * realistic number of warehouses that is a handful of combinations and it is
 * exact; at hundreds of sites it would want min-cost flow instead.
 *
 * Within a chosen subset the allocation is a simple per-product sweep from the
 * cheapest member, and that IS optimal — the fees are already fixed by the
 * subset, so only weight x units is left and units are interchangeable.
 */

interface Wanted { name: string; qty: number }

/** Allocate a demand across one subset, cheapest member first. */
function allocateWithin(subset: Warehouse[], wanted: Map<number, Wanted>) {
  const order = [...subset].sort((a, b) => a.shippingWeight - b.shippingWeight)
  const remaining = new Map([...wanted].map(([pid, r]) => [pid, { ...r }]))
  const lines: AllocationLine[] = []

  for (const w of order) {
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

  const shipped = lines.reduce((s, l) => s + l.quantity, 0)
  return { lines, remaining, shipped }
}

/** Every subset of the warehouse list, smallest first. */
function subsets(all: Warehouse[]): Warehouse[][] {
  const out: Warehouse[][] = []
  for (let mask = 1; mask < 1 << all.length; mask++) {
    out.push(all.filter((_, i) => mask & (1 << i)))
  }
  return out.sort((a, b) => a.length - b.length)
}

export function suggest(demand: DraftLine[]): ReturnType<typeof plan> {
  const wanted = new Map<number, Wanted>()
  for (const l of demand) {
    const row = wanted.get(l.productId)
    if (row) row.qty += l.quantity
    else wanted.set(l.productId, { name: l.productName, qty: l.quantity })
  }
  if (wanted.size === 0) return plan([], [])

  const candidates = subsets(WAREHOUSES).map((subset) => {
    const { lines, remaining, shipped } = allocateWithin(subset, wanted)
    return { lines, remaining, shipped, size: new Set(lines.map((l) => l.warehouseId)).size, cost: costOf(lines) }
  })

  // Ship as much as any combination can — everything beyond that is a backorder
  // no matter which warehouses are chosen.
  const reachable = Math.max(...candidates.map((c) => c.shipped))

  const best = candidates
    .filter((c) => c.shipped === reachable)
    .sort((a, b) => a.size - b.size || a.cost - b.cost)[0]

  const slowest = Math.max(...WAREHOUSES.map((w) => w.replenishmentDays))
  const backorders: Backorder[] = [...best.remaining]
    .filter(([, r]) => r.qty > 0)
    .map(([productId, r]) => ({
      productId, productName: r.name, quantity: r.qty,
      promisedDate: promisedDate(slowest),
    }))

  return plan(best.lines, backorders)
}

/** Manual override: quantities must match the order and must exist in stock. */
export function validateOverride(
  demand: DraftLine[],
  lines: Array<{ productId: number; warehouseId: number; quantity: number }>,
): AllocationLine[] {
  const ordered = new Map<number, number>()
  for (const l of demand) ordered.set(l.productId, (ordered.get(l.productId) ?? 0) + l.quantity)

  const allocated = new Map<number, number>()
  for (const l of lines) allocated.set(l.productId, (allocated.get(l.productId) ?? 0) + l.quantity)

  for (const [productId, qty] of ordered) {
    if ((allocated.get(productId) ?? 0) !== qty) {
      throw new ApiError(422, 'Allocated quantity must equal the ordered quantity.')
    }
  }

  return lines.map((l) => {
    const w = WAREHOUSES.find((x) => x.id === l.warehouseId)
    if (!w) throw new ApiError(404, `Warehouse ${l.warehouseId} not found.`)
    const onHand = STOCK[w.id]?.[l.productId] ?? 0
    const name = demand.find((d) => d.productId === l.productId)?.productName ?? `Product ${l.productId}`
    if (l.quantity > onHand) {
      throw new ApiError(409, `${w.name} has only ${onHand} of ${name}.`)
    }
    return {
      productId: l.productId, productName: name,
      warehouseId: w.id, warehouseName: w.name,
      quantity: l.quantity,
    }
  })
}

export type { AllocationPlan }

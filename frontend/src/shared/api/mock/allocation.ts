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

function cost(lines: AllocationLine[]): number {
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
    estimatedCost: cost(lines),
  }
}

/**
 * 1. If one warehouse can fulfil every line completely, use it — cheapest single
 *    shipment wins.
 * 2. Otherwise greedily pick the warehouse covering the greatest remaining order
 *    VALUE, allocate what it can, and repeat on the rest.
 * 3. Whatever is still unfilled becomes a backorder.
 */
export function suggest(demand: DraftLine[]): ReturnType<typeof plan> {
  const wanted = new Map<number, { name: string; qty: number }>()
  for (const l of demand) {
    const row = wanted.get(l.productId)
    if (row) row.qty += l.quantity
    else wanted.set(l.productId, { name: l.productName, qty: l.quantity })
  }

  // Pass 1 — a single warehouse that covers everything.
  const whole = WAREHOUSES
    .filter((w) => [...wanted].every(([pid, r]) => (STOCK[w.id]?.[pid] ?? 0) >= r.qty))
    .sort((a, b) => a.shippingWeight - b.shippingWeight)[0]

  if (whole) {
    const lines = [...wanted].map(([productId, r]) => ({
      productId, productName: r.name,
      warehouseId: whole.id, warehouseName: whole.name,
      quantity: r.qty,
    }))
    return plan(lines, [])
  }

  // Pass 2 — draw from the cheapest warehouse first.
  //
  // The objective is fewest shipments, then lowest cost. Every warehouse that
  // holds any of the shortfall will be needed either way, so the count is fixed
  // and cost is the live variable: pulling the most from the cheapest shipper
  // minimises it. For the seeded case that is Main x3 then East x3 at 1007.20,
  // against 1008.00 for East x5 + Main x1 — same two shipments, lower cost.
  const remaining = new Map([...wanted].map(([pid, r]) => [pid, { ...r }]))
  const lines: AllocationLine[] = []
  const pool = [...WAREHOUSES].sort((a, b) => a.shippingWeight - b.shippingWeight)

  for (const w of pool) {
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

  // Pass 3 — anything left over is promised from the slowest warehouse used.
  const slowest = Math.max(...WAREHOUSES.map((w) => w.replenishmentDays))
  const backorders: Backorder[] = [...remaining]
    .filter(([, r]) => r.qty > 0)
    .map(([productId, r]) => ({
      productId, productName: r.name, quantity: r.qty,
      promisedDate: promisedDate(slowest),
    }))

  return plan(lines, backorders)
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

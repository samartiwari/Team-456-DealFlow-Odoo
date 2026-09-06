import { ApiError } from '../error'
import { getActor } from '../session'
import type {
  AdminPriceList, AdminProduct, AdminUpsellRule, AdminWarehouse, Category, CategoryBody,
  PlanBody, PriceListBody, ProductBody, ProductImpact, SubscriptionPlan, Tier,
  UpsellRuleBody, VariantBody, WarehouseBody,
} from '../types'
import { CAN } from '../types'
import { PRICE_LIST_ROWS, PRODUCT_ROWS, VARIANTS } from './data'
import { CATEGORIES, TIERS, UPSELL_RULES } from './policy'
import { STOCK, WAREHOUSES } from './allocation'
import { persist, plansAccepted, quotations } from './store'

/**
 * The write side of the configuration area.
 *
 * Everything here sits under /api/admin/** and every one of it is
 * manager-only. Keeping the writes on their own prefix rather than adding POST
 * to the endpoints already in use means nothing built against the read-only
 * shapes breaks, the admin shapes can carry cost and archived state that the
 * rep-facing ones must never carry, and one security rule covers the whole
 * area — so a new endpoint cannot ship ungated by accident.
 */

const seq = { product: 100, variant: 100, priceList: 100, warehouse: 100, plan: 0, upsell: 100 }

/** Admin still rides on MANAGER; there is no separate ADMIN role. */
function assertAdmin(): void {
  const actor = getActor()
  if (!CAN.configurePlatform(actor.role)) {
    throw new ApiError(
      403,
      `${actor.name} is a ${actor.role.toLowerCase()}. Backend configuration is managed by the sales manager.`,
    )
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function positive(value: number, field: string, what: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new ApiError(422, `${what} cannot be negative.`, field)
  }
  return value
}

/* ------------------------------------------------ A2: products */

function categoryByName(name: string): Category {
  const found = CATEGORIES.find((c) => c.name === name)
  if (!found) throw new ApiError(404, `Category ${name} not found.`, 'categoryId')
  return found
}

function categoryById(id: number): Category {
  const found = CATEGORIES.find((c) => c.id === id)
  if (!found) throw new ApiError(404, `Category ${id} not found.`, 'categoryId')
  return found
}

function toAdminProduct(row: (typeof PRODUCT_ROWS)[number]): AdminProduct {
  const category = categoryByName(row.category)
  return {
    id: row.id,
    name: row.name,
    categoryId: category.id,
    categoryName: category.name,
    unitPrice: row.unitPrice,
    unitCost: row.unitCost,
    // Derived, so a thin edit is visible while it is being typed.
    marginPct: row.unitPrice === 0 ? 0 : round2(((row.unitPrice - row.unitCost) / row.unitPrice) * 100),
    stockable: category.stockable,
    recurring: category.recurring,
    archived: row.archived,
    variants: VARIANTS.filter((v) => v.productId === row.id).map((v) => ({
      id: v.id, name: v.name, unitPrice: v.unitPrice, unitCost: v.unitCost,
    })),
  }
}

function productRow(id: number) {
  const row = PRODUCT_ROWS.find((p) => p.id === id)
  if (!row) throw new ApiError(404, `Product ${id} not found.`)
  return row
}

/** Selling below cost is almost always a typo rather than a decision. */
function checkPricing(unitPrice: number, unitCost: number): void {
  positive(unitPrice, 'unitPrice', 'A price')
  positive(unitCost, 'unitCost', 'A cost')
  if (unitCost > unitPrice) {
    throw new ApiError(422, 'The cost is higher than the price — this would sell at a loss.', 'unitCost')
  }
}

export function adminProducts(): AdminProduct[] {
  assertAdmin()
  return PRODUCT_ROWS.map(toAdminProduct)
}

export function createProduct(body: ProductBody): AdminProduct {
  assertAdmin()
  if (!body.name?.trim()) throw new ApiError(422, 'A product needs a name.', 'name')
  const category = categoryById(body.categoryId)
  checkPricing(body.unitPrice, body.unitCost)

  // New ids start above 100 so the seeded 1-12 stay stable and every fixture
  // keeps resolving.
  const row = {
    id: ++seq.product,
    name: body.name.trim(),
    category: category.name,
    unitPrice: body.unitPrice,
    unitCost: body.unitCost,
    archived: false,
  }
  PRODUCT_ROWS.push(row)
  persist()
  return toAdminProduct(row)
}

export function updateProduct(id: number, body: Partial<ProductBody>): AdminProduct {
  assertAdmin()
  const row = productRow(id)

  // A partial: absent means unchanged, and never null.
  const nextPrice = body.unitPrice ?? row.unitPrice
  const nextCost = body.unitCost ?? row.unitCost
  checkPricing(nextPrice, nextCost)
  if (body.name !== undefined && !body.name.trim()) {
    throw new ApiError(422, 'A product needs a name.', 'name')
  }

  if (body.name !== undefined) row.name = body.name.trim()
  if (body.categoryId !== undefined) row.category = categoryById(body.categoryId).name
  row.unitPrice = nextPrice
  row.unitCost = nextCost
  persist()
  return toAdminProduct(row)
}

/**
 * What a price change moves, and what it leaves alone.
 *
 * The number a screen needs before it saves: an admin correcting a price is
 * entitled to know it will not rewrite forty settled deals.
 */
export function impactOf(id: number): ProductImpact {
  assertAdmin()
  productRow(id)
  const touching = quotations.filter((q) => q.lines.some((l) => l.productId === id))
  return {
    openDrafts: touching.filter((q) => q.stage === 'DRAFT' || q.stage === 'RETURNED').length,
    frozenQuotations: touching.filter((q) => q.stage !== 'DRAFT' && q.stage !== 'RETURNED').length,
  }
}

export function archiveProduct(id: number): void {
  assertAdmin()
  productRow(id).archived = true
  persist()
}

export function restoreProduct(id: number): AdminProduct {
  assertAdmin()
  const row = productRow(id)
  row.archived = false
  persist()
  return toAdminProduct(row)
}

/* ------------------------------------------------ A2: variants */

export function addVariant(productId: number, body: VariantBody): AdminProduct {
  assertAdmin()
  const row = productRow(productId)
  if (!body.name?.trim()) throw new ApiError(422, 'A variant needs a name.', 'name')
  checkPricing(body.unitPrice, body.unitCost)
  if (VARIANTS.some((v) => v.productId === productId && v.name === body.name.trim())) {
    throw new ApiError(409, `${row.name} already has a variant called ${body.name.trim()}.`, 'name')
  }
  VARIANTS.push({
    id: ++seq.variant,
    productId,
    name: body.name.trim(),
    unitPrice: body.unitPrice,
    unitCost: body.unitCost,
  })
  persist()
  return toAdminProduct(row)
}

export function updateVariant(variantId: number, body: Partial<VariantBody>): AdminProduct {
  assertAdmin()
  const variant = VARIANTS.find((v) => v.id === variantId)
  if (!variant) throw new ApiError(404, `Variant ${variantId} not found.`)
  const nextPrice = body.unitPrice ?? variant.unitPrice
  const nextCost = body.unitCost ?? variant.unitCost
  checkPricing(nextPrice, nextCost)
  if (body.name !== undefined) {
    if (!body.name.trim()) throw new ApiError(422, 'A variant needs a name.', 'name')
    variant.name = body.name.trim()
  }
  variant.unitPrice = nextPrice
  variant.unitCost = nextCost
  persist()
  return toAdminProduct(productRow(variant.productId))
}

export function deleteVariant(variantId: number): AdminProduct {
  assertAdmin()
  const index = VARIANTS.findIndex((v) => v.id === variantId)
  if (index < 0) throw new ApiError(404, `Variant ${variantId} not found.`)
  const productId = VARIANTS[index].productId
  // A variant cannot be on a quotation line yet, so nothing references it.
  VARIANTS.splice(index, 1)
  persist()
  return toAdminProduct(productRow(productId))
}

/* ------------------------------------------------ A2: categories */

export function adminCategories(): Category[] {
  assertAdmin()
  return CATEGORIES.map((c) => ({ ...c }))
}

/**
 * Tunable, never creatable.
 *
 * These three flags feed three different engines — the ceiling into risk,
 * stockable into fulfilment, recurring into billing. Tuning the existing three
 * is useful; inventing a fourth reaches a state nothing else was built for.
 */
export function updateCategory(id: number, body: Partial<CategoryBody>): Category {
  assertAdmin()
  const row = categoryById(id)
  if (body.ceilingPct !== undefined) {
    if (body.ceilingPct !== null
      && (!Number.isFinite(body.ceilingPct) || body.ceilingPct < 0 || body.ceilingPct > 100)) {
      throw new ApiError(422, 'A ceiling must be between 0 and 100.', 'ceilingPct')
    }
    row.ceilingPct = body.ceilingPct
  }
  if (body.stockable !== undefined) row.stockable = body.stockable
  if (body.recurring !== undefined) row.recurring = body.recurring
  persist()
  return { ...row }
}

/* ------------------------------------------------ A2: price lists */

const tierById = (id: number | null): Tier | null =>
  id === null ? null : ((TIERS.find((t) => t.id === id)?.name.toUpperCase() ?? null) as Tier | null)

function toAdminPriceList(row: (typeof PRICE_LIST_ROWS)[number]): AdminPriceList {
  const tier = TIERS.find((t) => t.name.toUpperCase() === row.tier)
  return {
    id: row.id,
    name: row.name,
    tierId: tier?.id ?? null,
    tierName: tier?.name ?? null,
    active: row.active,
    archived: row.archived,
    items: Object.entries(row.prices).map(([productId, unitPrice]) => {
      const product = PRODUCT_ROWS.find((p) => p.id === Number(productId))
      return {
        productId: Number(productId),
        productName: product?.name ?? `Product ${productId}`,
        unitPrice,
        basePrice: product?.unitPrice ?? 0,
      }
    }),
  }
}

function priceListRow(id: number) {
  const row = PRICE_LIST_ROWS.find((l) => l.id === id)
  if (!row) throw new ApiError(404, `Price list ${id} not found.`)
  return row
}

/**
 * At most one live list per tier — otherwise a price is ambiguous and the
 * resolver silently picks whichever came first.
 */
function assertOneActivePerTier(tier: Tier | null, exceptId: number): void {
  if (tier === null) return
  const clash = PRICE_LIST_ROWS.find(
    (l) => l.id !== exceptId && l.active && !l.archived && l.tier === tier,
  )
  if (clash) {
    throw new ApiError(409, `${clash.name} is already the active list for ${tier}. Deactivate it first.`)
  }
}

export function adminPriceLists(): AdminPriceList[] {
  assertAdmin()
  // Archived lists are included here and nowhere else: the admin screen has to be
  // able to see one in order to bring it back.
  return PRICE_LIST_ROWS.map(toAdminPriceList)
}

export function createPriceList(body: PriceListBody): AdminPriceList {
  assertAdmin()
  if (!body.name?.trim()) throw new ApiError(422, 'A price list needs a name.', 'name')
  const tier = tierById(body.tierId ?? null)
  if (body.active) assertOneActivePerTier(tier, -1)

  const row = {
    id: ++seq.priceList,
    name: body.name.trim(),
    tier,
    active: body.active,
    archived: false,
    prices: {} as Record<number, number>,
  }
  PRICE_LIST_ROWS.push(row)
  persist()
  return toAdminPriceList(row)
}

export function updatePriceList(id: number, body: Partial<PriceListBody>): AdminPriceList {
  assertAdmin()
  const row = priceListRow(id)
  const nextTier = body.tierId !== undefined ? tierById(body.tierId) : row.tier
  const nextActive = body.active ?? row.active
  if (nextActive) assertOneActivePerTier(nextTier, id)

  if (body.name !== undefined) {
    if (!body.name.trim()) throw new ApiError(422, 'A price list needs a name.', 'name')
    row.name = body.name.trim()
  }
  row.tier = nextTier
  row.active = nextActive
  persist()
  return toAdminPriceList(row)
}

/**
 * Comes back inactive, never live.
 *
 * The tier this list names may have gained a different active list while it was
 * away, and quietly taking the slot back would reprice every open draft for that
 * tier without anyone asking for it.
 */
export function restorePriceList(id: number): AdminPriceList {
  assertAdmin()
  const row = priceListRow(id)
  row.archived = false
  row.active = false
  persist()
  return toAdminPriceList(row)
}

export function archivePriceList(id: number): void {
  assertAdmin()
  const row = priceListRow(id)
  row.archived = true
  row.active = false
  persist()
}

/** Upsert: one call whether the product is on the list already or not. */
export function setListPrice(listId: number, productId: number, unitPrice: number): AdminPriceList {
  assertAdmin()
  const row = priceListRow(listId)
  productRow(productId)
  positive(unitPrice, 'unitPrice', 'A price')
  row.prices[productId] = unitPrice
  persist()
  return toAdminPriceList(row)
}

export function removeListPrice(listId: number, productId: number): AdminPriceList {
  assertAdmin()
  const row = priceListRow(listId)
  // Removing what was never there is not an error — the end state is the same.
  delete row.prices[productId]
  persist()
  return toAdminPriceList(row)
}

/* ------------------------------------------------ A4: warehouses */

/** Kept out of the allocator without losing their history. */
const archivedWarehouses = new Set<number>()

function warehouseRow(id: number) {
  const row = WAREHOUSES.find((w) => w.id === id)
  if (!row) throw new ApiError(404, `Warehouse ${id} not found.`)
  return row
}

export function adminWarehouses(): AdminWarehouse[] {
  assertAdmin()
  return WAREHOUSES.map((w) => ({
    id: w.id,
    name: w.name,
    shipmentFee: w.shipmentFee,
    shippingWeight: w.shippingWeight,
    replenishmentDays: w.replenishmentDays,
    archived: archivedWarehouses.has(w.id),
  }))
}

function checkWarehouse(body: Partial<WarehouseBody>): void {
  if (body.shipmentFee !== undefined) positive(body.shipmentFee, 'shipmentFee', 'A shipment fee')
  if (body.shippingWeight !== undefined) positive(body.shippingWeight, 'shippingWeight', 'A shipping weight')
  if (body.replenishmentDays !== undefined) {
    positive(body.replenishmentDays, 'replenishmentDays', 'A replenishment window')
  }
}

export function createWarehouse(body: WarehouseBody): AdminWarehouse {
  assertAdmin()
  if (!body.name?.trim()) throw new ApiError(422, 'A warehouse needs a name.', 'name')
  checkWarehouse(body)
  const id = ++seq.warehouse
  WAREHOUSES.push({
    id,
    name: body.name.trim(),
    shipmentFee: body.shipmentFee,
    shippingWeight: body.shippingWeight,
    replenishmentDays: body.replenishmentDays,
  })
  STOCK[id] = {}
  persist()
  return adminWarehouses().find((w) => w.id === id)!
}

export function updateWarehouse(id: number, body: Partial<WarehouseBody>): AdminWarehouse {
  assertAdmin()
  const row = warehouseRow(id)
  checkWarehouse(body)
  if (body.name !== undefined) {
    if (!body.name.trim()) throw new ApiError(422, 'A warehouse needs a name.', 'name')
    row.name = body.name.trim()
  }
  // The allocator reads all three on every split, so an edit here visibly
  // changes which warehouse the next quotation ships from.
  if (body.shipmentFee !== undefined) row.shipmentFee = body.shipmentFee
  if (body.shippingWeight !== undefined) row.shippingWeight = body.shippingWeight
  if (body.replenishmentDays !== undefined) row.replenishmentDays = body.replenishmentDays
  persist()
  return adminWarehouses().find((w) => w.id === id)!
}

export function archiveWarehouse(id: number): void {
  assertAdmin()
  const row = warehouseRow(id)

  const held = Object.values(STOCK[id] ?? {}).reduce((sum, n) => sum + n, 0)
  if (held > 0) {
    throw new ApiError(409, `${row.name} still holds ${held} units. Move the stock first.`)
  }
  const open = Object.values(plansAccepted()).some((plan) =>
    plan.lines.some((l) => l.warehouseId === id),
  )
  if (open) throw new ApiError(409, `${row.name} has allocations that have not shipped.`)

  archivedWarehouses.add(id)
  persist()
}

/** Reopens a closed warehouse. It rejoins the allocator's candidates immediately. */
export function restoreWarehouse(id: number): AdminWarehouse {
  assertAdmin()
  warehouseRow(id)
  archivedWarehouses.delete(id)
  persist()
  return adminWarehouses().find((w) => w.id === id)!
}

/* ------------------------------------------------ A5: subscription plans */

interface PlanRow {
  id: number
  name: string
  productId: number
  interval: SubscriptionPlan['interval']
  prorationPolicy: SubscriptionPlan['prorationPolicy']
  cancellationPolicy: SubscriptionPlan['cancellationPolicy']
  active: boolean
}

/**
 * Every recurring product is seeded with a plan reproducing exactly today's
 * behaviour, so nothing about billing changes until an admin changes it.
 */
export const PLANS: PlanRow[] = []

for (const product of PRODUCT_ROWS) {
  if (!CATEGORIES.find((c) => c.name === product.category)?.recurring) continue
  PLANS.push({
    id: ++seq.plan,
    name: `${product.name} — monthly`,
    productId: product.id,
    interval: 'MONTHLY',
    prorationPolicy: 'PRORATE',
    cancellationPolicy: 'IMMEDIATE_WITH_CREDIT',
    active: true,
  })
}

const toPlan = (row: PlanRow): SubscriptionPlan => ({
  ...row,
  productName: PRODUCT_ROWS.find((p) => p.id === row.productId)?.name ?? `Product ${row.productId}`,
})

export function adminPlans(): SubscriptionPlan[] {
  assertAdmin()
  return PLANS.map(toPlan)
}

function checkPlanProduct(productId: number): void {
  const product = productRow(productId)
  if (!CATEGORIES.find((c) => c.name === product.category)?.recurring) {
    throw new ApiError(422, `${product.name} is not billed recurrently.`, 'productId')
  }
}

function assertOneActivePlan(productId: number, exceptId: number): void {
  const clash = PLANS.find((p) => p.id !== exceptId && p.active && p.productId === productId)
  if (clash) throw new ApiError(409, `${clash.name} is already the active plan for that product.`)
}

export function createPlan(body: PlanBody): SubscriptionPlan {
  assertAdmin()
  if (!body.name?.trim()) throw new ApiError(422, 'A plan needs a name.', 'name')
  checkPlanProduct(body.productId)
  if (body.active) assertOneActivePlan(body.productId, -1)

  const row: PlanRow = {
    id: ++seq.plan,
    name: body.name.trim(),
    productId: body.productId,
    interval: body.interval,
    prorationPolicy: body.prorationPolicy,
    cancellationPolicy: body.cancellationPolicy,
    active: body.active,
  }
  PLANS.push(row)
  persist()
  return toPlan(row)
}

export function updatePlan(id: number, body: Partial<PlanBody>): SubscriptionPlan {
  assertAdmin()
  const row = PLANS.find((p) => p.id === id)
  if (!row) throw new ApiError(404, `Plan ${id} not found.`)

  const nextProduct = body.productId ?? row.productId
  if (body.productId !== undefined) checkPlanProduct(body.productId)
  if (body.active ?? row.active) assertOneActivePlan(nextProduct, id)

  if (body.name !== undefined) {
    if (!body.name.trim()) throw new ApiError(422, 'A plan needs a name.', 'name')
    row.name = body.name.trim()
  }
  row.productId = nextProduct
  if (body.interval !== undefined) row.interval = body.interval
  if (body.prorationPolicy !== undefined) row.prorationPolicy = body.prorationPolicy
  if (body.cancellationPolicy !== undefined) row.cancellationPolicy = body.cancellationPolicy
  if (body.active !== undefined) row.active = body.active
  persist()
  return toPlan(row)
}

export function deletePlan(id: number): void {
  assertAdmin()
  const index = PLANS.findIndex((p) => p.id === id)
  if (index < 0) throw new ApiError(404, `Plan ${id} not found.`)
  // Plans reference nothing historical, so this deletes for real.
  PLANS.splice(index, 1)
  persist()
}

/* ------------------------------------------------ A6: upsell rules */

const nameOf = (id: number) => PRODUCT_ROWS.find((p) => p.id === id)?.name ?? `Product ${id}`

/** A stable id over an array that carries none of its own. */
const ruleId = (r: (typeof UPSELL_RULES)[number]) => r.triggerProductId * 1000 + r.suggestProductId

const toRule = (r: (typeof UPSELL_RULES)[number]): AdminUpsellRule => ({
  id: ruleId(r),
  triggerProductId: r.triggerProductId,
  triggerProductName: nameOf(r.triggerProductId),
  suggestedProductId: r.suggestProductId,
  suggestedProductName: nameOf(r.suggestProductId),
  minMarginPct: r.minMarginPct,
  promoted: r.promoted,
})

export function adminUpsellRules(): AdminUpsellRule[] {
  assertAdmin()
  return UPSELL_RULES.map(toRule)
}

function checkRule(body: Partial<UpsellRuleBody>, current?: UpsellRuleBody): void {
  const trigger = body.triggerProductId ?? current?.triggerProductId
  const suggested = body.suggestedProductId ?? current?.suggestedProductId
  if (trigger !== undefined) productRow(trigger)
  if (suggested !== undefined) productRow(suggested)
  if (trigger !== undefined && trigger === suggested) {
    throw new ApiError(422, 'A product cannot suggest itself.', 'suggestedProductId')
  }
  const floor = body.minMarginPct ?? current?.minMarginPct
  if (floor !== undefined && (!Number.isFinite(floor) || floor < 0 || floor > 100)) {
    throw new ApiError(422, 'A margin floor must be between 0 and 100.', 'minMarginPct')
  }
}

export function createUpsellRule(body: UpsellRuleBody): AdminUpsellRule {
  assertAdmin()
  checkRule(body)
  if (UPSELL_RULES.some((r) =>
    r.triggerProductId === body.triggerProductId && r.suggestProductId === body.suggestedProductId)) {
    throw new ApiError(409, 'That pairing already exists. Edit it rather than adding a second.')
  }
  const row = {
    triggerProductId: body.triggerProductId,
    suggestProductId: body.suggestedProductId,
    promoted: body.promoted,
    minMarginPct: body.minMarginPct,
  }
  UPSELL_RULES.push(row)
  persist()
  return toRule(row)
}

export function updateUpsellRule(id: number, body: Partial<UpsellRuleBody>): AdminUpsellRule {
  assertAdmin()
  const row = UPSELL_RULES.find((r) => ruleId(r) === id)
  if (!row) throw new ApiError(404, `Upsell rule ${id} not found.`)
  checkRule(body, {
    triggerProductId: row.triggerProductId,
    suggestedProductId: row.suggestProductId,
    minMarginPct: row.minMarginPct,
    promoted: row.promoted,
  })
  if (body.triggerProductId !== undefined) row.triggerProductId = body.triggerProductId
  if (body.suggestedProductId !== undefined) row.suggestProductId = body.suggestedProductId
  if (body.minMarginPct !== undefined) row.minMarginPct = body.minMarginPct
  if (body.promoted !== undefined) row.promoted = body.promoted
  persist()
  return toRule(row)
}

export function deleteUpsellRule(id: number): void {
  assertAdmin()
  const index = UPSELL_RULES.findIndex((r) => ruleId(r) === id)
  if (index < 0) throw new ApiError(404, `Upsell rule ${id} not found.`)
  UPSELL_RULES.splice(index, 1)
  persist()
}

import { getActor } from '../session'
import { ApiError } from '../client'
import type {
  AcceptAllocationBody, AddLineBody, CreateQuotationBody, DecideBody,
  CancelSubscriptionBody, ChangeSubscriptionBody, RecordPaymentBody, ReplyBody,
  CategoryBody, LoginBody, PlanBody, PriceListBody, ProductBody, QuotationStage, ReportQuery, SignupBody, StockReceiptBody, UpdateLineBody, UpdatePolicyBody, UpdateQuotationBody,
  UpsellRuleBody, VariantBody, WarehouseBody,
} from '../types'
import { customers, priceLists, productDetail, products } from './data'
import { readPolicy, writePolicy } from './policy'
import { login, me, reps, signup } from './auth'
import * as admin from './admin'
import { getToken } from '../session'
import { ackAlertById, dealHealth, escalate, nudge, report } from './health'
import { WAREHOUSES } from './allocation'
import {
  activityFeed,
  allocationFor, assertCanCreate, assertEditable, commitAllocation, confirm, decide, detail, find,
  fulfilmentBoard, persist, queue, quotations, receiveStockInto, record, seq, summary, view,
  dismissSuggestionFor, suggestionsFor,
  addPayment, advanceClock, allInvoices, billingFor, cancelSubscriptionById,
  changeSubscriptionQty, invoiceById,
  negotiationFor, portalConfirm, portalCounter, portalMessage, portalQuotation,
  replyOnQuotation, sendQuotation, verifyMagicLink,
} from './store'

/**
 * In-memory stand-in for the REST layer, enabled by VITE_USE_MOCKS=true and
 * resolved per endpoint, so the real API can be adopted one route at a time.
 */

const MOCKED = [
  /^\/products/, /^\/price-lists$/, /^\/customers$/, /^\/warehouses/, /^\/fulfilment$/,
  /^\/config\//, /^\/quotations/, /^\/approvals/,
  /^\/invoices/, /^\/subscriptions/, /^\/billing\//, /^\/portal\//,
  /^\/dashboard\//, /^\/alerts/, /^\/reports/, /^\/auth\//, /^\/users/, /^\/admin\//,
  /^\/activity/,
]

export function isMocked(_method: string, path: string): boolean {
  const clean = path.split('?')[0]
  return MOCKED.some((r) => r.test(clean))
}

/** Enough latency for loading states and the 250ms debounce to behave realistically. */
const latency = () => new Promise((r) => setTimeout(r, 140))

/** ?limit on the activity feed — defaults to 20, capped at 100, same as the contract. */
function activityLimit(path: string): number {
  const raw = new URLSearchParams(path.split('?')[1] ?? '').get('limit')
  const n = raw === null ? 20 : Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 20
}

export async function mockFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  await latency()
  const p = path.split('?')[0]
  const seg = p.split('/').filter(Boolean)

  if (p === '/auth/login' && method === 'POST') return login(body as LoginBody) as T
  if (p === '/auth/signup' && method === 'POST') return signup(body as SignupBody) as T
  if (p === '/auth/me' && method === 'GET') return me(getToken()) as T
  if (p === '/users' && method === 'GET') return reps() as T

  if (method === 'GET' && p === '/products') return products() as T
  if (method === 'GET' && p === '/price-lists') return priceLists() as T

  if (method === 'GET' && seg[0] === 'products' && seg.length === 2) {
    const detail = productDetail(Number(seg[1]))
    if (!detail) throw new ApiError(404, `Product ${seg[1]} not found.`)
    return detail as T
  }
  if (method === 'GET' && p === '/customers') return customers() as T
  if (method === 'GET' && p === '/warehouses') return WAREHOUSES as T
  if (method === 'GET' && p === '/fulfilment') return fulfilmentBoard() as T
  if (method === 'GET' && p === '/dashboard/health') return dealHealth() as T
  if (method === 'GET' && p === '/reports') return report(reportQuery(path)) as T
  if (method === 'GET' && p === '/activity') return activityFeed(activityLimit(path)) as T

  if (method === 'POST' && seg[0] === 'alerts') {
    const alertId = Number(seg[1])
    if (seg[2] === 'nudge') return nudge(alertId) as T
    if (seg[2] === 'escalate') return escalate(alertId) as T
    if (seg[2] === 'ack') return ackAlertById(alertId) as T
  }

  // POST /warehouses/{id}/stock — matches the live WarehouseController path.
  if (method === 'POST' && seg[0] === 'warehouses' && seg[2] === 'stock') {
    return receiveStockInto(Number(seg[1]), body as StockReceiptBody) as T
  }

  if (p === '/config/discount-policy') {
    if (method === 'GET') return readPolicy() as T
    if (method === 'PATCH') {
      const next = writePolicy(body as UpdatePolicyBody) as T
      // A policy edit re-prices every quotation, so snapshot it like any write.
      persist()
      return next
    }
  }

  const result =
    seg[0] === 'admin' ? adminRoutes<T>(method, seg, body)
    : seg[0] === 'portal' ? portalRoutes<T>(method, seg, body)
    : seg[0] === 'quotations' ? quotationRoutes<T>(method, seg, body)
    : seg[0] === 'approvals' ? approvalRoutes<T>(method, seg, body)
    : seg[0] === 'invoices' ? invoiceRoutes<T>(method, seg, body)
    : seg[0] === 'subscriptions' ? subscriptionRoutes<T>(method, seg, body)
    : seg[0] === 'billing' && seg[1] === 'advance-clock' && method === 'POST'
      ? (advanceClock() as T)
    : (() => { throw new ApiError(404, `No mock for ${method} ${p}`) })()

  // Everything that is not a GET changed state; snapshot it so a reload keeps it.
  if (method !== 'GET') persist()
  return result
}

function quotationRoutes<T>(method: string, seg: string[], body?: unknown): T {
  if (method === 'GET' && seg.length === 1) return quotations.map(summary) as T

  if (method === 'POST' && seg.length === 1) {
    assertCanCreate()
    const q = {
      id: ++seq.quotation,
      ref: `Q-${String(seq.quotation).padStart(4, '0')}`,
      customerId: (body as CreateQuotationBody).customerId,
      repId: getActor().id,
      stage: 'DRAFT' as const,
      orderDiscountPct: 0,
      lines: [],
    }
    quotations.push(q)
    record(q.id, 'QUOTATION_CREATED', null, 'DRAFT', null)
    return view(q) as T
  }

  const id = Number(seg[1])

  if (method === 'GET' && seg.length === 2) return view(find(id)) as T
  if (method === 'POST' && seg[2] === 'recompute') return view(find(id)) as T
  if (method === 'POST' && seg[2] === 'confirm') return confirm(id) as T
  if (method === 'GET' && seg[2] === 'billing') return billingFor(id) as T
  if (method === 'POST' && seg[2] === 'send') return sendQuotation(id) as T
  if (seg[2] === 'negotiation') {
    if (method === 'GET' && seg.length === 3) return negotiationFor(id) as T
    if (method === 'POST' && seg[3] === 'reply') return replyOnQuotation(id, body as ReplyBody) as T
  }

  if (seg[2] === 'suggestions') {
    if (method === 'GET' && seg.length === 3) return suggestionsFor(id) as T
    if (method === 'DELETE' && seg.length === 4) return dismissSuggestionFor(id, Number(seg[3])) as T
  }

  if (seg[2] === 'allocation') {
    if (method === 'GET') return allocationFor(id) as T
    if (method === 'POST') return commitAllocation(id, body as AcceptAllocationBody) as T
  }

  if (method === 'PATCH' && seg.length === 2) {
    const q = find(id)
    assertEditable(q)
    const b = body as UpdateQuotationBody
    if (b.orderDiscountPct !== undefined) q.orderDiscountPct = b.orderDiscountPct
    if (b.customerId !== undefined) {
      if (!customers().some((c) => c.id === b.customerId)) {
        throw new ApiError(404, `Customer ${b.customerId} not found.`, 'customerId')
      }
      // Nothing else to change: the tier ceiling is read off the customer on
      // every recompute, so the new ceiling applies to every line at once.
      q.customerId = b.customerId
    }
    return view(q) as T
  }

  if (method === 'POST' && seg[2] === 'lines') {
    const q = find(id)
    assertEditable(q)
    const b = body as AddLineBody
    const product = products().find((x) => x.id === b.productId)
    if (!product) throw new ApiError(404, `Product ${b.productId} not found.`)
    q.lines.push({
      id: ++seq.line,
      productId: product.id,
      productName: product.name,
      category: product.category,
      unitPrice: product.unitPrice,
      quantity: b.quantity,
      discountPct: b.discountPct,
    })
    return view(q) as T
  }

  if (seg[2] === 'lines' && seg.length === 4) {
    const q = find(id)
    assertEditable(q)
    const lineId = Number(seg[3])
    const idx = q.lines.findIndex((l) => l.id === lineId)
    if (idx < 0) throw new ApiError(404, `Line ${lineId} not found.`)

    if (method === 'DELETE') {
      q.lines.splice(idx, 1)
    } else if (method === 'PATCH') {
      const b = body as UpdateLineBody
      if (b.quantity !== undefined) q.lines[idx].quantity = b.quantity
      if (b.discountPct !== undefined) q.lines[idx].discountPct = b.discountPct
    }
    return view(q) as T
  }

  throw new ApiError(404, `No mock for ${method} /${seg.join('/')}`)
}

function approvalRoutes<T>(method: string, seg: string[], body?: unknown): T {
  if (method === 'GET' && seg.length === 1) return queue() as T
  if (method === 'GET' && seg.length === 2) return detail(Number(seg[1])) as T
  if (method === 'POST' && seg[2] === 'decide') return decide(Number(seg[1]), body as DecideBody) as T
  throw new ApiError(404, `No mock for ${method} /${seg.join('/')}`)
}

function invoiceRoutes<T>(method: string, seg: string[], body?: unknown): T {
  if (method === 'GET' && seg.length === 1) return allInvoices() as T
  const id = Number(seg[1])
  if (method === 'GET' && seg.length === 2) return invoiceById(id) as T
  if (method === 'POST' && seg[2] === 'payments') {
    return addPayment(id, body as RecordPaymentBody) as T
  }
  throw new ApiError(404, `No mock for ${method} /${seg.join('/')}`)
}

function subscriptionRoutes<T>(method: string, seg: string[], body?: unknown): T {
  const id = Number(seg[1])
  if (method === 'POST' && seg[2] === 'change') {
    return changeSubscriptionQty(id, body as ChangeSubscriptionBody) as T
  }
  if (method === 'POST' && seg[2] === 'cancel') {
    return cancelSubscriptionById(id, body as CancelSubscriptionBody) as T
  }
  throw new ApiError(404, `No mock for ${method} /${seg.join('/')}`)
}

/**
 * The portal's routes.
 *
 * Identity comes from the X-Portal-Token header, never from a query parameter
 * and never from the path — there is no /portal/quotation/{id} to guess at,
 * which removes IDOR as a category rather than defending against it.
 */
function portalRoutes<T>(method: string, seg: string[], body?: unknown): T {
  if (method === 'POST' && seg[1] === 'auth' && seg[2] === 'verify') {
    return verifyMagicLink((body as { token: string }).token) as T
  }

  const token = portalTokenHeader
  if (!token) throw new ApiError(401, 'Your session has expired. Ask for a new link.')

  if (seg[1] === 'quotation') {
    if (method === 'GET' && seg.length === 2) return portalQuotation(token) as T
    if (method === 'POST' && seg[2] === 'messages') {
      return portalMessage(token, body as { lineId?: number; body: string }) as T
    }
    if (method === 'POST' && seg[2] === 'counter') {
      return portalCounter(token, body as { discountPct: number; note?: string }) as T
    }
    if (method === 'POST' && seg[2] === 'confirm') return portalConfirm(token) as T
  }

  throw new ApiError(404, `No mock for ${method} /${seg.join('/')}`)
}

/**
 * The portal client sets this before each call, because the mock has no request
 * headers to read. It is the stand-in for the X-Portal-Token header.
 */
let portalTokenHeader: string | null = null

export function setMockPortalToken(token: string | null): void {
  portalTokenHeader = token
}

/**
 * The report's four filters, read back off the query string.
 *
 * The live API parses these from the request; the mock has to do the same so
 * that one query object really does drive both the table and the export.
 */
function reportQuery(path: string): ReportQuery {
  const raw = path.split('?')[1] ?? ''
  const params = new URLSearchParams(raw)
  const q: ReportQuery = {}
  const from = params.get('from')
  const to = params.get('to')
  const repId = params.get('repId')
  const status = params.get('status')
  const categoryId = params.get('categoryId')
  if (from) q.from = from
  if (to) q.to = to
  if (repId) q.repId = Number(repId)
  if (status) q.status = status as QuotationStage
  if (categoryId) q.categoryId = Number(categoryId)
  return q
}

/**
 * Every write in the configuration area, on one prefix.
 *
 * The whole of /api/admin/** is manager-only, checked inside each handler
 * rather than here — one rule per area, so a route added later cannot ship
 * ungated by someone forgetting a check in this switch.
 */
function adminRoutes<T>(method: string, seg: string[], body?: unknown): T {
  const [, area, rawId, sub, subId] = seg
  const id = Number(rawId)

  if (area === 'products') {
    if (method === 'GET' && seg.length === 2) return admin.adminProducts() as T
    if (method === 'POST' && seg.length === 2) return admin.createProduct(body as ProductBody) as T
    if (method === 'GET' && sub === 'impact') return admin.impactOf(id) as T
    if (method === 'POST' && sub === 'restore') return admin.restoreProduct(id) as T
    if (method === 'POST' && sub === 'variants') return admin.addVariant(id, body as VariantBody) as T
    if (method === 'PATCH' && seg.length === 3) {
      return admin.updateProduct(id, body as Partial<ProductBody>) as T
    }
    if (method === 'DELETE' && seg.length === 3) {
      admin.archiveProduct(id)
      return undefined as T
    }
  }

  if (area === 'variants') {
    if (method === 'PATCH') return admin.updateVariant(id, body as Partial<VariantBody>) as T
    if (method === 'DELETE') return admin.deleteVariant(id) as T
  }

  if (area === 'categories') {
    if (method === 'GET' && seg.length === 2) return admin.adminCategories() as T
    if (method === 'PATCH') return admin.updateCategory(id, body as Partial<CategoryBody>) as T
  }

  if (area === 'price-lists') {
    if (method === 'GET' && seg.length === 2) return admin.adminPriceLists() as T
    if (method === 'POST' && seg.length === 2) return admin.createPriceList(body as PriceListBody) as T
    if (sub === 'items') {
      const productId = Number(subId)
      if (method === 'PUT') {
        return admin.setListPrice(id, productId, (body as { unitPrice: number }).unitPrice) as T
      }
      if (method === 'DELETE') return admin.removeListPrice(id, productId) as T
    }
    if (method === 'PATCH' && seg.length === 3) {
      return admin.updatePriceList(id, body as Partial<PriceListBody>) as T
    }
    if (method === 'DELETE' && seg.length === 3) {
      admin.archivePriceList(id)
      return undefined as T
    }
  }

  if (area === 'warehouses') {
    if (method === 'GET' && seg.length === 2) return admin.adminWarehouses() as T
    if (method === 'POST' && seg.length === 2) return admin.createWarehouse(body as WarehouseBody) as T
    if (method === 'PATCH') return admin.updateWarehouse(id, body as Partial<WarehouseBody>) as T
    if (method === 'DELETE') {
      admin.archiveWarehouse(id)
      return undefined as T
    }
  }

  if (area === 'subscription-plans') {
    if (method === 'GET' && seg.length === 2) return admin.adminPlans() as T
    if (method === 'POST' && seg.length === 2) return admin.createPlan(body as PlanBody) as T
    if (method === 'PATCH') return admin.updatePlan(id, body as Partial<PlanBody>) as T
    if (method === 'DELETE') {
      admin.deletePlan(id)
      return undefined as T
    }
  }

  if (area === 'upsell-rules') {
    if (method === 'GET' && seg.length === 2) return admin.adminUpsellRules() as T
    if (method === 'POST' && seg.length === 2) return admin.createUpsellRule(body as UpsellRuleBody) as T
    if (method === 'PATCH') return admin.updateUpsellRule(id, body as Partial<UpsellRuleBody>) as T
    if (method === 'DELETE') {
      admin.deleteUpsellRule(id)
      return undefined as T
    }
  }

  throw new ApiError(404, `No mock for ${method} /${seg.join('/')}`)
}

import { getActor } from '../actor'
import { ApiError } from '../client'
import type {
  AcceptAllocationBody, AddLineBody, CreateQuotationBody, DecideBody,
  CancelSubscriptionBody, ChangeSubscriptionBody, RecordPaymentBody, ReplyBody,
  StockReceiptBody, UpdateLineBody, UpdatePolicyBody, UpdateQuotationBody,
} from '../types'
import { customers, priceLists, productDetail, products } from './data'
import { readPolicy, writePolicy } from './policy'
import { WAREHOUSES } from './allocation'
import {
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
]

export function isMocked(_method: string, path: string): boolean {
  const clean = path.split('?')[0]
  return MOCKED.some((r) => r.test(clean))
}

/** Enough latency for loading states and the 250ms debounce to behave realistically. */
const latency = () => new Promise((r) => setTimeout(r, 140))

export async function mockFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  await latency()
  const p = path.split('?')[0]
  const seg = p.split('/').filter(Boolean)

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
    seg[0] === 'portal' ? portalRoutes<T>(method, seg, body)
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

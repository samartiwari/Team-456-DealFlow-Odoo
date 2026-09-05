import { getActor } from '../session'
import { ApiError } from '../client'
import type {
  AlertMetrics, AlertSeverity, AlertType, DealHealthAlert, DealHealthBoard,
  NudgeResult, ReportQuery, ReportResult, ReportRow,
} from '../types'
import { ACTOR_NAMES } from './data'
import {
  acked, ackAlertKey, approvals, audit, find, persist, plansAccepted, quotations, view,
} from './store'

/**
 * B9 — the deal-health detectors, and A7's report.
 *
 * Each detector is a query over live state rather than a heuristic buried in a
 * service, so the card can name the numbers that produced it. "Why was this
 * flagged?" is the question the screen exists to answer.
 */

const DAY = 86_400_000

/** How long a quotation may sit untouched, by stage. */
const STALLED_DAYS: Partial<Record<string, number>> = {
  // A quote waiting on a colleague is a different kind of stuck from one
  // waiting on a customer, so the threshold is not a single timeout.
  DRAFT: 5,
  SENT: 5,
  RETURNED: 5,
  UNDER_NEGOTIATION: 5,
  PENDING_APPROVAL: 2,
}

const SEVERITY: Record<AlertType, AlertSeverity> = {
  SLIPPAGE: 'HIGH',
  DISCOUNT_ANOMALY: 'HIGH',
  STALLED: 'MEDIUM',
  // No single deal is wrong; the pattern is. A note, not an alarm.
  CEILING_HUGGER: 'LOW',
}

/** The last thing that happened, which is what "stalled" is measured from. */
function lastActivity(quotationId: number): number {
  const entries = audit[quotationId] ?? []
  if (entries.length === 0) return Date.now()
  return Math.max(...entries.map((e) => Date.parse(e.createdAt)))
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const daysAgo = (ms: number) => Math.floor((Date.now() - ms) / DAY)

interface Baseline {
  mean: number
  stdDev: number
  sampleSize: number
  usedTeamBaseline: boolean
}

/**
 * A rep's own discount record: mean and standard deviation of the order-level
 * discount over their last twenty confirmed quotes.
 *
 * Two guards, both visible on the card:
 *  - fewer than five confirmed quotes and the team's numbers are used instead,
 *    because a new rep is not an anomaly;
 *  - sigma is floored at 1.0, so a very consistent rep does not trip on a
 *    tenth of a point.
 */
function baselineFor(repId: number): Baseline {
  const confirmedBy = (predicate: (repId: number) => boolean) =>
    quotations
      .filter((q) => q.stage === 'CONFIRMED' && predicate(q.repId))
      .sort((a, b) => lastActivity(b.id) - lastActivity(a.id))
      .slice(0, 20)
      .map((q) => q.orderDiscountPct)

  const own = confirmedBy((id) => id === repId)
  const usedTeamBaseline = own.length < 5
  const sample = usedTeamBaseline ? confirmedBy(() => true) : own

  if (sample.length === 0) {
    return { mean: 0, stdDev: 1, sampleSize: 0, usedTeamBaseline }
  }

  const mean = sample.reduce((a, b) => a + b, 0) / sample.length
  const variance = sample.reduce((sum, v) => sum + (v - mean) ** 2, 0) / sample.length
  return {
    mean: round2(mean),
    stdDev: round2(Math.max(1, Math.sqrt(variance))),
    sampleSize: sample.length,
    usedTeamBaseline,
  }
}

/** Quotations still in play — a settled deal cannot need attention. */
const live = () =>
  quotations.filter((q) => q.stage !== 'CONFIRMED' && q.stage !== 'REJECTED')

interface Raw {
  quotationId: number
  type: AlertType
  explanation: string
  metrics: AlertMetrics | null
  openedAt: number
}

function detect(): Raw[] {
  const out: Raw[] = []

  /* SLIPPAGE — a promised date has passed and nothing shipped. */
  for (const [quotationId, plan] of Object.entries(plansAccepted())) {
    for (const b of plan.backorders) {
      if (Date.parse(`${b.promisedDate}T23:59:59Z`) >= Date.now()) continue
      out.push({
        quotationId: Number(quotationId),
        type: 'SLIPPAGE',
        explanation: `${b.quantity} x ${b.productName} was promised for ${b.promisedDate} and has not shipped.`,
        metrics: null,
        openedAt: Date.parse(`${b.promisedDate}T00:00:00Z`),
      })
    }
  }

  /* DISCOUNT_ANOMALY — measured against this rep, never a fixed number. */
  for (const q of live()) {
    const base = baselineFor(q.repId)
    if (base.sampleSize === 0) continue
    const threshold = base.mean + 2 * base.stdDev
    if (q.orderDiscountPct <= threshold) continue

    const sigmas = round2((q.orderDiscountPct - base.mean) / base.stdDev)
    const who = base.usedTeamBaseline ? 'the team' : ACTOR_NAMES[q.repId] ?? 'this rep'
    out.push({
      quotationId: q.id,
      type: 'DISCOUNT_ANOMALY',
      explanation:
        `${q.orderDiscountPct}% is ${sigmas} standard deviations above ${who}'s mean of ` +
        `${base.mean}% across their last ${base.sampleSize} confirmed quotes.`,
      metrics: { discountPct: q.orderDiscountPct, ...base },
      openedAt: lastActivity(q.id),
    })
  }

  /* STALLED — stage-aware, because the two kinds of stuck are different. */
  for (const q of live()) {
    const limit = STALLED_DAYS[q.stage]
    if (limit === undefined) continue
    const idle = daysAgo(lastActivity(q.id))
    if (idle < limit) continue
    out.push({
      quotationId: q.id,
      type: 'STALLED',
      explanation:
        `Nothing has happened for ${idle} days. A quotation ${q.stage === 'PENDING_APPROVAL'
          ? 'waiting on a colleague is given 2 days'
          : `at this stage is given ${limit} days`}.`,
      metrics: null,
      openedAt: lastActivity(q.id),
    })
  }

  /* CEILING_HUGGER — a rep who systematically maximises discretion. */
  const repIds = [...new Set(quotations.map((q) => q.repId))]
  for (const repId of repIds) {
    const recent = quotations
      .filter((q) => q.stage === 'CONFIRMED' && q.repId === repId)
      .sort((a, b) => lastActivity(b.id) - lastActivity(a.id))
      .slice(0, 20)
    if (recent.length < 20) continue

    const hugging = recent.filter((q) => {
      const v = view(q)
      const ceiling = Math.min(...v.lines.map((l) => l.allowedDiscountPct))
      return Number.isFinite(ceiling) && ceiling - q.orderDiscountPct <= 1
    })
    const share = Math.round((hugging.length / recent.length) * 100)
    if (share <= 70) continue

    // Attached to their most recent quote so it has somewhere to point.
    const latest = recent[0]
    const base = baselineFor(repId)
    out.push({
      quotationId: latest.id,
      type: 'CEILING_HUGGER',
      explanation:
        `${share}% of ${ACTOR_NAMES[repId] ?? 'this rep'}'s last ${recent.length} quotes sit within ` +
        `1 point of the ceiling. No single deal is over, but the pattern is.`,
      metrics: { discountPct: latest.orderDiscountPct, ...base },
      openedAt: lastActivity(latest.id),
    })
  }

  return out
}

/**
 * Alert ids are stable across refreshes.
 *
 * The real table has a unique partial index on (quotation_id, type) where the
 * alert is unresolved, so a stalled deal raises one alert rather than one per
 * page load. Deriving the id from that same pair reproduces it: safe as a React
 * key, and an alert that disappears means the condition cleared.
 */
const idFor = (quotationId: number, type: AlertType) =>
  quotationId * 10 + (['STALLED', 'DISCOUNT_ANOMALY', 'CEILING_HUGGER', 'SLIPPAGE'] as AlertType[]).indexOf(type)

/**
 * Managers and finance, not reps.
 *
 * Phase 3's nav table gives finance both of these screens, and a nav item that
 * could only ever answer 403 is worse than one that is absent — so the guard
 * matches the navigation rather than the other way round.
 */
function assertManager(): void {
  const actor = getActor()
  if (actor.role !== 'MANAGER' && actor.role !== 'FINANCE') {
    throw new ApiError(
      403,
      `${actor.name} is a ${actor.role.toLowerCase()}. Deal health and reporting are for managers and finance.`,
    )
  }
}

export function dealHealth(): DealHealthBoard {
  assertManager()

  const alerts: DealHealthAlert[] = detect().map((r) => {
    const q = find(r.quotationId)
    const v = view(q)
    const id = idFor(r.quotationId, r.type)
    return {
      id,
      quotationId: r.quotationId,
      ref: v.ref,
      customerName: v.customerName,
      repName: ACTOR_NAMES[q.repId] ?? 'Unknown',
      type: r.type,
      severity: SEVERITY[r.type],
      explanation: r.explanation,
      openedAt: new Date(r.openedAt).toISOString(),
      ackedAt: acked[ackAlertKey(id)] ?? null,
      // A resolved alert is simply not detected, so nothing returned here is one.
      resolvedAt: null,
      metrics: r.metrics,
    }
  })

  const rank: Record<AlertSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || Date.parse(a.openedAt) - Date.parse(b.openedAt))

  return {
    alerts,
    counts: {
      high: alerts.filter((a) => a.severity === 'HIGH').length,
      medium: alerts.filter((a) => a.severity === 'MEDIUM').length,
      low: alerts.filter((a) => a.severity === 'LOW').length,
      total: alerts.length,
    },
    evaluatedAt: new Date().toISOString(),
  }
}

function alertById(id: number): DealHealthAlert {
  const found = dealHealth().alerts.find((a) => a.id === id)
  if (!found) throw new ApiError(404, `Alert ${id} not found.`)
  return found
}

export function ackAlertById(id: number): DealHealthBoard {
  assertManager()
  alertById(id)
  acked[ackAlertKey(id)] = new Date().toISOString()
  persist()
  return dealHealth()
}

/** Drafts a follow-up. Nothing is sent — there is no mail server. */
export function nudge(id: number): NudgeResult {
  assertManager()
  const alert = alertById(id)
  const draft =
    `Hello ${alert.customerName},\n\n` +
    `I wanted to check in on ${alert.ref}. ` +
    (alert.type === 'STALLED'
      ? 'It has been a little while since we last spoke, and I want to make sure nothing is blocking you.'
      : alert.type === 'SLIPPAGE'
        ? 'Part of your order has not shipped on the date we promised, and I am chasing it.'
        : 'I am reviewing the terms and will come back to you shortly.') +
    `\n\nBest regards,\n${alert.repName}`

  acked[ackAlertKey(id)] = new Date().toISOString()
  persist()
  return { draft, board: dealHealth() }
}

/**
 * Appends a Finance step to the quotation's approval chain.
 *
 * A real state change, audited like any other decision: after this the
 * quotation needs a signature it did not need before.
 */
export function escalate(id: number): DealHealthBoard {
  assertManager()
  const alert = alertById(id)
  const approval = approvals.find((a) => a.quotationId === alert.quotationId && a.state === 'OPEN')
  if (!approval) {
    throw new ApiError(409, `${alert.ref} has no open approval to escalate.`)
  }
  if (approval.steps.some((s) => s.role === 'FINANCE')) {
    throw new ApiError(409, `${alert.ref} already requires finance.`)
  }

  approval.steps.push({
    id: approval.steps.length + 1,
    order: approval.steps.length + 1,
    role: 'FINANCE',
    // Blocked behind whatever is still open, so the chain stays sequential.
    state: approval.steps.some((s) => s.state === 'PENDING') ? 'BLOCKED' : 'PENDING',
    decidedByName: null,
    reason: null,
    decidedAt: null,
  })

  const q = find(alert.quotationId)
  recordEscalation(q.id, alert.repName)
  persist()
  return dealHealth()
}

/* Kept separate so the import surface from store stays small. */
function recordEscalation(quotationId: number, repName: string): void {
  const list = audit[quotationId] ?? (audit[quotationId] = [])
  list.push({
    id: Date.now(),
    action: 'ESCALATED_TO_FINANCE',
    fromState: null,
    toState: null,
    actorName: ACTOR_NAMES[getActor().id] ?? null,
    reason: `escalated from the deal health dashboard (${repName}'s deal)`,
    createdAt: new Date().toISOString(),
  })
}

/* ------------------------------------------------- reporting (A7) */

/**
 * One query with four optional predicates, combining with AND.
 *
 * The export takes this same object, which is what stops a PDF disagreeing
 * with the screen it was printed from.
 */
export function report(q: ReportQuery): ReportResult {
  assertManager()

  if (q.from && q.to && q.from > q.to) {
    throw new ApiError(422, 'The start of the range falls after its end.', 'from')
  }

  const rows: ReportRow[] = quotations
    .filter((row) => {
      if (q.repId !== undefined && row.repId !== q.repId) return false
      if (q.status && row.stage !== q.status) return false
      const created = new Date(lastActivity(row.id)).toISOString().slice(0, 10)
      if (q.from && created < q.from) return false
      if (q.to && created > q.to) return false
      if (q.categoryId !== undefined) {
        const name = CATEGORY_NAME[q.categoryId]
        if (!name || !row.lines.some((l) => l.category === name)) return false
      }
      return true
    })
    .map((row) => {
      const v = view(row)
      return {
        quotationId: row.id,
        ref: v.ref,
        customerName: v.customerName,
        repName: ACTOR_NAMES[row.repId] ?? 'Unknown',
        stage: v.stage,
        orderDiscountPct: v.orderDiscountPct,
        subtotal: v.subtotal,
        marginPct: v.marginPct,
        riskScore: v.riskScore,
        createdAt: new Date(lastActivity(row.id)).toISOString(),
      }
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

  const revenue = rows.reduce((sum, r) => sum + r.subtotal, 0)
  const avg = (pick: (r: ReportRow) => number) =>
    rows.length === 0 ? 0 : round2(rows.reduce((sum, r) => sum + pick(r), 0) / rows.length)

  return {
    rows,
    totals: {
      count: rows.length,
      revenue: round2(revenue),
      averageDiscountPct: avg((r) => r.orderDiscountPct),
      averageMarginPct: avg((r) => r.marginPct),
    },
    query: q,
  }
}

const CATEGORY_NAME: Record<number, string> = {
  1: 'Hardware',
  2: 'Services',
  3: 'Subscriptions',
}

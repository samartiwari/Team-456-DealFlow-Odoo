import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  confirmQuotation, getQuotation, postCounter, postMessage,
} from './client'
import { PortalError } from './types'
import type { PortalQuotation, PortalStatus } from './types'

/**
 * B8 — the customer's screen.
 *
 * Written for someone outside the company: no risk score, no margin, no
 * "PENDING_APPROVAL". They will never receive those figures, and they should
 * not have to read our vocabulary either.
 */

const STATUS: Record<PortalStatus, { label: string; blurb: string; tone: string }> = {
  SENT: {
    label: 'Awaiting your response',
    blurb: 'Review the quotation below. You can ask a question, propose a different discount, or accept it.',
    tone: 'border-sky-200 bg-sky-50 text-sky-900',
  },
  UNDER_NEGOTIATION: {
    label: 'Your request is noted',
    blurb: 'We have your proposal. You can still adjust it, or accept these terms.',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  PENDING_APPROVAL: {
    label: 'With the sales team for review',
    blurb: 'Your proposal needs sign-off before it can be accepted. We will come back to you shortly.',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  CONFIRMED: {
    label: 'Confirmed',
    blurb: 'Thank you. These terms are agreed and your order is being prepared.',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  },
}

const fmt = (value: number, currency: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

export function Negotiation() {
  const qc = useQueryClient()
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [lineId, setLineId] = useState<number | ''>('')
  const [discount, setDiscount] = useState('')
  const [counterNote, setCounterNote] = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['portal-quotation'],
    queryFn: getQuotation,
    retry: false,
  })

  /** Every action answers with the whole quotation, so one call repaints. */
  const apply = (next: PortalQuotation) => {
    qc.setQueryData(['portal-quotation'], next)
    setProblem(null)
  }
  const fail = (e: unknown) =>
    setProblem(e instanceof PortalError ? e.message : 'Something went wrong. Please try again.')

  const ask = useMutation({
    mutationFn: () => postMessage({ body: note, lineId: lineId === '' ? undefined : lineId }),
    onSuccess: (next) => { apply(next); setNote(''); setLineId('') },
    onError: fail,
  })

  const counter = useMutation({
    mutationFn: () => postCounter({ discountPct: Number(discount), note: counterNote || undefined }),
    onSuccess: (next) => { apply(next); setDiscount(''); setCounterNote('') },
    onError: fail,
  })

  const accept = useMutation({
    mutationFn: () => confirmQuotation(),
    onSuccess: apply,
    onError: fail,
  })

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-slate-500">Loading your quotation…</p>
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6">
        <h2 className="text-base font-semibold text-rose-900">We could not open this quotation</h2>
        <p className="mt-1 text-sm text-rose-800">
          {error instanceof PortalError ? error.message : 'Please ask your account manager for a new link.'}
        </p>
      </div>
    )
  }

  const status = STATUS[data.status]
  const busy = ask.isPending || counter.isPending || accept.isPending
  const discountValue = Number(discount)
  const canSendCounter =
    data.canCounter && discount.trim() !== '' &&
    Number.isFinite(discountValue) && discountValue >= 0 && discountValue <= 100

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Quotation {data.publicRef}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{data.customerName}</h1>
      </header>

      <div className={`rounded-lg border p-4 ${status.tone}`}>
        <p className="text-sm font-semibold">{status.label}</p>
        <p className="mt-0.5 text-sm">{status.blurb}</p>
      </div>

      {problem && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm text-rose-900">{problem}</p>
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium text-slate-600">Item</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Qty</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Unit price</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Discount</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="block font-medium text-slate-900">{l.productName}</span>
                    <span className="block text-xs text-slate-500">{l.category}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{l.quantity}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {fmt(l.unitPrice, data.currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {l.discountPct > 0 ? `${l.discountPct}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-900">
                    {fmt(l.netTotal, data.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-baseline justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-sm font-semibold text-slate-900">
            Total{data.orderDiscountPct > 0 && (
              <span className="ml-2 font-normal text-slate-500">
                includes {data.orderDiscountPct}% off
              </span>
            )}
          </span>
          <span className="text-lg font-bold tabular-nums text-slate-900">
            {fmt(data.grandTotal, data.currency)}
          </span>
        </div>
      </section>

      {data.counter && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">
            Your proposal: {data.counter.discountPct}% off
          </p>
          {data.counter.note && <p className="mt-1 text-sm text-slate-600">{data.counter.note}</p>}
          <p className="mt-1 text-xs text-slate-500">
            Sent {when(data.counter.proposedAt)}
            {data.counter.state === 'ACCEPTED' && ' · accepted'}
          </p>
        </div>
      )}

      {data.canCounter && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Propose a different discount</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Discount %</span>
              <input
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value.replace(/[^0-9.]/g, ''))}
                className="h-10 w-28 rounded-md border border-slate-300 px-3 text-right tabular-nums"
              />
            </label>
            <label className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Anything we should know?</span>
              <input
                value={counterNote}
                onChange={(e) => setCounterNote(e.target.value)}
                placeholder="Optional"
                className="h-10 rounded-md border border-slate-300 px-3"
              />
            </label>
            <button
              type="button"
              disabled={!canSendCounter || busy}
              onClick={() => counter.mutate()}
              className="h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              {counter.isPending ? 'Sending…' : 'Submit request'}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Questions and comments</h2>

        {data.messages.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Nothing yet. Ask about any line and we will reply here.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {data.messages.map((m) => {
              const line = data.lines.find((l) => l.id === m.lineId)
              return (
                <li
                  key={m.id}
                  className={`rounded-md border p-3 ${
                    m.author === 'CUSTOMER'
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-sky-200 bg-sky-50'
                  }`}
                >
                  <p className="text-xs font-medium text-slate-600">
                    {m.authorName}
                    {line && <span className="text-slate-500"> · about {line.productName}</span>}
                    <span className="text-slate-400"> · {when(m.createdAt)}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-900">{m.body}</p>
                </li>
              )
            })}
          </ul>
        )}

        {data.canCounter && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">About</span>
              <select
                value={lineId}
                onChange={(e) => setLineId(e.target.value === '' ? '' : Number(e.target.value))}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">The order as a whole</option>
                {data.lines.map((l) => (
                  <option key={l.id} value={l.id}>{l.productName}</option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[220px] flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Your message</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-10 rounded-md border border-slate-300 px-3"
              />
            </label>
            <button
              type="button"
              disabled={note.trim() === '' || busy}
              onClick={() => ask.mutate()}
              className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-900 disabled:opacity-40"
            >
              {ask.isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
        )}
      </section>

      {data.canConfirm && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            Happy with these terms? Confirming accepts the quotation as shown above.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => accept.mutate()}
            className="h-10 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {accept.isPending ? 'Confirming…' : 'Confirm quotation'}
          </button>
        </div>
      )}
    </div>
  )
}

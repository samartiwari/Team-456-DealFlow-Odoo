import { useState } from 'react'
import type { QuotationLine } from '@/shared/api/types'
import { useDebouncedCallback } from '@/shared/hooks/useDebouncedCallback'
import { amount, percent } from '@/shared/lib/format'
import { isCommittablePercent, sanitisePercent } from '@/shared/lib/numericInput'
import {
  EmptyState, Input, LineChip, QtyStepper, TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'

interface RowProps {
  line: QuotationLine
  /** Frozen because of the quotation's stage — inputs go read-only. */
  locked: boolean
  /** A write is in flight. Buttons wait; text inputs deliberately do not. */
  busy: boolean
  onQty: (lineId: number, quantity: number) => void
  onDiscount: (lineId: number, discountPct: number) => void
  onRemove: (lineId: number) => void
}

function CartRow({ line, locked, busy, onQty, onDiscount, onRemove }: RowProps) {
  // The input holds a local string so typing feels instant. Every number shown
  // in the row still comes from the server response.
  const [draft, setDraft] = useState(String(line.discountPct))
  const [seen, setSeen] = useState(line.discountPct)
  // Adjust during render rather than in an effect: the server is the source of
  // truth, so when it reports a different discount the draft follows it.
  if (seen !== line.discountPct) {
    setSeen(line.discountPct)
    setDraft(String(line.discountPct))
  }

  const push = useDebouncedCallback((value: number) => onDiscount(line.id, value), 250)
  const pushQty = useDebouncedCallback((value: number) => onQty(line.id, value), 250)
  const pushedDown = line.effectiveDiscountPct !== line.discountPct

  return (
    <TR hover>
      <TD>
        <span className="block text-[13px] font-medium text-ink">{line.productName}</span>
        <span className="block text-[12px] text-muted">{line.category}</span>
      </TD>

      <TD>
        <QtyStepper value={line.quantity} locked={locked} busy={busy} onChange={pushQty} />
      </TD>

      <TD numeric>{amount(line.unitPrice)}</TD>

      <TD>
        <div className="flex flex-col items-end gap-0.5">
          <Input
            align="right"
            inputMode="decimal"
            aria-label={`Discount for ${line.productName}`}
            className="h-9 w-[72px]"
            value={draft}
            /* Read-only, never disabled: a disabled element loses focus, so the
               caret vanished on every debounced save and the rep had to click
               back in mid-number. Read-only keeps focus and still blocks edits. */
            readOnly={locked}
            onChange={(e) => {
              const next = sanitisePercent(e.target.value)
              setDraft(next)
              const n = Number(next)
              if (isCommittablePercent(next, n)) push(n)
            }}
            onBlur={() => setDraft(String(line.discountPct))}
          />
          {/* Only shown once the order-level discount has been pushed down. */}
          {pushedDown && (
            <span className="text-[11px] font-medium text-warning-tx tnum">
              → {percent(line.effectiveDiscountPct)} effective
            </span>
          )}
        </div>
      </TD>

      <TD numeric className="text-muted">{percent(line.allowedDiscountPct)}</TD>

      <TD>
        <LineChip overagePts={line.overagePts} />
      </TD>

      <TD numeric className="font-medium text-ink">{amount(line.netTotal)}</TD>

      <TD className="w-px">
        <button
          type="button"
          aria-label={`Remove ${line.productName}`}
          disabled={locked || busy}
          onClick={() => onRemove(line.id)}
          title={`Remove ${line.productName}`}
          className="grid h-7 w-7 place-items-center rounded-control text-muted hover:bg-hover hover:text-danger-tx disabled:pointer-events-none disabled:opacity-50"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M3 4h10M6.5 4V2.8h3V4M5 4l.6 8.4a.8.8 0 0 0 .8.75h3.2a.8.8 0 0 0 .8-.75L11 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </TD>
    </TR>
  )
}

export function CartTable({
  lines,
  locked,
  busy,
  onQty,
  onDiscount,
  onRemove,
}: {
  lines: QuotationLine[]
  locked: boolean
  busy: boolean
  onQty: (lineId: number, quantity: number) => void
  onDiscount: (lineId: number, discountPct: number) => void
  onRemove: (lineId: number) => void
}) {
  if (lines.length === 0) {
    return (
      <EmptyState
        title="No lines yet"
        description="Pick a product on the left to start building this quotation."
      />
    )
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Product</TH>
          <TH>Qty</TH>
          <TH numeric>Unit price</TH>
          <TH numeric>Discount</TH>
          <TH numeric>Allowed</TH>
          <TH>Status</TH>
          <TH numeric>Net</TH>
          <TH aria-label="Actions" />
        </TR>
      </THead>
      <TBody>
        {lines.map((line) => (
          <CartRow
            key={line.id}
            line={line}
            locked={locked}
            busy={busy}
            onQty={onQty}
            onDiscount={onDiscount}
            onRemove={onRemove}
          />
        ))}
      </TBody>
    </Table>
  )
}

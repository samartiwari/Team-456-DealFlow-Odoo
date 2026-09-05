import { useState } from 'react'
import type { AllocationPlan, Warehouse } from '@/shared/api/types'
import { orderedFrom, type DraftAllocation } from './overrideModel'
import { isCommittableInteger, sanitiseInteger } from '@/shared/lib/numericInput'
import { Button, Select, TBody, TD, TH, THead, TR, Table } from '@/shared/ui'

/**
 * Holds its own draft so the box can be cleared on the way to a new number.
 * Writing 0 back on an empty field would show "0" and then produce "04" when
 * the next digit lands.
 */
function QuantityCell({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (next: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setDraft(String(value))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      className="h-9 w-20 rounded-control border border-default bg-card px-2 text-right text-[13px] text-ink tnum focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      value={draft}
      onChange={(e) => {
        const next = sanitiseInteger(e.target.value)
        setDraft(next)
        const n = Number(next)
        if (isCommittableInteger(next, n, 0, 99999)) onChange(n)
      }}
      onBlur={() => setDraft(String(value))}
    />
  )
}

export function OverrideEditor({
  plan,
  warehouses,
  rows,
  setRows,
  busy,
  onSave,
  onCancel,
}: {
  plan: AllocationPlan
  warehouses: Warehouse[]
  rows: DraftAllocation[]
  setRows: (next: DraftAllocation[]) => void
  busy: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const ordered = orderedFrom(plan)

  const allocated = (productId: number) =>
    rows.filter((r) => r.productId === productId).reduce((s, r) => s + r.quantity, 0)

  /* The server is the authority; this only stops an obviously wrong submit. */
  const balanced = [...ordered].every(([pid, r]) => allocated(pid) === r.qty)

  const update = (i: number, patch: Partial<DraftAllocation>) =>
    setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)))

  /**
   * Appends a usable row in one click rather than making the user pick from a
   * dropdown first. A select that only reacts to onChange cannot add anything
   * when the order has a single product — choosing the option already shown
   * fires no change event.
   *
   * Defaults aim at what the user is most likely after: the product still short
   * of its ordered quantity, drawn from a warehouse not already supplying it.
   */
  const addRow = () => {
    const short = [...ordered].find(([pid, r]) => allocated(pid) < r.qty) ?? [...ordered][0]
    if (!short) return
    const [productId, { name, qty }] = short

    const used = new Set(rows.filter((r) => r.productId === productId).map((r) => r.warehouseId))
    const warehouse = warehouses.find((w) => !used.has(w.id)) ?? warehouses[0]

    setRows([
      ...rows,
      {
        productId,
        productName: name,
        warehouseId: warehouse.id,
        quantity: Math.max(1, qty - allocated(productId)),
      },
    ])
  }

  return (
    <div className="flex flex-col">
      <Table>
        <THead>
          <TR>
            <TH>Product</TH>
            <TH>Ships from</TH>
            <TH numeric>Quantity</TH>
            <TH aria-label="Actions" />
          </TR>
        </THead>
        <TBody>
          {rows.map((r, i) => (
            <TR key={`${r.productId}-${r.warehouseId}-${i}`}>
              <TD className="font-medium text-ink">{r.productName}</TD>
              <TD>
                <Select
                  aria-label={`Warehouse for ${r.productName} row ${i + 1}`}
                  className="h-9 w-44"
                  value={r.warehouseId}
                  disabled={busy}
                  onChange={(e) => update(i, { warehouseId: Number(e.target.value) })}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </Select>
              </TD>
              <TD numeric>
                <QuantityCell
                  label={`Quantity for ${r.productName} row ${i + 1}`}
                  value={r.quantity}
                  onChange={(n) => update(i, { quantity: n })}
                />
              </TD>
              <TD className="w-px">
                <button
                  type="button"
                  aria-label={`Remove row ${i + 1}`}
                  disabled={busy}
                  onClick={() => setRows(rows.filter((_, n) => n !== i))}
                  className="rounded-control px-2 py-1 text-[12px] font-medium text-muted hover:bg-hover hover:text-danger-tx disabled:pointer-events-none disabled:opacity-50"
                >
                  Remove
                </button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="flex flex-col gap-3 border-t border-default p-4">
        {/* Per-product tally: how much of the order each product still needs. */}
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {[...ordered].map(([pid, r]) => {
            const got = allocated(pid)
            const ok = got === r.qty
            return (
              <li key={pid} className="text-[12px]">
                <span className="text-muted">{r.name}: </span>
                <span className={ok ? 'font-medium text-success-tx tnum' : 'font-medium text-warning-tx tnum'}>
                  {got} of {r.qty}
                </span>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={addRow}>
            Add a warehouse row
          </Button>
          <div className="ml-auto flex gap-2">
            <Button disabled={busy} onClick={onCancel}>Cancel</Button>
            <Button variant="primary" disabled={busy || !balanced} onClick={onSave}>
              {busy ? 'Saving…' : 'Save override'}
            </Button>
          </div>
        </div>

        {!balanced && (
          <p className="text-[12px] text-warning-tx">
            Allocated quantity must equal the ordered quantity before this can be saved.
          </p>
        )}
      </div>
    </div>
  )
}

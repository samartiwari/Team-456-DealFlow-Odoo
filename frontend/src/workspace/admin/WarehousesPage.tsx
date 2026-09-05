import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  adminArchiveWarehouse, adminCreateWarehouse, adminListWarehouses, adminRestoreWarehouse,
  adminUpdateWarehouse,
} from '@/shared/api/endpoints'
import type { WarehouseBody } from '@/shared/api/types'
import {
  Badge, Button, Card, CardBody, EmptyState, ErrorState, Field, Input, Spinner,
  TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { useAdminErrors, useInvalidateEverything } from './useAdmin'

/**
 * A4 — the three fields the allocator already reads.
 *
 * Not a cosmetic screen: raise East Depot's weight and the allocator starts
 * preferring Main, visibly, on the very next quotation.
 */
export default function WarehousesPage() {
  const invalidate = useInvalidateEverything()
  const { problem, fail, clear, fieldError } = useAdminErrors()
  const [creating, setCreating] = useState(false)

  const houses = useQuery({ queryKey: ['admin-warehouses'], queryFn: adminListWarehouses })

  const done = () => { invalidate(); clear() }
  const create = useMutation({
    mutationFn: (b: WarehouseBody) => adminCreateWarehouse(b),
    onSuccess: () => { done(); setCreating(false) }, onError: fail,
  })
  const update = useMutation({
    mutationFn: (v: { id: number; body: Partial<WarehouseBody> }) => adminUpdateWarehouse(v.id, v.body),
    onSuccess: done, onError: fail,
  })
  const archive = useMutation({
    mutationFn: (id: number) => adminArchiveWarehouse(id), onSuccess: done, onError: fail,
  })
  const restore = useMutation({
    mutationFn: (id: number) => adminRestoreWarehouse(id), onSuccess: done, onError: fail,
  })

  if (houses.isLoading) return <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
  if (houses.isError || !houses.data) {
    return <ErrorState title="Could not load warehouses" description="Only a sales manager can open this." />
  }

  const busy = create.isPending || update.isPending || archive.isPending || restore.isPending

  return (
    <div className="flex flex-col gap-4">
      {problem && !problem.field && (
        <div role="alert" className="rounded-card border border-danger-br bg-danger-bg px-4 py-3">
          <p className="text-[13px] text-danger-tx">{problem.message}</p>
        </div>
      )}

      <div className="flex justify-end">
        {!creating && (
          <Button variant="primary" onClick={() => { setCreating(true); clear() }}>New warehouse</Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <NewWarehouseForm busy={create.isPending} fieldError={fieldError}
              onCancel={() => { setCreating(false); clear() }} onCreate={(b) => create.mutate(b)} />
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden">
        {houses.data.length === 0 ? (
          <EmptyState
            title="No warehouses"
            description="Without one there is nowhere to ship from, and no order can be allocated."
          />
        ) : (
        <Table>
          <THead>
            <TR>
              <TH>Warehouse</TH>
              <TH numeric>Shipment fee</TH>
              <TH numeric>Shipping weight</TH>
              <TH numeric>Replenishment</TH>
              <TH aria-label="Actions" />
            </TR>
          </THead>
          <TBody>
            {houses.data.map((w) => (
              <TR key={w.id} hover className={w.archived ? 'opacity-60' : undefined}>
                <TD>
                  <span className="text-[13px] font-medium text-ink">{w.name}</span>
                  {w.archived && <Badge tone="neutral">Archived</Badge>}
                </TD>
                <TD numeric>
                  <Num label={`${w.name} shipment fee`} value={w.shipmentFee} busy={busy}
                    onCommit={(n) => update.mutate({ id: w.id, body: { shipmentFee: n } })} />
                </TD>
                <TD numeric>
                  <Num label={`${w.name} shipping weight`} value={w.shippingWeight} busy={busy}
                    onCommit={(n) => update.mutate({ id: w.id, body: { shippingWeight: n } })} />
                </TD>
                <TD numeric>
                  <Num label={`${w.name} replenishment days`} value={w.replenishmentDays} busy={busy}
                    suffix="days"
                    onCommit={(n) => update.mutate({ id: w.id, body: { replenishmentDays: n } })} />
                </TD>
                <TD className="w-px">
                  {w.archived ? (
                    <Button size="sm" disabled={busy} onClick={() => restore.mutate(w.id)}>
                      Reopen
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={() => archive.mutate(w.id)}>Archive</Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        )}
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-1.5">
          <p className="text-[13px] text-ink-2">All three feed the allocation engine directly.</p>
          <p className="text-[12px] text-muted">
            <b>Shipment fee</b> is charged once per warehouse in a split — it is why two
            shipments cost more than one. <b>Shipping weight</b> is the multiplier that picks
            the cheaper split; Main is 1.0 and East Depot 1.4, so raising East&rsquo;s weight
            makes the next order prefer Main. <b>Replenishment</b> is the lead time behind
            every promised backorder date.
          </p>
          <p className="text-[12px] text-muted">
            A warehouse still holding stock, or with allocations that have not shipped, cannot
            be archived. Archiving is not deleting: the row stays, everything that already
            shipped from it still resolves, and reopening puts it back among the allocator&rsquo;s
            candidates straight away.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

/** Edits in place and commits on blur; a whole form for one number is heavy. */
function Num({
  label, value, busy, suffix, onCommit,
}: {
  label: string
  value: number
  busy: boolean
  suffix?: string
  onCommit: (n: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setDraft(String(value)) }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        inputMode="decimal"
        aria-label={label}
        disabled={busy}
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
        onBlur={() => {
          const n = Number(draft)
          if (draft.trim() !== '' && Number.isFinite(n) && n !== value) onCommit(n)
          else setDraft(String(value))
        }}
        className="h-9 w-24 rounded-control border border-default bg-card px-2 text-right text-[13px] text-ink tnum focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {suffix && <span className="text-[12px] text-muted">{suffix}</span>}
    </span>
  )
}

function NewWarehouseForm({
  busy, fieldError, onCancel, onCreate,
}: {
  busy: boolean
  fieldError: (f: string) => string | null
  onCancel: () => void
  onCreate: (b: WarehouseBody) => void
}) {
  const [name, setName] = useState('')
  const [fee, setFee] = useState('500')
  const [weight, setWeight] = useState('1.0')
  const [days, setDays] = useState('5')
  const ready = name.trim() !== '' && fee !== '' && weight !== '' && days !== ''

  return (
    <>
      <Field label="Name" htmlFor="nw-name" className="min-w-[200px] flex-1" error={fieldError('name')}>
        <Input id="nw-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Shipment fee" htmlFor="nw-fee" className="w-[130px]" error={fieldError('shipmentFee')}>
        <Input id="nw-fee" align="right" inputMode="decimal" value={fee}
          onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ''))} />
      </Field>
      <Field label="Weight" htmlFor="nw-weight" className="w-[110px]" error={fieldError('shippingWeight')}>
        <Input id="nw-weight" align="right" inputMode="decimal" value={weight}
          onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ''))} />
      </Field>
      <Field label="Replenishment" htmlFor="nw-days" className="w-[130px]"
        error={fieldError('replenishmentDays')}>
        <Input id="nw-days" align="right" inputMode="numeric" value={days}
          onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ''))} />
      </Field>
      <Button variant="primary" disabled={!ready || busy}
        onClick={() => onCreate({
          name: name.trim(), shipmentFee: Number(fee),
          shippingWeight: Number(weight), replenishmentDays: Number(days),
        })}>
        {busy ? 'Creating…' : 'Create'}
      </Button>
      <Button disabled={busy} onClick={onCancel}>Cancel</Button>
    </>
  )
}

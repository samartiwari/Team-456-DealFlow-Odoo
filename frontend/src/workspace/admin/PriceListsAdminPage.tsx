import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  adminArchivePriceList, adminCreatePriceList, adminListPriceLists, adminListProducts,
  adminRestorePriceList,
  adminRemovePrice, adminSetPrice, adminUpdatePriceList,
} from '@/shared/api/endpoints'
import type { AdminPriceList, PriceListBody } from '@/shared/api/types'
import { money } from '@/shared/lib/format'
import {
  Badge, Button, Card, CardBody, CardHeader, CardTitle, ErrorState, Field, Input,
  Select, Spinner, TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { useAdminErrors, useInvalidateEverything } from './useAdmin'

const TIERS = [
  { id: 1, name: 'Bronze' },
  { id: 2, name: 'Silver' },
  { id: 3, name: 'Gold' },
]

export default function PriceListsAdminPage() {
  const invalidate = useInvalidateEverything()
  const { problem, fail, clear, fieldError } = useAdminErrors()
  const [creating, setCreating] = useState(false)

  const lists = useQuery({ queryKey: ['admin-price-lists'], queryFn: adminListPriceLists })
  const products = useQuery({ queryKey: ['admin-products'], queryFn: adminListProducts })

  const done = () => { invalidate(); clear() }
  const create = useMutation({
    mutationFn: (b: PriceListBody) => adminCreatePriceList(b),
    onSuccess: () => { done(); setCreating(false) }, onError: fail,
  })
  const update = useMutation({
    mutationFn: (v: { id: number; body: Partial<PriceListBody> }) => adminUpdatePriceList(v.id, v.body),
    onSuccess: done, onError: fail,
  })
  const archive = useMutation({
    mutationFn: (id: number) => adminArchivePriceList(id), onSuccess: done, onError: fail,
  })
  const restore = useMutation({
    mutationFn: (id: number) => adminRestorePriceList(id), onSuccess: done, onError: fail,
  })
  const setPrice = useMutation({
    mutationFn: (v: { listId: number; productId: number; unitPrice: number }) =>
      adminSetPrice(v.listId, v.productId, v.unitPrice),
    onSuccess: done, onError: fail,
  })
  const removePrice = useMutation({
    mutationFn: (v: { listId: number; productId: number }) => adminRemovePrice(v.listId, v.productId),
    onSuccess: done, onError: fail,
  })

  if (lists.isLoading) return <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
  if (lists.isError || !lists.data) {
    return <ErrorState title="Could not load price lists" description="Only a sales manager can open this." />
  }

  const busy = restore.isPending || create.isPending || update.isPending || archive.isPending
    || setPrice.isPending || removePrice.isPending

  return (
    <div className="flex flex-col gap-4">
      {/* A 409 here is a sentence someone wrote — "Standard is already the
          active list for BRONZE" — so it is shown as one. */}
      {problem && !problem.field && (
        <div role="alert" className="rounded-card border border-danger-br bg-danger-bg px-4 py-3">
          <p className="text-[13px] text-danger-tx">{problem.message}</p>
        </div>
      )}

      <div className="flex justify-end">
        {!creating && (
          <Button variant="primary" onClick={() => { setCreating(true); clear() }}>New price list</Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <NewListForm busy={create.isPending} fieldError={fieldError}
              onCancel={() => { setCreating(false); clear() }}
              onCreate={(b) => create.mutate(b)} />
          </CardBody>
        </Card>
      )}

      {lists.data.length === 0 && (
        <Card><CardBody><p className="text-[13px] text-muted">No price lists yet.</p></CardBody></Card>
      )}

      {lists.data.map((list) => (
        <ListCard key={list.id} list={list} products={products.data ?? []} busy={busy}
          onToggleActive={() => update.mutate({ id: list.id, body: { active: !list.active } })}
          onArchive={() => archive.mutate(list.id)}
          onRestore={() => restore.mutate(list.id)}
          onSetPrice={(productId, unitPrice) => setPrice.mutate({ listId: list.id, productId, unitPrice })}
          onRemove={(productId) => removePrice.mutate({ listId: list.id, productId })} />
      ))}

      <p className="text-[12px] text-muted">
        At most one live list per tier — a second would make a price ambiguous. Gold sits on
        the base price on purpose: it is the keenest rate in the system. Archiving keeps the
        list, because past quotations were priced off it; restoring brings it back inactive,
        so it never takes a tier&rsquo;s slot back without being asked.
      </p>
    </div>
  )
}

function ListCard({
  list, products, busy, onToggleActive, onArchive, onRestore, onSetPrice, onRemove,
}: {
  list: AdminPriceList
  products: Array<{ id: number; name: string; unitPrice: number; archived: boolean }>
  busy: boolean
  onToggleActive: () => void
  onArchive: () => void
  onRestore: () => void
  onSetPrice: (productId: number, unitPrice: number) => void
  onRemove: (productId: number) => void
}) {
  const unlisted = products.filter((p) => !p.archived && !list.items.some((i) => i.productId === p.id))
  const [productId, setProductId] = useState<number | ''>('')
  const [price, setPrice] = useState('')

  return (
    <Card className={`overflow-hidden${list.archived ? ' opacity-60' : ''}`}>
      <CardHeader>
        <CardTitle>{list.name}</CardTitle>
        <div className="flex items-center gap-2">
          {list.tierName && <Badge tone="info">{list.tierName}</Badge>}
          {list.archived ? (
            <>
              <Badge tone="neutral">Archived</Badge>
              {/* Comes back inactive: this tier may have a different live list by now. */}
              <Button size="sm" disabled={busy} onClick={onRestore}>Restore</Button>
            </>
          ) : (
            <>
              <Badge tone={list.active ? 'success' : 'neutral'}>
                {list.active ? 'Active' : 'Inactive'}
              </Badge>
              <Button size="sm" disabled={busy} onClick={onToggleActive}>
                {list.active ? 'Deactivate' : 'Activate'}
              </Button>
              <Button size="sm" disabled={busy} onClick={onArchive}>Archive</Button>
            </>
          )}
        </div>
      </CardHeader>

      {list.items.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-muted">
            No prices set. Anything this list does not name falls through to the base price.
          </p>
        </CardBody>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Product</TH>
              <TH numeric>This tier pays</TH>
              <TH numeric>Base</TH>
              <TH numeric>Difference</TH>
              <TH aria-label="Actions" />
            </TR>
          </THead>
          <TBody>
            {list.items.map((i) => {
              const delta = i.unitPrice - i.basePrice
              const pct = i.basePrice === 0 ? 0 : Math.round((delta / i.basePrice) * 1000) / 10
              return (
                <TR key={i.productId} hover>
                  <TD className="font-medium text-ink">{i.productName}</TD>
                  <TD numeric className="font-semibold text-ink">{money(i.unitPrice)}</TD>
                  <TD numeric className="text-muted">{money(i.basePrice)}</TD>
                  <TD numeric className={delta > 0 ? 'font-medium text-warning-tx' : 'text-muted'}>
                    {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${pct}%`}
                  </TD>
                  <TD className="w-px">
                    <Button size="sm" disabled={busy} onClick={() => onRemove(i.productId)}>Remove</Button>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      )}

      <CardBody className="flex flex-wrap items-end gap-3 border-t border-default">
        <Field label="Add a product" htmlFor={`add-${list.id}`} className="min-w-[240px]">
          <Select id={`add-${list.id}`} value={productId}
            onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Choose one</option>
            {unlisted.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — base {p.unitPrice}</option>
            ))}
          </Select>
        </Field>
        <Field label="This tier pays" htmlFor={`price-${list.id}`} className="w-[150px]">
          <Input id={`price-${list.id}`} align="right" inputMode="decimal" value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} />
        </Field>
        <Button disabled={busy || productId === '' || price === ''}
          onClick={() => {
            if (productId !== '') onSetPrice(productId, Number(price))
            setProductId(''); setPrice('')
          }}>
          Set price
        </Button>
      </CardBody>
    </Card>
  )
}

function NewListForm({
  busy, fieldError, onCancel, onCreate,
}: {
  busy: boolean
  fieldError: (f: string) => string | null
  onCancel: () => void
  onCreate: (b: PriceListBody) => void
}) {
  const [name, setName] = useState('')
  const [tierId, setTierId] = useState<number | ''>('')
  const [active, setActive] = useState(false)

  return (
    <>
      <Field label="Name" htmlFor="nl-name" className="min-w-[200px] flex-1" error={fieldError('name')}>
        <Input id="nl-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Tier" htmlFor="nl-tier" className="w-[160px]">
        <Select id="nl-tier" value={tierId}
          onChange={(e) => setTierId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Everyone</option>
          {TIERS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </Field>
      <label className="flex items-center gap-2 pb-2.5 text-[13px] text-ink-2">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 rounded border-strong" />
        Active
      </label>
      <Button variant="primary" disabled={busy || name.trim() === ''}
        onClick={() => onCreate({ name: name.trim(), tierId: tierId === '' ? null : tierId, active })}>
        {busy ? 'Creating…' : 'Create'}
      </Button>
      <Button disabled={busy} onClick={onCancel}>Cancel</Button>
    </>
  )
}

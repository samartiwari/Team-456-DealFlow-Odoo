import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  adminArchiveProduct, adminCreateProduct, adminListCategories, adminListProducts,
  adminRestoreProduct,
} from '@/shared/api/endpoints'
import type { ProductBody } from '@/shared/api/types'
import { money } from '@/shared/lib/format'
import {
  Badge, Button, Card, CardBody, EmptyState, ErrorState, Field, Input, Select,
  Spinner, TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { useAdminErrors, useInvalidateEverything } from './useAdmin'
import { MarginHint } from './MarginHint'
import { CategoriesCard } from './CategoriesCard'

/** Mockup screen 16 — the catalog, with the write side attached. */
export default function ProductsPage() {
  const navigate = useNavigate()
  const invalidate = useInvalidateEverything()
  const { problem, fail, clear, fieldError } = useAdminErrors()
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)

  const products = useQuery({ queryKey: ['admin-products'], queryFn: adminListProducts })
  const categories = useQuery({
    queryKey: ['admin-categories'], queryFn: adminListCategories, staleTime: Infinity,
  })

  const done = () => { invalidate(); clear() }
  const create = useMutation({
    mutationFn: (b: ProductBody) => adminCreateProduct(b),
    onSuccess: (p) => { done(); setCreating(false); navigate(`/app/configuration/products/${p.id}`) },
    onError: fail,
  })
  const archive = useMutation({
    mutationFn: (id: number) => adminArchiveProduct(id), onSuccess: done, onError: fail,
  })
  const restore = useMutation({
    mutationFn: (id: number) => adminRestoreProduct(id), onSuccess: done, onError: fail,
  })

  if (products.isLoading) {
    return <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
  }
  if (products.isError || !products.data) {
    return <ErrorState title="Could not load the catalog" description="Only a sales manager can open this." />
  }

  const rows = products.data.filter((p) => showArchived || !p.archived)
  const archivedCount = products.data.filter((p) => p.archived).length
  const busy = create.isPending || archive.isPending || restore.isPending

  return (
    <div className="flex flex-col gap-4">
      {problem && !problem.field && (
        <div role="alert" className="rounded-card border border-danger-br bg-danger-bg px-4 py-3">
          <p className="text-[13px] text-danger-tx">{problem.message}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Hidden behind a toggle rather than removed, so a restore stays reachable. */}
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-strong" />
          Show archived ({archivedCount})
        </label>
        {!creating && (
          <Button variant="primary" onClick={() => { setCreating(true); clear() }}>New product</Button>
        )}
      </div>

      {creating && categories.data && (
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <NewProductForm categories={categories.data} busy={create.isPending}
              fieldError={fieldError}
              onCancel={() => { setCreating(false); clear() }}
              onCreate={(b) => create.mutate(b)} />
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="No products" description="Create one to start building the catalog." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Category</TH>
                <TH numeric>Price</TH>
                {/* Cost and margin live on admin screens and nowhere else. */}
                <TH numeric>Cost</TH>
                <TH numeric>Margin</TH>
                <TH aria-label="Actions" />
              </TR>
            </THead>
            <TBody>
              {rows.map((p) => (
                <TR key={p.id} hover className={p.archived ? 'opacity-60' : undefined}>
                  <TD>
                    <button type="button"
                      onClick={() => navigate(`/app/configuration/products/${p.id}`)}
                      className="text-[13px] font-medium text-primary hover:underline">
                      {p.name}
                    </button>
                    {p.archived && <Badge tone="neutral">Archived</Badge>}
                  </TD>
                  <TD className="text-ink-2">{p.categoryName}</TD>
                  <TD numeric className="font-medium text-ink">{money(p.unitPrice)}</TD>
                  <TD numeric className="text-muted">{money(p.unitCost)}</TD>
                  <TD numeric><MarginHint pct={p.marginPct} /></TD>
                  <TD className="w-px">
                    {p.archived ? (
                      <Button size="sm" disabled={busy} onClick={() => restore.mutate(p.id)}>Restore</Button>
                    ) : (
                      <Button size="sm" disabled={busy} onClick={() => archive.mutate(p.id)}>Archive</Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <CategoriesCard />

      <p className="text-[12px] text-muted">
        Archiving keeps the row. Every quotation, invoice and report that already references a
        product still resolves — it simply leaves the catalog, so no new line can use it.
      </p>
    </div>
  )
}

function NewProductForm({
  categories, busy, fieldError, onCancel, onCreate,
}: {
  categories: Array<{ id: number; name: string }>
  busy: boolean
  fieldError: (field: string) => string | null
  onCancel: () => void
  onCreate: (b: ProductBody) => void
}) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 1)
  const [unitPrice, setUnitPrice] = useState('')
  const [unitCost, setUnitCost] = useState('')

  const price = Number(unitPrice)
  const cost = Number(unitCost)
  const ready = name.trim() !== '' && unitPrice !== '' && unitCost !== ''
    && Number.isFinite(price) && Number.isFinite(cost)

  return (
    <>
      <Field label="Name" htmlFor="np-name" className="min-w-[200px] flex-1" error={fieldError('name')}>
        <Input id="np-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Category" htmlFor="np-cat" className="w-[170px]">
        <Select id="np-cat" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Price" htmlFor="np-price" className="w-[130px]" error={fieldError('unitPrice')}>
        <Input id="np-price" align="right" inputMode="decimal" value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value.replace(/[^0-9.]/g, ''))} />
      </Field>
      <Field label="Cost" htmlFor="np-cost" className="w-[130px]" error={fieldError('unitCost')}>
        <Input id="np-cost" align="right" inputMode="decimal" value={unitCost}
          onChange={(e) => setUnitCost(e.target.value.replace(/[^0-9.]/g, ''))} />
      </Field>
      <div className="pb-1.5">
        {ready && price > 0 && <MarginHint pct={Math.round(((price - cost) / price) * 10000) / 100} />}
      </div>
      <Button variant="primary" disabled={!ready || busy}
        onClick={() => onCreate({ name: name.trim(), categoryId, unitPrice: price, unitCost: cost })}>
        {busy ? 'Creating…' : 'Create'}
      </Button>
      <Button disabled={busy} onClick={onCancel}>Cancel</Button>
    </>
  )
}

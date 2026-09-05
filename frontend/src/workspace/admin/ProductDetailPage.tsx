import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  adminAddVariant, adminDeleteVariant, adminListCategories, adminListProducts,
  adminUpdateProduct, adminUpdateVariant, productImpact,
} from '@/shared/api/endpoints'
import type { AdminProduct, VariantBody } from '@/shared/api/types'
import {
  Badge, Button, Card, CardBody, CardHeader, CardTitle, ErrorState, Field, Input,
  Select, Spinner, TBody, TD, TH, THead, TR, Table,
} from '@/shared/ui'
import { useAdminErrors, useInvalidateEverything } from './useAdmin'
import { MarginHint } from './MarginHint'

/** Mockup screen 17 — one product, editable, with cost and the impact line. */
export default function ProductDetailPage() {
  const { id: param } = useParams()
  const id = Number(param)
  const invalidate = useInvalidateEverything()
  const { problem, fail, clear, fieldError } = useAdminErrors()

  const products = useQuery({ queryKey: ['admin-products'], queryFn: adminListProducts })
  const categories = useQuery({
    queryKey: ['admin-categories'], queryFn: adminListCategories, staleTime: Infinity,
  })
  const impact = useQuery({
    queryKey: ['product-impact', id],
    queryFn: () => productImpact(id),
    enabled: Number.isFinite(id),
  })

  const product = products.data?.find((p) => p.id === id)

  const [draft, setDraft] = useState<
    { name: string; categoryId: number; unitPrice: string; unitCost: string } | null
  >(null)
  const [seen, setSeen] = useState<AdminProduct | null>(null)
  // Adjust during render, as every other form here does: the server is the
  // authority, so when it reports different figures the draft follows.
  if (product && seen !== product) {
    setSeen(product)
    setDraft({
      name: product.name,
      categoryId: product.categoryId,
      unitPrice: String(product.unitPrice),
      unitCost: String(product.unitCost),
    })
  }

  const done = () => { invalidate(); clear() }
  const save = useMutation({
    mutationFn: () => adminUpdateProduct(id, {
      name: draft!.name.trim(),
      categoryId: draft!.categoryId,
      unitPrice: Number(draft!.unitPrice),
      unitCost: Number(draft!.unitCost),
    }),
    onSuccess: done, onError: fail,
  })
  const addVariant = useMutation({
    mutationFn: (b: VariantBody) => adminAddVariant(id, b), onSuccess: done, onError: fail,
  })
  const editVariant = useMutation({
    mutationFn: (v: { id: number; body: Partial<VariantBody> }) => adminUpdateVariant(v.id, v.body),
    onSuccess: done, onError: fail,
  })
  const dropVariant = useMutation({
    mutationFn: (variantId: number) => adminDeleteVariant(variantId), onSuccess: done, onError: fail,
  })

  const back = (
    <Link to="/app/configuration/products"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
      <span aria-hidden="true">&larr;</span> All products
    </Link>
  )

  if (products.isLoading) {
    return <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
  }
  if (!product || !draft) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorState title="Could not load this product" description="It may have been removed." />
      </div>
    )
  }

  const price = Number(draft.unitPrice)
  const cost = Number(draft.unitCost)
  const livePct = price > 0 ? Math.round(((price - cost) / price) * 10000) / 100 : 0
  const priceChanged = price !== product.unitPrice
  const dirty = priceChanged || cost !== product.unitCost
    || draft.name.trim() !== product.name || draft.categoryId !== product.categoryId
  const valid = draft.name.trim() !== '' && Number.isFinite(price) && Number.isFinite(cost)

  return (
    <div className="flex flex-col gap-4">
      {back}

      {problem && !problem.field && (
        <div role="alert" className="rounded-card border border-danger-br bg-danger-bg px-4 py-3">
          <p className="text-[13px] text-danger-tx">{problem.message}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{product.name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge tone={product.stockable ? 'neutral' : 'info'}>
              {product.stockable ? 'Shipped' : 'Delivered'}
            </Badge>
            <Badge tone={product.recurring ? 'warning' : 'neutral'}>
              {product.recurring ? 'Recurring' : 'One-time'}
            </Badge>
            {product.archived && <Badge tone="neutral">Archived</Badge>}
          </div>
        </CardHeader>

        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Name" htmlFor="p-name" className="min-w-[200px] flex-1" error={fieldError('name')}>
              <Input id="p-name" value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Category" htmlFor="p-cat" className="w-[170px]">
              <Select id="p-cat" value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: Number(e.target.value) })}>
                {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Price" htmlFor="p-price" className="w-[140px]" error={fieldError('unitPrice')}>
              <Input id="p-price" align="right" inputMode="decimal" value={draft.unitPrice}
                onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value.replace(/[^0-9.]/g, '') })} />
            </Field>
            <Field label="Cost" htmlFor="p-cost" className="w-[140px]" error={fieldError('unitCost')}>
              <Input id="p-cost" align="right" inputMode="decimal" value={draft.unitCost}
                onChange={(e) => setDraft({ ...draft, unitCost: e.target.value.replace(/[^0-9.]/g, '') })} />
            </Field>
            <div className="pb-1.5">
              {/* Live, so a cost typed one digit short is caught while it is
                  being typed rather than after it has repriced the catalog. */}
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">Margin</p>
              <MarginHint pct={livePct} />
            </div>
          </div>

          {/* A line stores no price, so a draft follows the catalog while
              anything past draft keeps the price it was agreed at. Say which,
              before the change is saved. */}
          {priceChanged && impact.data && (
            <p className="rounded-card border border-info-br bg-info-bg px-3 py-2 text-[13px] text-info-tx">
              Changing this price updates <b>{impact.data.openDrafts} open
              draft{impact.data.openDrafts === 1 ? '' : 's'}</b>.{' '}
              <b>{impact.data.frozenQuotations}</b> confirmed or in-approval quotation
              {impact.data.frozenQuotations === 1 ? '' : 's'} keep the price they were agreed at.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!dirty || !valid || save.isPending}
              onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            {dirty && <Button onClick={() => setSeen(null)}>Discard</Button>}
          </div>
        </CardBody>
      </Card>

      <Variants
        product={product}
        busy={addVariant.isPending || editVariant.isPending || dropVariant.isPending}
        fieldError={fieldError}
        onAdd={(b) => addVariant.mutate(b)}
        onEdit={(variantId, body) => editVariant.mutate({ id: variantId, body })}
        onDrop={(variantId) => dropVariant.mutate(variantId)}
      />
    </div>
  )
}

function Variants({
  product, busy, fieldError, onAdd, onEdit, onDrop,
}: {
  product: AdminProduct
  busy: boolean
  fieldError: (f: string) => string | null
  onAdd: (b: VariantBody) => void
  onEdit: (id: number, b: Partial<VariantBody>) => void
  onDrop: (id: number) => void
}) {
  const [name, setName] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const ready = name.trim() !== '' && unitPrice !== '' && unitCost !== ''

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Variants</CardTitle>
        <span className="text-[12px] text-muted">
          {product.variants.length === 0 ? 'one shape only' : `${product.variants.length} shapes`}
        </span>
      </CardHeader>

      {product.variants.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>Variant</TH>
              <TH numeric>Price</TH>
              <TH numeric>Cost</TH>
              <TH numeric>Margin</TH>
              <TH aria-label="Actions" />
            </TR>
          </THead>
          <TBody>
            {product.variants.map((v) => (
              <TR key={v.id} hover>
                <TD className="font-medium text-ink">{v.name}</TD>
                <TD numeric>
                  <InlineNumber label={`${v.name} price`} value={v.unitPrice} busy={busy}
                    onCommit={(n) => onEdit(v.id, { unitPrice: n })} />
                </TD>
                <TD numeric>
                  <InlineNumber label={`${v.name} cost`} value={v.unitCost} busy={busy}
                    onCommit={(n) => onEdit(v.id, { unitCost: n })} />
                </TD>
                <TD numeric>
                  <MarginHint pct={v.unitPrice === 0 ? 0
                    : Math.round(((v.unitPrice - v.unitCost) / v.unitPrice) * 10000) / 100} />
                </TD>
                <TD className="w-px">
                  <Button size="sm" disabled={busy} onClick={() => onDrop(v.id)}>Remove</Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <CardBody className="flex flex-wrap items-end gap-3 border-t border-default">
        <Field label="New variant" htmlFor="v-name" className="min-w-[180px] flex-1" error={fieldError('name')}>
          <Input id="v-name" placeholder="32GB / 1TB" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Price" htmlFor="v-price" className="w-[130px]">
          <Input id="v-price" align="right" inputMode="decimal" value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value.replace(/[^0-9.]/g, ''))} />
        </Field>
        <Field label="Cost" htmlFor="v-cost" className="w-[130px]">
          <Input id="v-cost" align="right" inputMode="decimal" value={unitCost}
            onChange={(e) => setUnitCost(e.target.value.replace(/[^0-9.]/g, ''))} />
        </Field>
        <Button disabled={!ready || busy}
          onClick={() => {
            onAdd({ name: name.trim(), unitPrice: Number(unitPrice), unitCost: Number(unitCost) })
            setName(''); setUnitPrice(''); setUnitCost('')
          }}>
          Add variant
        </Button>
        <p className="w-full text-[12px] text-muted">
          {/* AddLineBody takes a productId and nothing else, so a picker here
              would post something the API rejects. */}
          A variant cannot be selected on a quotation line yet — these are the shapes the
          product comes in, and the catalog shows them for reference.
        </p>
      </CardBody>
    </Card>
  )
}

/** Edits in place and commits on blur; a whole form for one number is heavy. */
function InlineNumber({
  label, value, busy, onCommit,
}: {
  label: string
  value: number
  busy: boolean
  onCommit: (n: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setDraft(String(value)) }

  return (
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
      className="h-9 w-28 rounded-control border border-default bg-card px-2 text-right text-[13px] text-ink tnum focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
    />
  )
}

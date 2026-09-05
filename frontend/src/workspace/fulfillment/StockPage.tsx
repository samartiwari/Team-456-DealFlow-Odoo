import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import { useActor } from '@/shared/api/actor'
import { getFulfilmentBoard, receiveStock } from '@/shared/api/endpoints'
import type { FulfilmentBoard, StockRow } from '@/shared/api/types'
import { sanitiseInteger } from '@/shared/lib/numericInput'
import {
  Badge, Button, Card, CardBody, CardHeader, CardTitle, ErrorState, Field,
  Input, PageHeader, Select, Spinner,
} from '@/shared/ui'
import { OrderQueue } from './OrderQueue'
import { StockTable } from './StockTable'

/**
 * PDF A4 / mockup screen 7 — live stock per warehouse, plus every order still
 * waiting to ship.
 *
 * Receiving stock here is what raises the "Consolidate remaining backorder"
 * prompt on a fulfilment screen: the backend publishes StockArrivedEvent and a
 * listener flags every plan still waiting on that product. Without somewhere to
 * receive stock, that prompt could never appear.
 */
export default function StockPage() {
  const qc = useQueryClient()
  const actor = useActor()
  // Section 3 gives warehouse and backorder decisions to finance and operations.
  const canReceive = actor.role !== 'REP'

  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [row, setRow] = useState<string>('')
  const [qty, setQty] = useState('10')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['fulfilment-board'],
    queryFn: getFulfilmentBoard,
  })

  const receive = useMutation({
    mutationFn: (v: { warehouseId: number; productId: number; quantity: number }) =>
      receiveStock(v.warehouseId, { productId: v.productId, quantity: v.quantity }),
    onSuccess: (next: FulfilmentBoard, v) => {
      qc.setQueryData(['fulfilment-board'], next)
      // A receipt can make a plan consolidatable, so no allocation may keep a
      // cached answer — that flag is the whole point of receiving stock here.
      qc.invalidateQueries({ queryKey: ['allocation'] })
      const consolidatable = next.orders.filter((o) => o.status === 'BACKORDER')
      setProblem(null)
      setNote(
        consolidatable.length > 0
          ? `Received ${v.quantity} units. ${consolidatable.length} order${consolidatable.length === 1 ? '' : 's'} on backorder can now be consolidated — open one to see the prompt.`
          : `Received ${v.quantity} units.`,
      )
    },
    onError: (e) => {
      setNote(null)
      setProblem(e instanceof ApiError ? e.message : 'Could not receive the stock.')
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Could not load stock"
        description={
          error instanceof ApiError
            ? error.message
            : 'Check that the backend is running, or switch VITE_USE_MOCKS back on.'
        }
      />
    )
  }

  const key = (r: StockRow) => `${r.warehouseId}:${r.productId}`
  const chosen = data.stock.find((r) => key(r) === row) ?? data.stock[0]
  const quantity = Number(qty)
  const canSubmit = chosen !== undefined && Number.isInteger(quantity) && quantity > 0

  const shortOf = data.orders.reduce((s, o) => s + o.backorderedUnits, 0)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fulfilment and stock"
        description="Live stock per warehouse, and every order approved but not yet shipped."
        actions={
          shortOf > 0 ? (
            <Badge tone="warning">{shortOf} units backordered</Badge>
          ) : (
            <Badge tone="success">Nothing backordered</Badge>
          )
        }
      />

      {problem && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-card border border-danger-br bg-danger-bg px-4 py-3"
        >
          <p className="text-[13px] text-danger-tx">{problem}</p>
          <button
            type="button"
            onClick={() => setProblem(null)}
            className="text-[12px] font-medium text-danger-tx hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {note && (
        <div className="flex items-start justify-between gap-3 rounded-card border border-success-br bg-success-bg px-4 py-3">
          <p className="text-[13px] text-success-tx">{note}</p>
          <button
            type="button"
            onClick={() => setNote(null)}
            className="text-[12px] font-medium text-success-tx hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Stock on hand</CardTitle>
          <span className="text-[12px] text-muted">
            {data.stock.length} warehouse-product row{data.stock.length === 1 ? '' : 's'}
          </span>
        </CardHeader>

        <StockTable rows={data.stock} />

        {canReceive ? (
          <CardBody className="flex flex-wrap items-end gap-3 border-t border-default">
            <Field label="Receive into" htmlFor="stock-row" className="min-w-[280px]">
              <Select
                id="stock-row"
                value={chosen ? key(chosen) : ''}
                disabled={receive.isPending}
                onChange={(e) => setRow(e.target.value)}
              >
                {data.stock.map((r) => (
                  <option key={key(r)} value={key(r)}>
                    {r.warehouseName} — {r.productName}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Units" htmlFor="stock-qty" className="w-[110px]">
              <Input
                id="stock-qty"
                align="right"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(sanitiseInteger(e.target.value))}
              />
            </Field>

            <Button
              variant="primary"
              disabled={!canSubmit || receive.isPending}
              onClick={() =>
                chosen &&
                receive.mutate({
                  warehouseId: chosen.warehouseId,
                  productId: chosen.productId,
                  quantity,
                })
              }
            >
              {receive.isPending ? 'Receiving…' : 'Receive stock'}
            </Button>

            <p className="w-full text-[12px] text-muted">
              A receipt raises the consolidation prompt on any order still waiting for that
              product.
            </p>
          </CardBody>
        ) : (
          <CardBody className="border-t border-default">
            <p className="text-[13px] text-muted">
              Warehouse stock is managed by operations. You are signed in as{' '}
              <b className="text-ink">{actor.name}</b>, so these levels are shown but not
              editable.
            </p>
          </CardBody>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Orders awaiting fulfilment</CardTitle>
          <span className="text-[12px] text-muted">
            {data.orders.length} order{data.orders.length === 1 ? '' : 's'}
          </span>
        </CardHeader>
        <OrderQueue orders={data.orders} />
      </Card>
    </div>
  )
}

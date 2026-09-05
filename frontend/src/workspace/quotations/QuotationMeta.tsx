import { useQuery } from '@tanstack/react-query'
import { listCustomers, listPriceLists } from '@/shared/api/endpoints'
import type { RecomputeResult } from '@/shared/api/types'
import { Card, CardBody, Field, Select } from '@/shared/ui'

/**
 * The quotation's header fields, directly under its reference.
 *
 * The customer lives here rather than on a step before the builder, because it
 * is not a one-off decision: switching it re-prices the whole quotation. The
 * tier ceiling every line is measured against comes from the customer, so a
 * change here moves each line's allowed discount, the risk score and the
 * approval chain in one round trip.
 */
export function QuotationMeta({
  quote,
  locked,
  onCustomer,
}: {
  quote: RecomputeResult
  locked: boolean
  onCustomer: (customerId: number) => void
}) {
  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: listCustomers,
    staleTime: Infinity,
  })

  const priceLists = useQuery({
    queryKey: ['price-lists'],
    queryFn: listPriceLists,
    staleTime: Infinity,
  })

  // At most one list is live per tier, so the tier settles it.
  const inForce = priceLists.data?.find((l) => l.active && l.tier === quote.tier)

  return (
    <Card>
      <CardBody className="grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
        <Field
          label="Customer"
          htmlFor="quote-customer"
          hint={`${quote.tier} tier — every line is capped at the stricter of this and its category.`}
        >
          <Select
            id="quote-customer"
            value={quote.customerId}
            disabled={locked || customers.isLoading}
            onChange={(e) => onCustomer(Number(e.target.value))}
          >
            {/* Until the list arrives, show the customer the quotation already
                has, so the control is never blank or briefly wrong. */}
            {customers.data
              ? customers.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.tier}, max {c.tierCeilingPct}%
                  </option>
                ))
              : <option value={quote.customerId}>{quote.customerName}</option>}
          </Select>
        </Field>

        <Field
          label="Pricing"
          htmlFor="quote-pricing"
          hint={
            inForce
              ? `${inForce.name} applies to every ${quote.tier} customer. Change the customer above and this follows.`
              : `${quote.tier} has no price list, so lines are at the base price — the keenest rate in the catalog.`
          }
        >
          {/*
            Read-only, and truthful. Which list applies is decided by the
            customer's tier and resolved on the server, so this reports the
            answer rather than offering a choice the API would ignore. It used
            to read "Standard" always, with a hint saying pricing was not wired
            up — by then it was, and the control was the only thing still
            claiming otherwise.
          */}
          <Select id="quote-pricing" value="current" disabled onChange={() => {}}>
            <option value="current">{inForce ? inForce.name : 'Base price'}</option>
          </Select>
        </Field>
      </CardBody>
    </Card>
  )
}

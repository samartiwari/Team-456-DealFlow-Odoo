import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCustomer, listCustomers, listPriceLists } from '@/shared/api/endpoints'
import { ApiError } from '@/shared/api/client'
import type { Customer, CustomerBody, RecomputeResult, Tier } from '@/shared/api/types'
import { Button, Card, CardBody, Field, Input, Select } from '@/shared/ui'

/** The three rows of customer_tier. Fixed, the way the seed and the policy are. */
const TIERS: Tier[] = ['BRONZE', 'SILVER', 'GOLD']

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
  const [adding, setAdding] = useState(false)

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
      <CardBody className="flex flex-col gap-4 lg:max-w-3xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
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
            hint={
              inForce
                ? `${inForce.name} applies to every ${quote.tier} customer. Change the customer above and this follows.`
                : `${quote.tier} has no price list, so lines are at the base price — the keenest rate in the catalog.`
            }
          >
            {/*
              Not a control. Which list applies is decided by the customer's tier
              and resolved on the server, so this reports the answer rather than
              offering a choice the API would ignore — and a select, even disabled,
              draws a chevron that promises a choice there is none of. Styled to
              sit level with the customer control beside it, without pretending to
              be one.
            */}
            <p
              id="quote-pricing"
              className="flex h-10 items-center rounded-control border border-default bg-subtle px-3 text-sm text-ink"
            >
              {inForce ? inForce.name : 'Base price'}
            </p>
          </Field>

          {/*
            Hidden once the quotation is locked: the customer cannot be changed
            then, so adding one from here could only strand a new row on a screen
            that will not use it.

            The blank label is load-bearing rather than lazy. It reproduces the
            12px label and 6px gap each Field draws above its control, so the
            button lines up with the two controls rather than with their labels.
          */}
          {!locked && (
            <div className="flex flex-col gap-1.5">
              <span aria-hidden="true" className="text-xs font-medium">&nbsp;</span>
              {/*
                Kept in place while the form is open, rather than swapped for a
                Cancel or removed: the form carries its own Cancel, so a second
                one here would be two controls with one meaning, and dropping
                the button would collapse this column and shift the two fields
                beside it every time the form opened.
              */}
              <Button
                type="button"
                disabled={adding}
                onClick={() => setAdding(true)}
                aria-expanded={adding}
                aria-controls="new-customer-form"
                className="h-10 whitespace-nowrap"
              >
                New customer
              </Button>
            </div>
          )}
        </div>

        {adding && !locked && (
          <NewCustomerForm
            knownCeilings={ceilingsByTier(customers.data)}
            onClose={() => setAdding(false)}
            onCreated={(c) => {
              setAdding(false)
              // Adding a customer from inside a quotation means you intend to
              // quote them. Leaving the dropdown on whoever was selected would
              // make the rep go and find the row they just typed.
              onCustomer(c.id)
            }}
          />
        )}
      </CardBody>
    </Card>
  )
}

/** Read off the list already loaded, so showing a ceiling costs no request. */
function ceilingsByTier(list: Customer[] | undefined): Partial<Record<Tier, number>> {
  const out: Partial<Record<Tier, number>> = {}
  for (const c of list ?? []) out[c.tier] = c.tierCeilingPct
  return out
}

/**
 * The customer table, and only the customer table: name, tier, phone.
 *
 * Expands in place rather than opening a dialog — which is what every other
 * create form in this app does, and here it earns its keep twice over, because
 * the quotation it is about stays on screen behind it.
 *
 * The panel is `bg-app` rather than the `bg-subtle` its neighbours use: the
 * theme declares no `--color-subtle`, so that class resolves to nothing and
 * leaves the panel transparent on the card. Five other places have the same
 * silent hole; this one does not add a sixth.
 */
function NewCustomerForm({
  knownCeilings,
  onClose,
  onCreated,
}: {
  knownCeilings: Partial<Record<Tier, number>>
  onClose: () => void
  onCreated: (customer: Customer) => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  // Bronze is the strictest ceiling. Guessing wrong here hands out discount
  // headroom, so the default is the guess that cannot.
  const [tier, setTier] = useState<Tier>('BRONZE')
  const [phone, setPhone] = useState('')
  const [problem, setProblem] = useState<{ message: string; field: string | null } | null>(null)

  const create = useMutation({
    mutationFn: (body: CustomerBody) => createCustomer(body),
    onSuccess: async (customer) => {
      // The dropdown reads this list, so it has to be refetched before the new
      // row can be selected as the quotation's customer.
      await qc.invalidateQueries({ queryKey: ['customers'] })
      onCreated(customer)
    },
    onError: (e: unknown) =>
      setProblem(
        e instanceof ApiError
          ? { message: e.message, field: e.field }
          : { message: 'Could not add the customer. Try again.', field: null },
      ),
  })

  const fieldError = (f: string) => (problem?.field === f ? problem.message : null)
  const ready = name.trim() !== '' && phone.trim() !== ''

  return (
    <form
      id="new-customer-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready || create.isPending) return
        setProblem(null)
        create.mutate({ name: name.trim(), tier, phone: phone.trim() })
      }}
      className="flex flex-col gap-3 rounded-card border border-default bg-app p-4"
    >
      <p className="text-[13px] font-medium text-ink">Add a customer</p>

      {problem && !problem.field && (
        <p role="alert" className="text-[13px] text-danger-tx">{problem.message}</p>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <Field
          label="Name"
          htmlFor="nc-name"
          className="min-w-[200px] flex-1"
          error={fieldError('name')}
        >
          {/* maxLength mirrors varchar(160): the input stops where the column does. */}
          <Input
            id="nc-name"
            autoFocus
            maxLength={160}
            value={name}
            invalid={!!fieldError('name')}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label="Tier"
          htmlFor="nc-tier"
          className="w-[190px]"
          error={fieldError('tier')}
          hint={
            knownCeilings[tier] !== undefined
              ? `Caps every line at ${knownCeilings[tier]}%.`
              : undefined
          }
        >
          <Select id="nc-tier" value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {knownCeilings[t] !== undefined ? `${t} — max ${knownCeilings[t]}%` : t}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Phone"
          htmlFor="nc-phone"
          className="w-[190px]"
          error={fieldError('phone')}
        >
          {/* varchar(20), and V6 made it NOT NULL — so it is required, not optional. */}
          <Input
            id="nc-phone"
            type="tel"
            inputMode="tel"
            maxLength={20}
            value={phone}
            invalid={!!fieldError('phone')}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={!ready || create.isPending}>
          {create.isPending ? 'Adding…' : 'Add customer'}
        </Button>
        <Button type="button" disabled={create.isPending} onClick={onClose}>
          Cancel
        </Button>
        <span className="text-[12px] text-muted">
          Adding selects them for this quotation, which re-prices every line.
        </span>
      </div>
    </form>
  )
}

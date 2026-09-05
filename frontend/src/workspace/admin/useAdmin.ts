import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'

/**
 * The error handling every admin screen needs, written once.
 *
 * A 409 or 422 from these endpoints is a sentence a person wrote — "Standard is
 * already the active list for BRONZE" — so it is surfaced verbatim rather than
 * as a toast of JSON. Where the server named a field, that input is marked.
 */
export function useAdminErrors() {
  const [problem, setProblem] = useState<{ message: string; field: string | null } | null>(null)

  const fail = (e: unknown) =>
    setProblem(
      e instanceof ApiError
        ? { message: e.message, field: e.field }
        : { message: 'Something went wrong. Try again.', field: null },
    )

  return {
    problem,
    fail,
    clear: () => setProblem(null),
    fieldError: (field: string) => (problem?.field === field ? problem.message : null),
  }
}

/**
 * A configuration change can move any engine, so nothing that reads a rate,
 * ceiling or price may keep a cached answer.
 */
export function useInvalidateEverything() {
  const qc = useQueryClient()
  return () => {
    for (const key of [
      ['products'], ['product'], ['price-lists'], ['warehouses'], ['discount-policy'],
      ['quotations'], ['quotation'], ['approvals'], ['approval'], ['suggestions'],
      ['fulfilment-board'], ['allocation'], ['billing'], ['invoices'], ['report'],
      ['admin-products'], ['admin-price-lists'], ['admin-warehouses'], ['admin-plans'],
      ['admin-upsell'], ['admin-categories'], ['product-impact'],
    ]) {
      qc.invalidateQueries({ queryKey: key })
    }
  }
}

import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { QuotationSummary } from '@/shared/api/types'
import { money } from '@/shared/lib/format'

export default function QuotationsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['quotations'],
    queryFn: () => api.get<QuotationSummary[]>('/quotations'),
  })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-ink">Quotations</h1>

      {isLoading && <p className="text-sm text-slate">Loading…</p>}

      {isError && (
        <p className="text-sm text-amber">
          {error instanceof Error ? error.message : 'Request failed'} — start Spring Boot on
          port 8080 and refresh.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded border border-rule bg-panel">
          <table className="w-full text-sm">
            <thead className="border-b border-rule text-left text-xs uppercase tracking-wider text-faint">
              <tr>
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((q) => (
                <tr key={q.id} className="border-b border-rule last:border-0">
                  <td className="px-4 py-3 font-mono text-ink">{q.ref}</td>
                  <td className="px-4 py-3">{q.customerName}</td>
                  <td className="px-4 py-3 text-slate">{q.stage}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink">
                    {money(q.grandTotal, q.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

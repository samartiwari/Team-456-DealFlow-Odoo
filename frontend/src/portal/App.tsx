import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

/**
 * Customer bundle. Imports nothing from src/workspace, so no internal screen,
 * cost figure or margin field can reach a customer through this build.
 *
 * The negotiation screen arrives with the portal phase; until then this bundle
 * exists only to keep the two entry points structurally separate.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold leading-8 text-ink">Your quotation</h1>
        <p className="mt-2 text-sm text-muted">
          This page is not available yet. Your account manager will send you a link when your
          quotation is ready to review.
        </p>
      </main>
    </QueryClientProvider>
  )
}

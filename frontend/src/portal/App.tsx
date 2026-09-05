import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NegotiationPage from './negotiation/NegotiationPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

/**
 * Customer bundle. Imports nothing from src/workspace, so no internal screen,
 * cost figure or margin field can reach a customer through this build.
 * Every call goes to /api/portal/**; the quotation id comes from the JWT,
 * never from the URL.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NegotiationPage />
    </QueryClientProvider>
  )
}

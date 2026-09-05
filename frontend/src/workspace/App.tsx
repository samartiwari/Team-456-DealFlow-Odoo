import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Shell from './Shell'
import NotFoundPage from './NotFoundPage'
import QuotationsPage from './quotations/QuotationsPage'
import QuotationBuilder from './quotations/QuotationBuilder'
import ApprovalsPage from './approvals/ApprovalsPage'
import ApprovalDetailPage from './approvals/ApprovalDetailPage'

const queryClient = new QueryClient({
  defaultOptions: {
    // The server owns money, margin and risk. Mutations return the whole
    // quotation, so the cache is replaced rather than patched locally.
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
})

/**
 * The workspace mounts under /app. Paths are written out in full rather than
 * via BrowserRouter's basename, so that "/" still resolves — a basename makes
 * every URL outside it match nothing and render a blank page.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/app/quotations" replace />} />

          <Route path="/app" element={<Shell />}>
            <Route index element={<Navigate to="/app/quotations" replace />} />
            <Route path="quotations" element={<QuotationsPage />} />
            <Route path="quotations/:id" element={<QuotationBuilder />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="approvals/:id" element={<ApprovalDetailPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

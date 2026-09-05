import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Shell from './Shell'
import NotFoundPage from './NotFoundPage'
import QuotationsPage from './quotations/QuotationsPage'
import QuotationBuilder from './quotations/QuotationBuilder'
import ApprovalsPage from './approvals/ApprovalsPage'
import ApprovalDetailPage from './approvals/ApprovalDetailPage'
import FulfilmentPage from './fulfillment/FulfilmentPage'
import StockPage from './fulfillment/StockPage'
import CatalogPage from './catalog/CatalogPage'
import ProductDetailPage from './catalog/ProductDetailPage'
import PriceListsPage from './catalog/PriceListsPage'
import BillingPage from './billing/BillingPage'
import InvoicesPage from './billing/InvoicesPage'
import InvoiceDetailPage from './billing/InvoiceDetailPage'
import DiscountPolicyPage from './config/DiscountPolicyPage'

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
            <Route path="quotations/:id/fulfilment" element={<FulfilmentPage />} />
            <Route path="quotations/:id/billing" element={<BillingPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="approvals/:id" element={<ApprovalDetailPage />} />
            <Route path="fulfilment" element={<StockPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="products" element={<CatalogPage />} />
            <Route path="products/:id" element={<ProductDetailPage />} />
            <Route path="price-lists" element={<PriceListsPage />} />
            <Route path="configuration" element={<DiscountPolicyPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

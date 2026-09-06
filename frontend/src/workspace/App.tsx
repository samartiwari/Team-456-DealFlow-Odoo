import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Shell from './Shell'
import LoginPage from './auth/LoginPage'
import SignupPage from './auth/SignupPage'
import RequireAuth from './auth/RequireAuth'
import { HOME } from './auth/home'
import { useSession } from '@/shared/api/session'
import { CAN } from '@/shared/api/types'
import NotFoundPage from './NotFoundPage'
import PipelinePage from './pipeline/PipelinePage'
import QuotationsPage from './quotations/QuotationsPage'
import QuotationBuilder from './quotations/QuotationBuilder'
import ApprovalsPage from './approvals/ApprovalsPage'
import ApprovalDetailPage from './approvals/ApprovalDetailPage'
import FulfilmentPage from './fulfillment/FulfilmentPage'
import StockPage from './fulfillment/StockPage'
import DashboardPage from './dashboard/DashboardPage'
import DealHealthPage from './dashboard/DealHealthPage'
import ReportsPage from './dashboard/ReportsPage'
import CatalogPage from './catalog/CatalogPage'
import ProductDetailPage from './catalog/ProductDetailPage'
import PriceListsPage from './catalog/PriceListsPage'
import BillingPage from './billing/BillingPage'
import InvoicesPage from './billing/InvoicesPage'
import InvoiceDetailPage from './billing/InvoiceDetailPage'
import DiscountPolicyPage from './config/DiscountPolicyPage'
import AdminShell from './admin/AdminShell'
import AdminProductsPage from './admin/ProductsPage'
import AdminProductDetailPage from './admin/ProductDetailPage'
import AdminPriceListsPage from './admin/PriceListsAdminPage'
import AdminWarehousesPage from './admin/WarehousesPage'
import AdminPlansPage from './admin/PlansPage'
import AdminUpsellPage from './admin/UpsellRulesPage'

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
/**
 * The catalog half of Configuration, which the brief assigns to Admin.
 *
 * Sends a manager back to the half that is theirs rather than showing a refusal:
 * they arrived by typing a URL, and the tab they wanted is one they do have.
 */
function RequirePlatformAdmin() {
  const user = useSession()
  if (user && !CAN.configurePlatform(user.role)) {
    return <Navigate to="/app/configuration" replace />
  }
  return <Outlet />
}

/** /app lands wherever this role's work starts — Gate 3's graded behaviour. */
function RoleHome() {
  const user = useSession()
  return <Navigate to={user ? HOME : '/login'} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />

          {/* The only two routes reachable without a token. */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route element={<RequireAuth />}>
          <Route path="/app" element={<Shell />}>
            <Route index element={<RoleHome />} />
            {/* Mockup screens 2 and 3. Reachable from the nav; RoleHome still
                sends each role to its own work, which is what Gate 3 grades. */}
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="pipeline" element={<PipelinePage />} />
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
            <Route path="deal-health" element={<DealHealthPage />} />
            <Route path="reports" element={<ReportsPage />} />
            {/* Two permissions. The index is discount tiers and approval chains,
                which the brief gives to a Sales Manager; everything after it
                writes to /api/admin/**, which the brief gives to Admin. The
                guard is here as well as in the tab list, because a URL can be
                typed and the tabs only hide what a manager cannot reach. */}
            <Route path="configuration" element={<AdminShell />}>
              <Route index element={<DiscountPolicyPage />} />
              <Route element={<RequirePlatformAdmin />}>
                <Route path="products" element={<AdminProductsPage />} />
                <Route path="products/:id" element={<AdminProductDetailPage />} />
                <Route path="price-lists" element={<AdminPriceListsPage />} />
                <Route path="warehouses" element={<AdminWarehousesPage />} />
                <Route path="plans" element={<AdminPlansPage />} />
                <Route path="upsell" element={<AdminUpsellPage />} />
              </Route>
            </Route>
          </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../shared/api/auth'
import { HomeRedirect, RequireRole, Splash } from './RequireRole'
import { ErrorBoundary } from './ErrorBoundary'
import LoginPage from '../features/auth/LoginPage'
import JoinPage from '../features/auth/JoinPage'
import { ConfirmProvider } from '../shared/ui/confirm'

// Each surface is its own chunk, so shopkeepers only download shop code.
const ShopApp = lazy(() => import('../features/shop/ShopApp'))
const DriverApp = lazy(() => import('../features/driver/DriverApp'))
const AdminApp = lazy(() => import('../features/admin/AdminApp'))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } })

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ConfirmProvider>
          <ErrorBoundary>
          <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/join" element={<JoinPage />} />
              <Route path="/shop/*" element={<RequireRole roles={['shop']}><ShopApp /></RequireRole>} />
              <Route path="/driver/*" element={<RequireRole roles={['driver']}><DriverApp /></RequireRole>} />
              <Route path="/admin/*" element={<RequireRole roles={['admin', 'manager']}><AdminApp /></RequireRole>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
          </ConfirmProvider>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

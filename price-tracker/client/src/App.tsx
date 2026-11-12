import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { AppLayout } from './layouts/AppLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { Spinner } from './components/Button';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { ProductsPage } from './pages/Products';
import { AddProductPage } from './pages/AddProduct';
import { ProductDetailPage } from './pages/ProductDetail';
import { ComparePage } from './pages/Compare';
import { NotificationsPage } from './pages/Notifications';
import { SettingsPage } from './pages/Settings';
import { SystemHealthPage } from './pages/SystemHealth';

function FullPageSpinner() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center text-muted">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function RedirectIfAuthed({ children }: { children: ReactElement }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-sm font-medium text-muted">404</p>
      <h1 className="mt-2 text-xl font-semibold text-ink">That page does not exist</h1>
      <a href="/dashboard" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
        Back to the dashboard
      </a>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        element={
          <RedirectIfAuthed>
            <AuthLayout />
          </RedirectIfAuthed>
        }
      >
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/add" element={<AddProductPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/system" element={<SystemHealthPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

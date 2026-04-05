import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../features/auth/context/AuthContext';
import AppShell from '../shared/components/layout/AppShell';
import Spinner from '../shared/components/ui/Spinner';
import LoginPage from '../features/auth/components/LoginPage';
import RegisterPage from '../features/auth/components/RegisterPage';
import VehicleSearchPage from '../features/vehicles/components/VehicleSearchPage';
import VehicleDetailPage from '../features/vehicles/components/VehicleDetailPage';
import CartPage from '../features/cart/components/CartPage';
import OrdersPage from '../features/cart/components/OrdersPage';
import OrderDetailPage from '../features/cart/components/OrderDetailPage';
import DocumentsPage from '../features/documents/components/DocumentsPage';
import FinancePage from '../features/finance/components/FinancePage';
import AdminPage from '../features/admin/components/AdminPage';
import PrivacyPage from '../features/privacy/components/PrivacyPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function AppRouter() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/vehicles" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to="/vehicles" replace /> : <RegisterPage />}
      />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/vehicles" replace />} />
        <Route path="/vehicles" element={<VehicleSearchPage />} />
        <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import MenuPage from './pages/MenuPage'
import AdminPage from './pages/AdminPage'
import ProductFormPage from './pages/ProductFormPage'
import LoginPage from './pages/LoginPage'
import PaymentPage from './pages/PaymentPage'
import KitchenPage from './pages/KitchenPage'
import NotFoundPage from './pages/NotFoundPage'
import { OrderProvider } from './context/OrderContext'
import OrderSummaryPage from './pages/OrderSummaryPage'

function Protected({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}

export default function App() {
  return (
    <AuthProvider>
      <OrderProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<MenuPage />} />
              <Route path="pedido/resumo" element={<OrderSummaryPage />} />
              <Route path="pedido/:id/pagamento" element={<PaymentPage />} />
              <Route path="cozinha" element={<Protected><KitchenPage /></Protected>} />
              <Route path="login" element={<LoginPage />} />
              <Route path="admin" element={<Protected><AdminPage /></Protected>} />
              <Route path="admin/produtos/novo" element={<Protected><ProductFormPage /></Protected>} />
              <Route path="admin/produtos/:id/editar" element={<Protected><ProductFormPage /></Protected>} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </OrderProvider>
    </AuthProvider>
  )
}

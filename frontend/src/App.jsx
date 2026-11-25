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
import { TotemLayout, TotemHome } from './pages/TotemPage'
import TotemAssistantPage from './pages/TotemAssistantPage'
import OrderDisplayPage from './pages/OrderDisplayPage'
import CounterPage from './pages/CounterPage'

function Protected({ children, roles }) {
  return <ProtectedRoute roles={roles}>{children}</ProtectedRoute>
}

export default function App() {
  return (
    <AuthProvider>
      <OrderProvider>
        <BrowserRouter>
          <Routes>
            <Route path="monitor" element={<OrderDisplayPage />} />
            <Route path="totem" element={<TotemLayout />}>
              <Route index element={<TotemHome />} />
              <Route path="cardapio" element={<MenuPage totem />} />
              <Route path="assistente" element={<TotemAssistantPage />} />
              <Route path="pedido/resumo" element={<OrderSummaryPage totem />} />
              <Route path="pedido/:id/pagamento" element={<PaymentPage totem />} />
            </Route>
            <Route element={<Layout />}>
              <Route index element={<MenuPage />} />
              <Route path="pedido/resumo" element={<OrderSummaryPage />} />
              <Route path="pedido/:id/pagamento" element={<PaymentPage />} />
              <Route path="balcao" element={<Protected roles={['atendente', 'admin']}><CounterPage /></Protected>} />
              <Route path="cozinha" element={<Protected roles={['barista', 'atendente', 'admin']}><KitchenPage /></Protected>} />
              <Route path="login" element={<LoginPage />} />
              <Route path="admin" element={<Protected roles={['admin']}><AdminPage /></Protected>} />
              <Route path="admin/produtos/novo" element={<Protected roles={['admin']}><ProductFormPage /></Protected>} />
              <Route path="admin/produtos/:id/editar" element={<Protected roles={['admin']}><ProductFormPage /></Protected>} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </OrderProvider>
    </AuthProvider>
  )
}

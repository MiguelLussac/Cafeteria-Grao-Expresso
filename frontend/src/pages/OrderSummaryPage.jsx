import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Alert, Button, EmptyState, Field } from '../components/ui'
import { useOrder } from '../context/OrderContext'
import { formatPrice } from '../utils/format'
import { estimatedTotal } from '../utils/order'

export default function OrderSummaryPage() {
  const { items, details, setDetails, createdOrder, isSubmitting, confirmOrder } = useOrder()
  const [error, setError] = useState('')
  const navigate = useNavigate()

  if (createdOrder) return <Navigate to={`/pedido/${createdOrder.id}/pagamento`} replace />

  async function confirm(event) {
    event.preventDefault()
    setError('')
    try {
      const order = await confirmOrder()
      navigate(`/pedido/${order.id}/pagamento`, { replace: true })
    } catch (err) {
      setError(err.message || 'Não foi possível registrar o pedido. Tente novamente.')
    }
  }

  function change(event) {
    setDetails((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  return (
    <div className="container page page-narrow">
      <header className="page-header">
        <div>
          <h1>Revise seu pedido</h1>
          <p className="page-subtitle">Confira os produtos antes de continuar para o pagamento.</p>
        </div>
      </header>
      {!items.length ? (
        <EmptyState title="Seu pedido está vazio." action={<Link className="btn btn-primary" to="/">Escolher produtos</Link>}>
          Selecione ao menos um produto no cardápio.
        </EmptyState>
      ) : (
        <form className="form" onSubmit={confirm} aria-busy={isSubmitting}>
          <ul className="order-items" aria-label="Itens do pedido">
            {items.map((item) => (
              <li key={item.id}>
                <div><strong>{item.name}</strong><p>{item.quantity} × {formatPrice(item.price)} por unidade</p></div>
                <strong>{formatPrice(Math.round(item.price * 100) * item.quantity / 100)}</strong>
              </li>
            ))}
          </ul>
          <div className="order-total"><span>Total estimado</span><strong>{formatPrice(estimatedTotal(items))}</strong></div>
          <p className="form-note">O valor definitivo será calculado pelo servidor ao registrar o pedido.</p>
          <fieldset className="order-fields" disabled={isSubmitting}>
            <legend>Identificação e observações</legend>
            <div className="form-row">
              <Field label="Seu nome" id="customer_name" optional>
                <input id="customer_name" name="customer_name" maxLength={120} value={details.customer_name} onChange={change} placeholder="Balcão" />
              </Field>
              <fieldset className="order-service-mode">
                <legend>Mesa ou retirada <span className="required">(obrigatório)</span></legend>
                <div className="order-service-options">
                  {['Mesa', 'Retirada'].map((option) => (
                    <label key={option}>
                      <input type="radio" name="table_number" value={option}
                        checked={details.table_number === option} onChange={change} required />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <Field label="Observações do pedido" id="notes" optional>
              <textarea id="notes" name="notes" value={details.notes} onChange={change} placeholder="Ex.: café sem açúcar" />
            </Field>
          </fieldset>
          {error && <Alert variant="error" title="Pedido não confirmado.">{error}</Alert>}
          <p className="form-note">Confirmar registra o pedido. O pagamento será realizado na próxima etapa.</p>
          <div className="form-actions">
            <Button variant="outline" disabled={isSubmitting} onClick={() => navigate('/')}>Revisar produtos</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Registrando pedido...' : 'Confirmar e continuar'}</Button>
          </div>
        </form>
      )}
    </div>
  )
}

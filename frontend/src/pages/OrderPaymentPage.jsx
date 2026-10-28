import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Button, Loading } from '../components/ui'
import { getOrder } from '../services/api'
import { formatPrice } from '../utils/format'

// Ponto de integração com o Card 8. Não registra pagamentos automaticamente.
export default function OrderPaymentPage() {
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    getOrder(orderId).then((data) => { if (active) { setOrder(data); setError('') } })
      .catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [orderId, attempt])

  return (
    <div className="container page page-narrow">
      <h1>Pagamento do pedido</h1>
      {error ? <><Alert variant="error">{error}</Alert><Button onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</Button></> :
        !order ? <Loading text="Consultando pedido..." /> : (
          <section className="card order-payment" aria-label="Pedido registrado">
            <h2>Pedido #{order.id}</h2>
            <p>Total definitivo: <strong>{formatPrice(order.total_amount)}</strong></p>
            <Alert>{order.payment?.status === 'pago' ? 'Pagamento já registrado.' : 'Pedido registrado e aguardando pagamento. A etapa de pagamento ainda não está disponível nesta tela.'}</Alert>
          </section>
        )}
    </div>
  )
}

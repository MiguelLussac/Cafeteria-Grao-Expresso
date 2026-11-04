import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useOrder } from '../context/OrderContext'
import { getOrder, registerSimulatedPayment } from '../services/api'
import { Alert, Button, EmptyState, Loading } from '../components/ui'
import { NutritionLine, NutritionSummary } from '../components/Nutrition'
import { PAYMENT_METHODS, formatPrice, paymentMethodLabel } from '../utils/format'

const METHOD_HINTS = { dinheiro: 'no caixa', cartao: 'débito ou crédito', pix: 'QR Code' }

function isPaid(order) {
  return order?.payment?.status === 'pago'
}

// Itens do pedido no formato do resumo nutricional (a API envia a tabela de cada produto).
function nutritionItems(order) {
  return (order.items ?? []).map((item) => ({
    name: item.product_name ?? `Produto ${item.product_id}`,
    quantity: item.quantity,
    nutrition: item.nutrition ?? null,
  }))
}

function itemsCount(order) {
  return (order.items ?? []).reduce((total, item) => total + item.quantity, 0)
}

function orderMeta(order) {
  return [order.customer_name, order.table_number, order.notes && `“${order.notes}”`].filter(Boolean).join(' · ')
}

function OrderItems({ order }) {
  return (
    <section className="card payment-order" aria-labelledby="payment-order-title">
      <header>
        <h2 id="payment-order-title">Seu pedido</h2>
        <span>{orderMeta(order)}</span>
      </header>
      <ul className="payment-items">
        {(order.items ?? []).map((item) => (
          <li key={item.id}>
            <span className="payment-qty">{item.quantity}×</span>
            <span>{item.product_name ?? `Produto ${item.product_id}`}</span>
            <strong>{formatPrice(item.subtotal)}</strong>
          </li>
        ))}
      </ul>
    </section>
  )
}

const TOTEM_RESET_SECONDS = 15

function TotemNewOrderButton() {
  const { startNewOrder } = useOrder()
  const navigate = useNavigate()
  const [seconds, setSeconds] = useState(TOTEM_RESET_SECONDS)

  const returnHome = useCallback(() => {
    startNewOrder()
    navigate('/totem', { replace: true })
  }, [navigate, startNewOrder])

  useEffect(() => {
    const duration = TOTEM_RESET_SECONDS * 1000
    const deadline = Date.now() + duration
    const interval = setInterval(() => {
      setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    }, 1000)
    const timeout = setTimeout(returnHome, duration)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [returnHome])

  return (
    <Button variant="outline" onClick={returnHome}>
      Iniciar novo pedido <span aria-hidden="true">({seconds}s)</span>
    </Button>
  )
}

function Confirmation({ order, totem }) {
  const subtitle = [paymentMethodLabel(order.payment.method), formatPrice(order.payment.amount), order.table_number]
    .filter(Boolean).join(' · ')
  return (
    <div className="payment-confirmation" role="status">
      <span className="payment-confirmation-icon"><Check size={36} aria-hidden="true" /></span>
      <h1>Pagamento confirmado</h1>
      <p className="page-subtitle">{subtitle}</p>
      <div className="card payment-confirmation-card">
        <div className="order-number">
          <span>Pedido</span>
          <strong>{String(order.id).padStart(3, '0')}</strong>
        </div>
        <span className="status status-received">Recebido</span>
        <NutritionLine items={nutritionItems(order)} />
      </div>
      <p>
        Acompanhe na TV do balcão: avisaremos quando estiver pronto
        {order.customer_name ? `, ${order.customer_name}` : ''}.
      </p>
      {totem ? <TotemNewOrderButton /> : (
        <Link to="/" className="btn btn-outline">Voltar ao cardápio</Link>
      )}
    </div>
  )
}

export default function PaymentPage({ totem = false }) {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [method, setMethod] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  // Trava síncrona: impede um segundo envio antes de o React re-renderizar o botão.
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      setOrder(await getOrder(id))
      setStatus('ready')
    } catch (err) {
      setLoadError(err.status === 404 ? 'Pedido não encontrado.' : err.message)
      setStatus('error')
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function handleSubmit(event) {
    event.preventDefault()
    if (inFlight.current) return
    if (!method) {
      setError({ title: 'Escolha a forma de pagamento.' })
      return
    }

    inFlight.current = true
    setSubmitting(true)
    setError(null)
    try {
      const payment = await registerSimulatedPayment(order.id, { method })
      setOrder((current) => ({ ...current, payment }))
    } catch (err) {
      // A requisição pode ter chegado ao servidor mesmo com erro (ex.: queda de rede
      // ou clique repetido em outra aba). Só o estado salvo no backend decide se
      // o pagamento foi feito.
      let saved = null
      try {
        saved = await getOrder(order.id)
      } catch {
        // mantém o erro original
      }
      if (isPaid(saved)) {
        setOrder(saved)
      } else {
        setError({ title: 'O pagamento não foi registrado.', text: err.message })
      }
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="container page page-narrow">
        <Loading text="Carregando pedido..." />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="container page page-narrow">
        <EmptyState
          title="Não foi possível abrir o pagamento."
          action={<Button variant="outline" onClick={load}>Tentar novamente</Button>}
        >
          {loadError}
        </EmptyState>
      </div>
    )
  }

  if (isPaid(order)) {
    return (
      <div className="container page page-narrow">
        <Confirmation order={order} totem={totem} />
      </div>
    )
  }

  if (order.status !== 'recebido') {
    return (
      <div className="container page page-narrow">
        <EmptyState title={`O pedido #${order.id} não está aguardando pagamento.`}>
          Procure um atendente para mais informações.
        </EmptyState>
      </div>
    )
  }

  const count = itemsCount(order)
  return (
    <div className="container page">
      <header className="page-header">
        <div>
          {totem && <Link className="btn btn-outline" to="/totem/cardapio">← Voltar ao pedido</Link>}
          <h1>Pagamento</h1>
          <p className="page-subtitle">Pedido #{order.id}</p>
        </div>
      </header>

      <form className={totem ? "checkout totem-payment" : "checkout"} onSubmit={handleSubmit} noValidate>
        <div className="checkout-main">
          <OrderItems order={order} />
          {/* Resumo antes do preço: o cliente vê o que vai consumir antes de pagar. */}
          <NutritionSummary items={nutritionItems(order)} collapsible />
        </div>

        <aside className="checkout-side">
          <fieldset className="card payment-methods" disabled={submitting}>
            <legend>Forma de pagamento</legend>
            {PAYMENT_METHODS.map((m) => (
              <label key={m.value} className={`payment-method ${method === m.value ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="method"
                  value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                />
                <span className="payment-method-label">{m.label}</span>
                <span className="payment-method-hint">{METHOD_HINTS[m.value]}</span>
              </label>
            ))}
          </fieldset>

          {error && (
            <Alert variant="error" title={error.title} onClose={() => setError(null)}>
              {error.text}
            </Alert>
          )}

          <div className="card checkout-total">
            <div className="payment-subtotal">
              <span>Subtotal · {count} {count === 1 ? 'item' : 'itens'}</span>
              <span>{formatPrice(order.total_amount)}</span>
            </div>
            <div className="payment-total">
              <span>Total</span>
              <strong>{formatPrice(order.total_amount)}</strong>
            </div>
            <Button type="submit" block disabled={submitting}>
              {submitting ? 'Processando pagamento...' : `Confirmar e pagar ${formatPrice(order.total_amount)}`}
            </Button>
            <p className="form-note">Pagamento simulado · projeto acadêmico</p>
          </div>
        </aside>
      </form>
    </div>
  )
}

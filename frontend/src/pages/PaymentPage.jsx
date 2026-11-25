import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useOrder } from '../context/OrderContext'
import { getOrder, registerSimulatedPayment } from '../services/api'
import { Alert, Button, EmptyState, ItemThumb, Loading } from '../components/ui'
import { NutritionSummary } from '../components/Nutrition'
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

function OrderItems({ order }) {
  const count = itemsCount(order)
  const tags = [order.customer_name, order.table_number].filter(Boolean)
  return (
    <section className="card payment-order" aria-labelledby="payment-order-title">
      <header className="payment-order-head">
        <h2 id="payment-order-title">Seu pedido</h2>
        {tags.length > 0 && (
          <ul className="payment-order-tags" aria-label="Detalhes do pedido">
            {tags.map((tag) => <li key={tag}>{tag}</li>)}
          </ul>
        )}
      </header>
      <ul className="payment-items">
        {(order.items ?? []).map((item) => (
          <li key={item.id}>
            <span className="payment-item-media">
              <ItemThumb imageUrl={item.image_url} category={item.category} />
              <span className="payment-qty">
                {item.quantity}<span aria-hidden="true">×</span>
              </span>
            </span>
            <span className="payment-item-name">
              <strong>{item.product_name ?? `Produto ${item.product_id}`}</strong>
              {item.quantity > 1 && <small>{formatPrice(item.unit_price)} cada</small>}
            </span>
            <span className="payment-item-price">{formatPrice(item.subtotal)}</span>
          </li>
        ))}
      </ul>
      {order.notes && (
        <p className="payment-order-notes"><strong>Observação:</strong> {order.notes}</p>
      )}
      <footer className="payment-order-total">
        <span>Total <small>({count} {count === 1 ? 'item' : 'itens'})</small></span>
        <strong>{formatPrice(order.total_amount)}</strong>
      </footer>
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

function CounterNewOrderButton() {
  const { startNewOrder } = useOrder()
  const navigate = useNavigate()
  return (
    <Button onClick={() => { startNewOrder(); navigate('/balcao') }}>Novo pedido</Button>
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
      </div>
      {order.channel === 'site' ? (
        <p>
          Acompanhe o número <strong>{String(order.id).padStart(3, '0')}</strong> no monitor da loja
          e retire no balcão quando ele aparecer em “Pronto para retirada”.
        </p>
      ) : order.channel === 'balcao' ? (
        <p>
          Pedido enviado para a cozinha. Chame o cliente quando o número{' '}
          <strong>{String(order.id).padStart(3, '0')}</strong> aparecer em “Pronto para retirada” no monitor.
        </p>
      ) : (
        <p>
          Acompanhe na TV do balcão: avisaremos quando estiver pronto
          {order.customer_name ? `, ${order.customer_name}` : ''}.
        </p>
      )}
      {totem ? <TotemNewOrderButton /> : order.channel === 'balcao' ? <CounterNewOrderButton /> : (
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
          {/* Informação nutricional fica disponível, mas recolhida: o foco aqui é conferir e pagar. */}
          <NutritionSummary items={nutritionItems(order)} compact />
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

          <div className="card checkout-total payment-submit">
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

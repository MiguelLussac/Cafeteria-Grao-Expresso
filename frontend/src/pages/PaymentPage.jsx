import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Banknote, CheckCircle2, CreditCard, QrCode } from 'lucide-react'
import { getOrder, registerSimulatedPayment } from '../services/api'
import { Alert, Button, EmptyState, Loading } from '../components/ui'
import { PAYMENT_METHODS, formatPrice, paymentMethodLabel } from '../utils/format'

const METHOD_ICONS = { dinheiro: Banknote, cartao: CreditCard, pix: QrCode }

function isPaid(order) {
  return order?.payment?.status === 'pago'
}

function OrderSummary({ order }) {
  return (
    <div className="payment-summary">
      <ul className="payment-items">
        {(order.items ?? []).map((item) => (
          <li key={item.id}>
            <span>
              {item.quantity}× {item.product_name ?? `Produto ${item.product_id}`}
            </span>
            <span>{formatPrice(item.subtotal)}</span>
          </li>
        ))}
      </ul>
      <div className="payment-total">
        <span>Total a pagar</span>
        <strong>{formatPrice(order.total_amount)}</strong>
      </div>
    </div>
  )
}

function Confirmation({ order }) {
  return (
    <div className="card payment-confirmation" role="status">
      <CheckCircle2 className="payment-confirmation-icon" size={56} aria-hidden="true" />
      <h1>Pagamento simulado confirmado!</h1>
      <p className="page-subtitle">
        {formatPrice(order.payment.amount)} · {paymentMethodLabel(order.payment.method)}
      </p>
      <div className="order-number">
        <span>Número do seu pedido</span>
        <strong>{order.id}</strong>
      </div>
      <p>Aguarde: avisaremos quando o seu pedido estiver pronto para retirada.</p>
      <Link to="/" className="btn btn-outline">
        Voltar ao cardápio
      </Link>
    </div>
  )
}

export default function PaymentPage() {
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
        <Confirmation order={order} />
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
    <div className="container page page-narrow">
      <header className="page-header">
        <div>
          <h1>Pagamento</h1>
          <p className="page-subtitle">Pedido #{order.id} · pagamento simulado, nenhum valor é cobrado.</p>
        </div>
      </header>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        <OrderSummary order={order} />

        <fieldset className="payment-methods" disabled={submitting}>
          <legend>Forma de pagamento</legend>
          {PAYMENT_METHODS.map((m) => {
            const Icon = METHOD_ICONS[m.value]
            return (
              <label key={m.value} className={`payment-method ${method === m.value ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="method"
                  value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                />
                <Icon size={28} aria-hidden="true" />
                {m.label}
              </label>
            )
          })}
        </fieldset>

        {error && (
          <Alert variant="error" title={error.title} onClose={() => setError(null)}>
            {error.text}
          </Alert>
        )}

        <Button type="submit" block disabled={submitting}>
          {submitting ? 'Processando pagamento...' : `Confirmar pagamento de ${formatPrice(order.total_amount)}`}
        </Button>
      </form>
    </div>
  )
}

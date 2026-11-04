import { useEffect, useState } from 'react'
import { Check, Clock, Coffee, ShoppingBag } from 'lucide-react'
import { Alert, Button, Loading } from '../components/ui'
import { listDisplayOrders } from '../services/api'
import './order-display.css'

const clockFormat = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
})

function DisplayClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return <time className="display-clock" dateTime={now.toISOString()}>{clockFormat.format(now)}</time>
}

function orderNumber(id) {
  return String(id).padStart(3, '0')
}

function OrderNumbers({ orders }) {
  return (
    <ul className="display-numbers">
      {orders.map(({ id }) => <li key={id}>{orderNumber(id)}</li>)}
    </ul>
  )
}

export default function OrderDisplayPage() {
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    listDisplayOrders()
      .then((data) => { if (active) setOrders(data) })
      .catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [attempt])

  const preparing = orders?.filter(({ status }) => status === 'recebido' || status === 'em_preparo')
  const [highlighted, ...ready] = orders?.filter(({ status }) => status === 'pronto') ?? []

  return (
    <div className="order-display">
      <header className="display-header">
        <div className="display-brand">
          <span className="brand-logo"><Coffee aria-hidden="true" /></span>
          <strong>Grão Expresso</strong>
        </div>
        <h1>Acompanhe seu pedido</h1>
        <DisplayClock />
      </header>

      {error && (
        <div className="display-feedback">
          <Alert variant="error" title="Não foi possível carregar os pedidos.">{error}</Alert>
          <Button onClick={() => { setError(''); setAttempt((previous) => previous + 1) }}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!orders && !error && <div className="display-feedback"><Loading text="Carregando pedidos..." /></div>}

      <main className="display-board">
        <section className="display-preparing" aria-labelledby="display-preparing-title">
          <h2 id="display-preparing-title"><span><Clock aria-hidden="true" /></span>Em preparo</h2>
          {preparing?.length > 0 && <OrderNumbers orders={preparing} />}
          {preparing?.length === 0 && <p className="display-empty">Nenhum pedido em preparo.</p>}
        </section>
        <section className="display-ready" aria-labelledby="display-ready-title">
          <h2 id="display-ready-title"><span><Check aria-hidden="true" /></span>Pronto para retirada</h2>
          {highlighted && (
            <div className="display-highlight">
              <strong>{orderNumber(highlighted.id)}</strong>
              <span>Pronto para retirar!</span>
            </div>
          )}
          {ready.length > 0 && <OrderNumbers orders={ready} />}
          {orders && !highlighted && <p className="display-empty">Nenhum pedido pronto para retirada.</p>}
        </section>
      </main>

      <footer className="display-footer">
        <ShoppingBag aria-hidden="true" />
        Retire no balcão informando o número do seu pedido
      </footer>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { ChefHat, Clock, RefreshCw } from 'lucide-react'
import useKitchenQueue from '../hooks/useKitchenQueue'
import { Alert, Button, EmptyState, Loading } from '../components/ui'
import { formatTime } from '../utils/format'
import {
  KITCHEN_ACTIONS, KITCHEN_COLUMNS, LATE_AFTER_MINUTES, groupKitchenOrders, minutesWaiting,
} from '../utils/kitchen'

const CONNECTION_TEXT = {
  connecting: 'Conectando...',
  live: 'Ao vivo',
  offline: 'Sem conexão — reconectando',
}

// Atualiza o "há X min" dos cartões sem depender de novos eventos.
function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function waitingLabel(minutes) {
  return minutes < 1 ? 'agora' : `há ${minutes} min`
}

function OrderTicket({ order, oldest, now, updating, onAction }) {
  const action = KITCHEN_ACTIONS[order.status]
  const minutes = minutesWaiting(order, now)
  const late = order.status !== 'pronto' && minutes >= LATE_AFTER_MINUTES
  const paidAt = order.payment?.paid_at ?? order.created_at

  return (
    <article
      className={`ticket ticket-${order.status} ${oldest ? 'ticket-oldest' : ''} ${late ? 'ticket-late' : ''}`}
      aria-label={`Pedido ${order.id}`}
    >
      <header className="ticket-head">
        <strong className="ticket-number">#{order.id}</strong>
        <span className="ticket-time" title={`Pago às ${formatTime(paidAt)}`}>
          <Clock size={16} aria-hidden="true" />
          {waitingLabel(minutes)}
        </span>
      </header>

      {(oldest || late) && (
        <div className="ticket-flags">
          {oldest && <span className="ticket-flag">Mais antigo</span>}
          {late && <span className="ticket-flag ticket-flag-late">Atrasado</span>}
        </div>
      )}

      <p className="ticket-customer">
        {order.customer_name} · {order.table_number}
      </p>

      <ul className="ticket-items">
        {(order.items ?? []).map((item) => (
          <li key={item.id}>
            <span className="ticket-qty">{item.quantity}×</span>
            {item.product_name ?? `Produto ${item.product_id}`}
          </li>
        ))}
      </ul>

      {order.notes && <p className="ticket-notes">Obs.: {order.notes}</p>}

      {action && (
        <Button
          variant={order.status === 'pronto' ? 'outline' : 'primary'}
          block
          disabled={updating}
          onClick={() => onAction(order, action.next)}
        >
          {updating ? 'Atualizando...' : action.label}
        </Button>
      )}
    </article>
  )
}

export default function KitchenPage() {
  const { orders, status, error, connection, updating, changeStatus, refresh } = useKitchenQueue()
  const [actionError, setActionError] = useState(null)
  const now = useNow()

  const groups = groupKitchenOrders(orders)
  const total = KITCHEN_COLUMNS.reduce((sum, c) => sum + groups[c.status].length, 0)

  async function handleAction(order, nextStatus) {
    setActionError(null)
    try {
      await changeStatus(order, nextStatus)
    } catch (err) {
      setActionError({ title: `Não foi possível atualizar o pedido #${order.id}.`, text: err.message })
    }
  }

  return (
    <div className="container container-wide page kitchen">
      <header className="page-header">
        <div>
          <h1 className="kitchen-title">
            <ChefHat size={32} aria-hidden="true" />
            Painel da cozinha
          </h1>
          {status === 'ready' && (
            <p className="page-subtitle">
              {total} {total === 1 ? 'pedido na fila' : 'pedidos na fila'}
            </p>
          )}
        </div>
        <span className={`api-pill live-${connection}`} role="status">
          {CONNECTION_TEXT[connection]}
        </span>
      </header>

      {actionError && (
        <Alert variant="error" title={actionError.title} onClose={() => setActionError(null)}>
          {actionError.text}
        </Alert>
      )}

      {status === 'ready' && error && (
        <Alert variant="error" title="Falha ao atualizar a fila. Exibindo os últimos dados recebidos.">
          {error}
        </Alert>
      )}

      {status === 'loading' && <Loading text="Carregando pedidos..." />}

      {status === 'error' && (
        <EmptyState
          title="Não foi possível carregar os pedidos."
          action={
            <Button variant="outline" onClick={refresh}>
              <RefreshCw size={18} aria-hidden="true" />
              Tentar novamente
            </Button>
          }
        >
          {error}
        </EmptyState>
      )}

      {status === 'ready' && (
        <div className="kitchen-board">
          {KITCHEN_COLUMNS.map((column) => {
            const list = groups[column.status]
            return (
              <section
                key={column.status}
                className={`kitchen-column kitchen-column-${column.status}`}
                aria-labelledby={`col-${column.status}`}
              >
                <h2 id={`col-${column.status}`} className="kitchen-column-title">
                  {column.label}
                  <span className="chip-count">{list.length}</span>
                </h2>
                {list.length === 0 ? (
                  <p className="kitchen-empty">{column.empty}</p>
                ) : (
                  list.map((order, index) => (
                    <OrderTicket
                      key={order.id}
                      order={order}
                      oldest={index === 0 && column.status !== 'pronto' && list.length > 1}
                      now={now}
                      updating={!!updating[order.id]}
                      onAction={handleAction}
                    />
                  ))
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

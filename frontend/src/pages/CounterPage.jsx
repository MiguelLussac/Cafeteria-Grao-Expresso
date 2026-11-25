import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ImageIcon, Minus, Plus, Search, Trash2 } from 'lucide-react'
import { listProducts } from '../services/api'
import { CATEGORIES, formatPrice } from '../utils/format'
import { filterProducts } from '../utils/counter'
import { estimatedTotal, itemsQuantity } from '../utils/order'
import { useOrder } from '../context/OrderContext'
import { Alert, Button, EmptyState, Loading } from '../components/ui'
import './counter.css'

function ProductTile({ product, quantity, disabled, onAdd }) {
  const [imageFailed, setImageFailed] = useState(false)
  const hasImage = product.image_url && !imageFailed
  return (
    <button type="button" className="pos-tile" disabled={disabled} onClick={() => onAdd(product)}
      aria-label={`Adicionar ${product.name}, ${formatPrice(product.price)}`}>
      <span className={`pos-tile-media product-media-${product.category}`}>
        {hasImage
          ? <img src={product.image_url} alt="" loading="lazy" onError={() => setImageFailed(true)} />
          : <ImageIcon size={28} aria-hidden="true" />}
        {quantity > 0 && <span className="pos-tile-qty" aria-hidden="true">{quantity}</span>}
      </span>
      <span className="pos-tile-name">{product.name}</span>
      <span className="pos-tile-price">{formatPrice(product.price)}</span>
    </button>
  )
}

function Ticket({ onCharge, error }) {
  const { items, details, setDetails, setQuantity, removeItem, createdOrder, isSubmitting, startNewOrder } = useOrder()
  const locked = isSubmitting || !!createdOrder
  const count = itemsQuantity(items)

  function change(event) {
    setDetails((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  if (createdOrder) {
    return (
      <aside className="pos-ticket card" aria-label="Pedido em andamento">
        <h2>Pedido #{createdOrder.id} registrado</h2>
        <p>Total: {formatPrice(createdOrder.total_amount)}</p>
        <Link className="btn btn-primary btn-block" to={`/pedido/${createdOrder.id}/pagamento`}>Ir para o pagamento</Link>
        <Button variant="outline" block onClick={startNewOrder}>Novo pedido</Button>
      </aside>
    )
  }

  return (
    <aside className="pos-ticket card" aria-label="Pedido em andamento">
      <header className="pos-ticket-head">
        <h2>Pedido</h2>
        <span role="status">{count} {count === 1 ? 'item' : 'itens'}</span>
      </header>

      <div className="pos-ticket-body">
        {!items.length && <p className="pos-empty">Toque nos produtos para montar o pedido do cliente.</p>}
        <ul className="pos-lines">
          {items.map((item) => (
            <li key={item.id}>
              <span className="pos-line-name">{item.name}</span>
              <span className="stepper" role="group" aria-label={`Quantidade de ${item.name}`}>
                {item.quantity > 1 ? (
                  <button type="button" disabled={locked} aria-label={`Diminuir ${item.name}`}
                    onClick={() => setQuantity(item.id, item.quantity - 1)}><Minus size={16} /></button>
                ) : (
                  <button type="button" className="stepper-remove" disabled={locked} aria-label={`Remover ${item.name}`}
                    onClick={() => removeItem(item.id)}><Trash2 size={16} /></button>
                )}
                <output aria-live="polite">{item.quantity}</output>
                <button type="button" disabled={locked} aria-label={`Aumentar ${item.name}`}
                  onClick={() => setQuantity(item.id, item.quantity + 1)}><Plus size={16} /></button>
              </span>
              <strong className="pos-line-total">
                {formatPrice(Math.round(item.price * 100) * item.quantity / 100)}
              </strong>
            </li>
          ))}
        </ul>
      </div>

      <fieldset className="pos-details" disabled={locked}>
        <legend className="visually-hidden">Dados do pedido</legend>
        <div className="order-service-options" role="radiogroup" aria-label="Onde o cliente vai consumir?">
          {['Mesa', 'Retirada'].map((option) => (
            <label key={option} className={details.table_number === option ? 'is-selected' : ''}>
              <input type="radio" name="table_number" value={option}
                checked={details.table_number === option} onChange={change} />
              {option}
            </label>
          ))}
        </div>
        <input name="customer_name" maxLength={120} value={details.customer_name} onChange={change}
          placeholder="Nome do cliente (opcional)" aria-label="Nome do cliente" />
        <input name="notes" value={details.notes} onChange={change}
          placeholder="Observações (opcional)" aria-label="Observações" />
      </fieldset>

      {error && <Alert variant="error" title="Pedido não registrado.">{error}</Alert>}

      <footer className="pos-ticket-foot">
        <div className="pos-total"><span>Total</span><strong>{formatPrice(estimatedTotal(items))}</strong></div>
        <Button block disabled={!items.length || locked} onClick={onCharge}>
          {isSubmitting ? 'Registrando...' : 'Cobrar'}
        </Button>
      </footer>
    </aside>
  )
}

export default function CounterPage() {
  const { items, addItem, createdOrder, isSubmitting, confirmOrder, details, setDetails } = useOrder()
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [category, setCategory] = useState('todos')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      setProducts((await listProducts()).filter((product) => product.is_active))
      setStatus('ready')
    } catch (err) {
      setLoadError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // O atendente quase sempre atende quem vai comer na loja; ele troca para Retirada quando precisar.
  useEffect(() => {
    if (!details.table_number) setDetails((current) => ({ ...current, table_number: 'Mesa' }))
  }, [details.table_number, setDetails])

  const quantities = useMemo(() => new Map(items.map((item) => [item.id, item.quantity])), [items])
  const visible = filterProducts(products, category, query)
  const tabs = [{ value: 'todos', label: 'Todos', count: products.length }].concat(
    CATEGORIES.map((cat) => ({ ...cat, count: products.filter((p) => p.category === cat.value).length })),
  ).filter((tab) => tab.value === 'todos' || tab.count > 0)

  async function charge() {
    setError('')
    try {
      const order = await confirmOrder('balcao')
      navigate(`/pedido/${order.id}/pagamento`)
    } catch (err) {
      setError(err.message || 'Não foi possível registrar o pedido. Tente novamente.')
    }
  }

  return (
    <div className="container page pos">
      <header className="page-header">
        <div>
          <h1>Balcão</h1>
          <p className="page-subtitle">Monte o pedido do cliente e cobre.</p>
        </div>
      </header>

      <div className="pos-layout">
        <section className="pos-catalog" aria-label="Produtos">
          <div className="pos-toolbar">
            <label className="pos-search">
              <Search size={18} aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar produto" aria-label="Buscar produto" />
            </label>
            <div className="pos-tabs" role="tablist" aria-label="Categorias">
              {tabs.map((tab) => (
                <button key={tab.value} type="button" role="tab" aria-selected={category === tab.value}
                  className={`pos-tab ${category === tab.value ? 'is-active' : ''}`}
                  onClick={() => setCategory(tab.value)}>
                  {tab.label} <span>{tab.count}</span>
                </button>
              ))}
            </div>
          </div>

          {status === 'loading' && <Loading text="Carregando produtos..." />}
          {status === 'error' && (
            <>
              <Alert variant="error" title="Não foi possível carregar os produtos.">{loadError}</Alert>
              <Button variant="outline" onClick={load}>Tentar novamente</Button>
            </>
          )}
          {status === 'ready' && visible.length === 0 && <EmptyState>Nenhum produto encontrado.</EmptyState>}
          {status === 'ready' && visible.length > 0 && (
            <div className="pos-grid">
              {visible.map((product) => (
                <ProductTile key={product.id} product={product} quantity={quantities.get(product.id) ?? 0}
                  disabled={isSubmitting || !!createdOrder} onAdd={addItem} />
              ))}
            </div>
          )}
        </section>

        <Ticket onCharge={charge} error={error} />
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { listProducts } from '../services/api'
import { CATEGORIES, formatPrice } from '../utils/format'
import { Alert, Button, CategoryBadge, EmptyState, Loading } from '../components/ui'

function ProductCard({ product }) {
  return (
    <article className="product-card">
      <CategoryBadge category={product.category} />
      <h3>{product.name}</h3>
      {product.description && <p>{product.description}</p>}
      <strong className="product-price">{formatPrice(product.price)}</strong>
    </article>
  )
}

function itemsLabel(n) {
  return `${n} ${n === 1 ? 'item' : 'itens'}`
}

export default function MenuPage() {
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('todos')

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      setProducts(await listProducts())
      setStatus('ready')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const groups = CATEGORIES.map((cat) => ({
    ...cat,
    items: products.filter((p) => p.category === cat.value),
  }))
  const visibleGroups = groups.filter(
    (g) => g.items.length > 0 && (filter === 'todos' || filter === g.value),
  )

  const filters = [{ value: 'todos', label: 'Todos', count: products.length }].concat(
    groups.map((g) => ({ value: g.value, label: g.label, count: g.items.length })),
  )

  return (
    <div className="container page">
      <header className="page-header">
        <div>
          <h1>Cardápio</h1>
          <p className="page-subtitle">Cafés, doces e salgados preparados todos os dias.</p>
        </div>
      </header>

      {status === 'loading' && <Loading text="Carregando cardápio..." />}

      {status === 'error' && (
        <>
          <Alert variant="error" title="Não foi possível carregar o cardápio.">{error}</Alert>
          <Button variant="outline" onClick={load}>Tentar novamente</Button>
        </>
      )}

      {status === 'ready' && products.length === 0 && (
        <EmptyState title="O cardápio está vazio.">Nenhum produto disponível no momento.</EmptyState>
      )}

      {status === 'ready' && products.length > 0 && (
        <>
          <div className="chips" role="tablist" aria-label="Filtrar por categoria">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                className={`chip ${filter === f.value ? 'chip-active' : ''}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
                <span className="chip-count">{f.count}</span>
              </button>
            ))}
          </div>

          {visibleGroups.length === 0 && (
            <EmptyState>Nenhum produto nesta categoria.</EmptyState>
          )}

          {visibleGroups.map((group) => (
            <section key={group.value} className="menu-section">
              <h2 className="section-title">
                {group.label}
                <small>{itemsLabel(group.items.length)}</small>
              </h2>
              <div className="product-grid">
                {group.items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

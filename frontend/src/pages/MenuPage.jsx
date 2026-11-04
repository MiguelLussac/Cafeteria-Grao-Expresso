import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listProducts } from '../services/api'
import { CATEGORIES } from '../utils/format'
import { nutritionState } from '../utils/nutrition'
import { Alert, Button, EmptyState, Loading } from '../components/ui'
import { AiBadge } from '../components/Nutrition'
import ProductCard from '../components/ProductCard'
import ProductSelection from '../components/ProductSelection'

function itemsLabel(n) {
  return `${n} ${n === 1 ? 'item' : 'itens'}`
}

// O totem acompanha o catálogo enquanto fica aberto. O cardápio comum
// consulta periodicamente enquanto houver uma tabela nutricional em cálculo.
const POLL_MS = 5000

const SORTS = [
  { value: 'padrao', label: 'Padrão do cardápio' },
  { value: 'kcal-asc', label: 'Menos calorias' },
  { value: 'kcal-desc', label: 'Mais calorias' },
]

// Produtos sem tabela ficam sempre no fim, nas duas ordens por calorias.
function sortProducts(products, sort) {
  if (sort === 'padrao') return products
  const direction = sort === 'kcal-asc' ? 1 : -1
  return [...products].sort((a, b) => {
    const ka = a.nutrition?.calories_kcal
    const kb = b.nutrition?.calories_kcal
    if (ka == null || kb == null) return (ka == null) - (kb == null)
    return (ka - kb) * direction
  })
}

export default function MenuPage({ totem = false }) {
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('todos')
  const [sort, setSort] = useState('padrao')

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus('loading')
    try {
      setProducts((await listProducts()).filter((product) => product.is_active))
      setStatus('ready')
    } catch (err) {
      if (silent) return
      setError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const calculating = products.some((p) => nutritionState(p) === 'pending')
  useEffect(() => {
    if (!totem && !calculating) return undefined
    const timer = setInterval(() => load({ silent: true }), POLL_MS)
    return () => clearInterval(timer)
  }, [totem, calculating, load])

  const groups = CATEGORIES.map((cat) => ({
    ...cat,
    items: sortProducts(products.filter((p) => p.category === cat.value), sort),
  }))
  const visibleGroups = groups.filter(
    (g) => g.items.length > 0 && (filter === 'todos' || filter === g.value),
  )

  const filters = [{ value: 'todos', label: 'Todos', count: products.length }].concat(
    groups.map((g) => ({ value: g.value, label: g.label, count: g.items.length })),
  )

  return (
    <div className={totem ? "totem-menu" : "container page"}>
      <header className="page-header">
        <div>
          {totem && <Link className="btn btn-outline" to="/totem">← Início</Link>}
          <h1>{totem ? 'Monte seu pedido' : 'Cardápio'}</h1>
          <p className="page-subtitle menu-header-note">
            Cafés, doces e salgados preparados todos os dias.
            <AiBadge label="Calorias estimadas por IA" withInfo />
          </p>
        </div>
        {status === 'ready' && products.length > 0 && (
          <label className="menu-sort">
            Ordenar
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        )}
      </header>

      <ProductSelection totem={totem} />

      <div className="menu-products">

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
    </div>
  )
}

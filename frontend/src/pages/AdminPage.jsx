import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Pencil, Plus, RefreshCw, RotateCcw, Search, Sparkles, Trash2 } from 'lucide-react'
import { deleteProduct, listProducts, retryProductNutrition, updateProduct } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { CATEGORIES, formatPrice } from '../utils/format'
import { formatInteger, formatServing, nutritionState } from '../utils/nutrition'
import {
  Alert,
  Button,
  CategoryBadge,
  EmptyState,
  Loading,
  Modal,
  StatusBadge,
} from '../components/ui'

function DeleteDialog({ product, onCancel, onConfirm, deleting }) {
  return (
    <Modal titleId="delete-title" onClose={onCancel}>
      <div className="modal-head">
        <span className="modal-icon" aria-hidden="true">
          <Trash2 size={22} />
        </span>
        <div>
          <h2 id="delete-title">Excluir este produto?</h2>
          <p>
            “{product.name}” será desativado e deixará de aparecer no cardápio e no totem.
            Pedidos antigos continuam com o produto no histórico.
          </p>
        </div>
      </div>
      <Alert variant="info">
        Você pode reativá-lo depois na lista de produtos. Apenas administradores veem esta opção.
      </Alert>
      <div className="modal-actions">
        <Button variant="outline" onClick={onCancel} data-autofocus>
          Cancelar
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={deleting}>
          <Trash2 size={18} aria-hidden="true" />
          {deleting ? 'Excluindo...' : 'Excluir produto'}
        </Button>
      </div>
    </Modal>
  )
}

// Enquanto a IA calcula a tabela de algum produto, a lista se atualiza sozinha.
const POLL_MS = 5000

function SourceChip({ source }) {
  return source === 'manual'
    ? <span className="source-chip source-chip-manual"><Pencil size={12} aria-hidden="true" />Manual</span>
    : <span className="source-chip"><Sparkles size={12} aria-hidden="true" />IA</span>
}

function NutritionCell({ product }) {
  const state = nutritionState(product)
  if (state === 'pending') {
    return <span className="kcal-chip kcal-chip-pending" role="status"><Sparkles size={12} aria-hidden="true" />Calculando…</span>
  }
  if (state === 'unavailable') return <span className="kcal-chip kcal-chip-unavailable">Indisponível</span>
  return (
    <span className="nutrition-cell">
      <SourceChip source={product.nutrition.source} />
      <span><strong>{formatInteger(product.nutrition.calories_kcal)} kcal</strong> · {formatServing(product.nutrition)}</span>
    </span>
  )
}

export default function AdminPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const location = useLocation()
  const navigate = useNavigate()

  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [flash, setFlash] = useState(location.state?.flash ?? null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [showInactive, setShowInactive] = useState(true)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Limpa a mensagem vinda do formulário do histórico, para não reaparecer ao recarregar.
  useEffect(() => {
    if (location.state?.flash) navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate])

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      setProducts(await listProducts({ activeOnly: false }))
      setStatus('ready')
    } catch (err) {
      if (silent) return
      setLoadError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const calculating = products.some((p) => nutritionState(p) === 'pending')
  useEffect(() => {
    if (!calculating) return undefined
    const timer = setInterval(() => load({ silent: true }), POLL_MS)
    return () => clearInterval(timer)
  }, [calculating, load])

  async function retryNutrition(product) {
    try {
      const updated = await retryProductNutrition(product.id)
      setProducts((current) => current.map((p) => (p.id === updated.id ? updated : p)))
    } catch (err) {
      setFlash({ variant: 'error', title: 'Não foi possível pedir uma nova estimativa.', text: err.message })
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await deleteProduct(toDelete.id)
      setFlash({ variant: 'success', title: 'Produto excluído.', text: `“${toDelete.name}” foi desativado.` })
      await load()
    } catch (err) {
      setFlash({ variant: 'error', title: 'Não foi possível excluir.', text: err.message })
    } finally {
      setDeleting(false)
      setToDelete(null)
    }
  }

  async function reactivate(product) {
    try {
      await updateProduct(product.id, { is_active: true })
      setFlash({ variant: 'success', title: 'Produto reativado.', text: `“${product.name}” voltou ao cardápio.` })
      await load()
    } catch (err) {
      setFlash({ variant: 'error', title: 'Não foi possível reativar.', text: err.message })
    }
  }

  const inactiveCount = products.filter((p) => !p.is_active).length
  const term = search.trim().toLowerCase()
  const visible = products
    .filter((p) => showInactive || p.is_active)
    .filter((p) => !category || p.category === category)
    .filter(
      (p) =>
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.description ?? '').toLowerCase().includes(term),
    )

  return (
    <div className="container page">
      <header className="page-header">
        <div>
          <h1>Produtos do cardápio</h1>
          {status === 'ready' && (
            <p className="page-subtitle">
              {products.length} {products.length === 1 ? 'produto' : 'produtos'}
              {inactiveCount > 0 &&
                ` · ${inactiveCount} ${inactiveCount === 1 ? 'desativado' : 'desativados'}`}
              {' · a IA estima a nutrição alguns segundos depois de cada cadastro'}
            </p>
          )}
          {status === 'ready' && (
            <p className="nutrition-legend">
              <strong>Nutrição:</strong>
              <SourceChip source="ai" /> estimada automaticamente
              <SourceChip source="manual" /> editada pela equipe; a IA não sobrescreve
            </p>
          )}
        </div>
        <Link to="/admin/produtos/novo" className="btn btn-primary">
          <Plus size={18} aria-hidden="true" />
          Novo produto
        </Link>
      </header>

      {flash && (
        <Alert variant={flash.variant} title={flash.title} onClose={() => setFlash(null)}>
          {flash.text}
        </Alert>
      )}

      {status === 'loading' && <Loading text="Carregando produtos..." />}

      {status === 'error' && (
        <Alert variant="error" title="Não foi possível carregar os produtos.">{loadError}</Alert>
      )}

      {status === 'ready' && (
        <>
          <div className="toolbar">
            <label className="search">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                placeholder="Buscar produto"
                aria-label="Buscar produto"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              className="select"
              aria-label="Filtrar por categoria"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Mostrar desativados
            </label>
          </div>

          {products.length === 0 ? (
            <EmptyState
              title="Nenhum produto cadastrado."
              action={
                <Link to="/admin/produtos/novo" className="btn btn-primary">
                  <Plus size={18} aria-hidden="true" />
                  Cadastrar o primeiro produto
                </Link>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState title="Nenhum produto encontrado.">
              Ajuste a busca ou os filtros.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th className="num">Preço</th>
                    <th>Nutrição (porção)</th>
                    <th>Situação</th>
                    <th className="actions-col">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => (
                    <tr key={p.id} className={p.is_active ? '' : 'row-inactive'}>
                      <td>
                        <div className="cell-product">
                          <strong>{p.name}</strong>
                          {p.description && <span>{p.description}</span>}
                        </div>
                      </td>
                      <td><CategoryBadge category={p.category} /></td>
                      <td className="num price-cell">{formatPrice(p.price)}</td>
                      <td className="cell-nutrition"><NutritionCell product={p} /></td>
                      <td><StatusBadge active={p.is_active} /></td>
                      <td>
                        <div className="row-actions">
                          {p.is_active ? (
                            <>
                              {p.nutrition_status === 'failed' && (
                                <Button variant="outline" className="btn-sm" onClick={() => retryNutrition(p)}>
                                  <RefreshCw size={16} aria-hidden="true" />
                                  Tentar de novo
                                </Button>
                              )}
                              <Link to={`/admin/produtos/${p.id}/editar`} className="btn btn-outline btn-sm">
                                <Pencil size={16} aria-hidden="true" />
                                Editar
                              </Link>
                              {isAdmin && (
                                <Button variant="outline-danger" className="btn-sm" onClick={() => setToDelete(p)}>
                                  <Trash2 size={16} aria-hidden="true" />
                                  Excluir
                                </Button>
                              )}
                            </>
                          ) : (
                            isAdmin && (
                              <Button className="btn-sm" onClick={() => reactivate(p)}>
                                <RotateCcw size={16} aria-hidden="true" />
                                Reativar
                              </Button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {toDelete && (
        <DeleteDialog
          product={toDelete}
          deleting={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

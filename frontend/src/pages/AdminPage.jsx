import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { deleteProduct, listProducts, updateProduct } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { CATEGORIES, formatPrice } from '../utils/format'
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

  const load = useCallback(async () => {
    try {
      setProducts(await listProducts({ activeOnly: false }))
      setStatus('ready')
    } catch (err) {
      setLoadError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
                      <td><StatusBadge active={p.is_active} /></td>
                      <td>
                        <div className="row-actions">
                          {p.is_active ? (
                            <>
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

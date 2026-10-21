import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { createProduct, getProduct, updateProduct } from '../services/api'
import { CATEGORIES, parsePrice, priceToInput } from '../utils/format'
import { Alert, Button, Field, Loading } from '../components/ui'

const DESCRIPTION_MAX = 200
const EMPTY = { name: '', description: '', price: '', category: '' }

function validate(values) {
  const errors = {}
  if (!values.name.trim()) errors.name = 'Informe o nome do produto.'
  const price = parsePrice(values.price)
  if (Number.isNaN(price)) errors.price = 'Informe um preço válido.'
  else if (price <= 0) errors.price = 'O preço deve ser maior que zero.'
  if (!values.category) errors.category = 'Selecione uma categoria.'
  if (values.description.length > DESCRIPTION_MAX) {
    errors.description = `Use no máximo ${DESCRIPTION_MAX} caracteres.`
  }
  return errors
}

// Usada para cadastro (/admin/produtos/novo) e edição (/admin/produtos/:id/editar).
export default function ProductFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [status, setStatus] = useState(isEdit ? 'loading' : 'ready')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    getProduct(id)
      .then((p) => {
        setValues({
          name: p.name,
          description: p.description ?? '',
          price: priceToInput(p.price),
          category: p.category,
        })
        setStatus('ready')
      })
      .catch((err) => {
        setSubmitError(err.status === 404 ? 'Este produto não existe ou foi removido.' : err.message)
        setStatus('error')
      })
  }, [id, isEdit])

  function update(field, value) {
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)
    setSubmitError('')
    if (Object.keys(found).length > 0) return

    const payload = {
      name: values.name.trim(),
      description: values.description.trim(),
      price: parsePrice(values.price),
      category: values.category,
    }

    setSubmitting(true)
    try {
      const saved = isEdit ? await updateProduct(id, payload) : await createProduct(payload)
      navigate('/admin', {
        state: {
          flash: {
            variant: 'success',
            title: isEdit ? 'Produto salvo.' : 'Produto cadastrado.',
            text: isEdit
              ? `“${saved.name}” foi atualizado.`
              : `“${saved.name}” já aparece no cardápio.`,
          },
        },
      })
    } catch (err) {
      setSubmitError(err.message)
      setSubmitting(false)
    }
  }

  const errorCount = Object.values(errors).filter(Boolean).length
  const title = isEdit ? 'Editar produto' : 'Novo produto'

  return (
    <div className="container page page-narrow">
      <nav className="breadcrumb" aria-label="Caminho">
        <Link to="/admin">Produtos</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span>{title}</span>
      </nav>
      <h1>{title}</h1>

      {errorCount > 0 && (
        <Alert
          variant="error"
          title={errorCount === 1 ? '1 campo precisa de atenção.' : `${errorCount} campos precisam de atenção.`}
        >
          Corrija os campos destacados para salvar.
        </Alert>
      )}
      {submitError && <Alert variant="error" title="Não foi possível salvar.">{submitError}</Alert>}

      {status === 'loading' && <Loading text="Carregando produto..." />}

      {status === 'ready' && (
        <form className="card form" onSubmit={handleSubmit} noValidate>
          <Field label="Nome do produto" id="name" required error={errors.name}>
            <input
              id="name"
              placeholder="Ex.: Cappuccino"
              value={values.name}
              aria-invalid={!!errors.name}
              onChange={(e) => update('name', e.target.value)}
            />
          </Field>

          <Field
            label="Descrição"
            id="description"
            optional
            error={errors.description}
            hint={`${values.description.length}/${DESCRIPTION_MAX}`}
          >
            <textarea
              id="description"
              rows={3}
              maxLength={DESCRIPTION_MAX}
              placeholder="Uma frase curta que ajude o cliente a escolher."
              value={values.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </Field>

          <div className="form-row">
            <Field label="Preço" id="price" required error={errors.price}>
              <div className={`input-group ${errors.price ? 'is-invalid' : ''}`}>
                <span className="input-prefix">R$</span>
                <input
                  id="price"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={values.price}
                  aria-invalid={!!errors.price}
                  onChange={(e) => update('price', e.target.value.replace(/[^\d.,]/g, ''))}
                />
              </div>
            </Field>

            <Field label="Categoria" id="category" required error={errors.category}>
              <select
                id="category"
                className="select"
                value={values.category}
                aria-invalid={!!errors.category}
                onChange={(e) => update('category', e.target.value)}
              >
                <option value="">Selecione...</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <p className="form-note"><span className="required">*</span> Campos obrigatórios</p>

          <div className="form-actions">
            <Link to="/admin" className="btn btn-outline">Cancelar</Link>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar produto'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

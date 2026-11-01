import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { createProduct, getProduct, updateProduct } from '../services/api'
import { CATEGORIES, parsePrice, priceToInput } from '../utils/format'
import { EMPTY_NUTRITION, NUTRITION_FIELDS, isValidImageUrl, nutritionToInputs,
  parseNutritionInputs } from '../utils/nutrition'
import { Alert, Button, Field, Loading } from '../components/ui'

const DESCRIPTION_MAX = 200
const EMPTY = { name: '', description: '', price: '', category: '', image_url: '' }

function validate(values, nutritionValues, nutritionSource) {
  const { nutrition, errors: nutritionErrors } = parseNutritionInputs(nutritionValues, nutritionSource)
  const errors = Object.fromEntries(
    Object.entries(nutritionErrors).map(([key, message]) => [`nutrition.${key}`, message]),
  )
  if (!values.name.trim()) errors.name = 'Informe o nome do produto.'
  const price = parsePrice(values.price)
  if (Number.isNaN(price)) errors.price = 'Informe um preço válido.'
  else if (price <= 0) errors.price = 'O preço deve ser maior que zero.'
  if (!values.category) errors.category = 'Selecione uma categoria.'
  if (values.description.length > DESCRIPTION_MAX) {
    errors.description = `Use no máximo ${DESCRIPTION_MAX} caracteres.`
  }
  if (!isValidImageUrl(values.image_url)) {
    errors.image_url = 'Informe um endereço que comece com http:// ou https://.'
  }
  return { errors, nutrition }
}

// Usada para cadastro (/admin/produtos/novo) e edição (/admin/produtos/:id/editar).
export default function ProductFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [values, setValues] = useState(EMPTY)
  const [nutritionValues, setNutritionValues] = useState(EMPTY_NUTRITION)
  // Origem da tabela ("manual" ou "ai"); editar qualquer valor torna-a manual.
  const [nutritionSource, setNutritionSource] = useState('manual')
  const [previewFailed, setPreviewFailed] = useState(false)
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
          image_url: p.image_url ?? '',
        })
        setNutritionValues(nutritionToInputs(p.nutrition))
        setNutritionSource(p.nutrition?.source ?? 'manual')
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
    if (field === 'image_url') setPreviewFailed(false)
  }

  function updateNutrition(field, value) {
    setNutritionValues((v) => ({ ...v, [field]: value }))
    setNutritionSource('manual')
    const key = `nutrition.${field}`
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const { errors: found, nutrition } = validate(values, nutritionValues, nutritionSource)
    setErrors(found)
    setSubmitError('')
    if (Object.keys(found).length > 0) return

    const payload = {
      name: values.name.trim(),
      description: values.description.trim(),
      price: parsePrice(values.price),
      category: values.category,
      image_url: values.image_url.trim() || null,
      nutrition,
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

          <Field
            label="URL da imagem"
            id="image_url"
            optional
            error={errors.image_url}
            hint="Link direto para uma foto (.jpg, .png ou .webp)."
          >
            <input
              id="image_url"
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={values.image_url}
              aria-invalid={!!errors.image_url}
              onChange={(e) => update('image_url', e.target.value)}
            />
          </Field>
          {values.image_url.trim() && isValidImageUrl(values.image_url) && (
            previewFailed
              ? <p className="form-note">Não foi possível carregar a imagem deste endereço.</p>
              : (
                <img
                  className="image-preview"
                  src={values.image_url.trim()}
                  alt="Pré-visualização da imagem do produto"
                  onError={() => setPreviewFailed(true)}
                />
              )
          )}

          <fieldset className="form-section">
            <legend>
              Tabela nutricional <span className="optional">(opcional)</span>
            </legend>
            <p className="form-note">
              Valores médios por porção. Preencha todos os campos ou deixe todos vazios.
              {nutritionSource === 'ai' && ' Valores atuais estimados por IA; revise antes de salvar.'}
            </p>
            <div className="nutrition-grid">
              {NUTRITION_FIELDS.map((f) => (
                <Field
                  key={f.key}
                  label={`${f.label} (${f.unit})`}
                  id={`nutrition-${f.key}`}
                  error={errors[`nutrition.${f.key}`]}
                >
                  <input
                    id={`nutrition-${f.key}`}
                    inputMode="decimal"
                    placeholder="0"
                    value={nutritionValues[f.key]}
                    aria-invalid={!!errors[`nutrition.${f.key}`]}
                    onChange={(e) => updateNutrition(f.key, e.target.value.replace(/[^\d.,]/g, ''))}
                  />
                </Field>
              ))}
            </div>
          </fieldset>

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

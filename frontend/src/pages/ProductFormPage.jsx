import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Pencil, Sparkles } from 'lucide-react'
import { createProduct, getProduct, updateProduct } from '../services/api'
import { CATEGORIES, parsePrice, priceToInput } from '../utils/format'
import { EMPTY_NUTRITION, MACROS, NUTRITION_FIELDS, SERVING_UNITS, isValidImageUrl, nutritionState,
  nutritionToInputs, parseNutritionInputs } from '../utils/nutrition'
import { Alert, Button, Field, Loading } from '../components/ui'
import { AiBadge } from '../components/Nutrition'

const DESCRIPTION_MAX = 200
const EMPTY = { name: '', description: '', price: '', category: '', image_url: '' }

const MACRO_CLASS = Object.fromEntries(MACROS.map((m) => [m.key, m.className]))

// Sem edição manual a tabela não é enviada: continua com a IA (Edge Function "macros").
function validate(values, nutritionValues, editingNutrition) {
  const { nutrition, errors: nutritionErrors } = editingNutrition
    ? parseNutritionInputs(nutritionValues)
    : { nutrition: undefined, errors: {} }
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
  // Produto como veio da API: origem/estado da tabela e texto que a IA usou.
  const [original, setOriginal] = useState(null)
  // Valores da IA ficam somente leitura até a equipe escolher editar.
  const [editingNutrition, setEditingNutrition] = useState(false)
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
        setOriginal(p)
        setEditingNutrition(p.nutrition?.source === 'manual')
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
    const key = `nutrition.${field}`
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function restoreAiNutrition() {
    setEditingNutrition(false)
    setNutritionValues(nutritionToInputs(original?.nutrition?.source === 'ai' ? original.nutrition : null))
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([key]) => !key.startsWith('nutrition.'))))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const { errors: found, nutrition } = validate(values, nutritionValues, editingNutrition)
    setErrors(found)
    setSubmitError('')
    if (Object.keys(found).length > 0) return

    const payload = {
      name: values.name.trim(),
      description: values.description.trim(),
      price: parsePrice(values.price),
      category: values.category,
      image_url: values.image_url.trim() || null,
      ...(editingNutrition && { nutrition }),
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
  const aiState = original ? nutritionState(original) : 'new'
  const fromAi = !editingNutrition && original?.nutrition?.source === 'ai'
  const textChanged = original && (values.name.trim() !== original.name
    || values.description.trim() !== (original.description ?? ''))
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

          <section className="form-section nutrition-form" aria-labelledby="nutrition-title">
            <header className="nutrition-form-head">
              <h2 id="nutrition-title">Informação nutricional da porção</h2>
              {fromAi && <AiBadge />}
            </header>

            {(editingNutrition || fromAi) && (
              <div className="nutrition-grid">
                {NUTRITION_FIELDS.map((f) => (
                  <Field
                    key={f.key}
                    label={MACRO_CLASS[f.key]
                      ? <><i className={`macro-dot ${MACRO_CLASS[f.key]}`} aria-hidden="true" /> {f.label}</>
                      : f.label}
                    id={`nutrition-${f.key}`}
                    error={errors[`nutrition.${f.key}`]}
                  >
                    <div className={`input-group ${errors[`nutrition.${f.key}`] ? 'is-invalid' : ''} ${fromAi ? 'is-readonly' : ''}`}>
                      <input
                        id={`nutrition-${f.key}`}
                        inputMode="decimal"
                        placeholder="0"
                        readOnly={fromAi}
                        value={nutritionValues[f.key]}
                        aria-invalid={!!errors[`nutrition.${f.key}`]}
                        onChange={(e) => updateNutrition(f.key, e.target.value.replace(/[^\d.,]/g, ''))}
                      />
                      {f.key === 'serving_size' ? (
                        <select
                          className="input-suffix-select"
                          aria-label="Unidade da porção"
                          disabled={fromAi}
                          value={nutritionValues.serving_unit}
                          onChange={(e) => updateNutrition('serving_unit', e.target.value)}
                        >
                          {SERVING_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      ) : <span className="input-suffix">{f.unit}</span>}
                    </div>
                  </Field>
                ))}
              </div>
            )}

            {!editingNutrition && !fromAi && (
              <p className="nutrition-form-state">
                {aiState === 'pending'
                  ? <span className="kcal-chip kcal-chip-pending"><Sparkles size={12} aria-hidden="true" />Calculando…</span>
                  : <Sparkles size={16} aria-hidden="true" />}
                {aiState === 'new' && 'A IA estima a tabela automaticamente alguns segundos depois do cadastro.'}
                {aiState === 'pending' && 'A IA está estimando a tabela deste produto.'}
                {aiState === 'unavailable' && 'A IA não conseguiu estimar a tabela. Preencha manualmente ou use “Tentar de novo” na lista de produtos.'}
              </p>
            )}

            <div className="nutrition-form-foot">
              <p className="form-note">
                {editingNutrition
                  ? 'Valores informados pela equipe: a IA não os sobrescreve. Deixe todos vazios para a IA calcular.'
                  : fromAi
                    ? textChanged
                      ? 'O nome ou a descrição mudaram: ao salvar, a IA estima a tabela de novo.'
                      : 'Valores médios estimados pela IA no cadastro. Somente leitura enquanto vierem da IA.'
                    : 'Valores médios por porção.'}
              </p>
              {editingNutrition ? (
                original?.nutrition?.source !== 'manual' && (
                  <Button variant="outline" onClick={restoreAiNutrition}>
                    <Sparkles size={16} aria-hidden="true" /> Usar estimativa da IA
                  </Button>
                )
              ) : (
                <Button variant="outline" onClick={() => setEditingNutrition(true)}>
                  <Pencil size={16} aria-hidden="true" /> {fromAi ? 'Editar valores' : 'Preencher manualmente'}
                </Button>
              )}
            </div>
          </section>

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

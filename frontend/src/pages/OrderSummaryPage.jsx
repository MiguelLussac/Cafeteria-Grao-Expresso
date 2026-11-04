import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ImageIcon, Minus, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Alert, Button, EmptyState, Field } from '../components/ui'
import { KcalPill } from '../components/Nutrition'
import { useOrder } from '../context/OrderContext'
import { formatPrice } from '../utils/format'
import { formatInteger, orderNutrition } from '../utils/nutrition'
import { estimatedTotal } from '../utils/order'

function ItemKcal({ item }) {
  if (!item.nutrition) return <span className="kcal-chip kcal-chip-unavailable">Nutrição indisponível</span>
  const kcal = item.nutrition.calories_kcal
  return item.quantity > 1
    ? <KcalPill kcal={kcal * item.quantity} detail={`${item.quantity} × ${formatInteger(kcal)} kcal`} separator="" />
    : <KcalPill kcal={kcal} detail="por porção" separator="" />
}

export default function OrderSummaryPage({ totem = false }) {
  const { items, details, setDetails, setQuantity, removeItem, createdOrder, isSubmitting, confirmOrder } = useOrder()
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const menuPath = totem ? '/totem/cardapio' : '/'
  const prefix = totem ? '/totem' : ''

  if (createdOrder) return <Navigate to={`${prefix}/pedido/${createdOrder.id}/pagamento`} replace />

  async function confirm(event) {
    event.preventDefault()
    setError('')
    try {
      const order = await confirmOrder()
      navigate(`${prefix}/pedido/${order.id}/pagamento`, { replace: true })
    } catch (err) {
      setError(err.message || 'Não foi possível registrar o pedido. Tente novamente.')
    }
  }

  function change(event) {
    setDetails((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  const nutrition = orderNutrition(items)

  return (
    <div className="container page">
      <Link to={menuPath} className="link-back"><ArrowLeft size={16} aria-hidden="true" /> Continuar escolhendo</Link>
      <header className="page-header">
        <h1>Revise seu pedido</h1>
      </header>
      {!items.length ? (
        <EmptyState title="Seu pedido está vazio." action={<Link className="btn btn-primary" to={menuPath}>Escolher produtos</Link>}>
          Selecione ao menos um produto no cardápio.
        </EmptyState>
      ) : (
        <form className="checkout" onSubmit={confirm} aria-busy={isSubmitting}>
          <div className="checkout-main card review-items">
            <ul aria-label="Itens do pedido">
              {items.map((item) => (
                <li key={item.id}>
                  <span className={`item-thumb product-media-${item.category}`} aria-hidden="true">
                    <ImageIcon size={22} />
                  </span>
                  <div className="review-item-info">
                    <strong>{item.name}</strong>
                    <span className="review-item-unit">{formatPrice(item.price)} cada</span>
                    <ItemKcal item={item} />
                  </div>
                  <div className="stepper" role="group" aria-label={`Quantidade de ${item.name}`}>
                    {item.quantity > 1 ? (
                      <button type="button" disabled={isSubmitting} aria-label={`Diminuir ${item.name}`}
                        onClick={() => setQuantity(item.id, item.quantity - 1)}><Minus size={18} /></button>
                    ) : (
                      <button type="button" className="stepper-remove" disabled={isSubmitting} aria-label={`Remover ${item.name}`}
                        onClick={() => removeItem(item.id)}><Trash2 size={18} /></button>
                    )}
                    <output aria-live="polite">{item.quantity}</output>
                    <button type="button" disabled={isSubmitting} aria-label={`Aumentar ${item.name}`}
                      onClick={() => setQuantity(item.id, item.quantity + 1)}><Plus size={18} /></button>
                  </div>
                  <strong className="review-item-total">
                    {formatPrice(Math.round(item.price * 100) * item.quantity / 100)}
                  </strong>
                </li>
              ))}
            </ul>
            <p className="ai-note review-note">
              <Sparkles size={12} aria-hidden="true" />
              Calorias: kcal da porção × quantidade, estimadas por IA.
            </p>
          </div>

          <aside className="checkout-side">
            <fieldset className="card order-details" disabled={isSubmitting}>
              <legend>Dados do pedido</legend>
              <Field label="Seu nome" id="customer_name" optional>
                <input id="customer_name" name="customer_name" maxLength={120} value={details.customer_name} onChange={change} placeholder="Balcão" />
              </Field>
              <fieldset className="order-service-mode">
                <legend>Onde vai consumir? <span className="required">*</span></legend>
                <div className="order-service-options">
                  {['Mesa', 'Retirada'].map((option) => (
                    <label key={option} className={details.table_number === option ? 'is-selected' : ''}>
                      <input type="radio" name="table_number" value={option}
                        checked={details.table_number === option} onChange={change} required />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Observações" id="notes" optional>
                <textarea id="notes" name="notes" rows={2} value={details.notes} onChange={change} placeholder="Ex.: café sem açúcar" />
              </Field>
            </fieldset>

            {error && <Alert variant="error" title="Pedido não confirmado.">{error}</Alert>}

            <div className="card checkout-total">
              <div className="checkout-total-values">
                <div>
                  <span>Total</span>
                  <strong className="checkout-price">{formatPrice(estimatedTotal(items))}</strong>
                </div>
                {nutrition.status !== 'empty' && (
                  <div className="checkout-kcal">
                    <span><Sparkles size={12} aria-hidden="true" /> Estimativa do pedido</span>
                    <strong>
                      {formatInteger(nutrition.totals.calories_kcal)} kcal
                      {nutrition.status === 'partial' && <small> parcial</small>}
                    </strong>
                  </div>
                )}
              </div>
              <Button type="submit" block disabled={isSubmitting}>
                {isSubmitting ? 'Registrando pedido...' : <>Ir para o pagamento <ArrowRight size={18} aria-hidden="true" /></>}
              </Button>
              <p className="form-note">O valor definitivo é calculado ao registrar o pedido.</p>
            </div>
          </aside>
        </form>
      )}
    </div>
  )
}

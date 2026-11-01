import { useState } from 'react'
import { Button, CategoryBadge } from './ui'
import { useOrder } from '../context/OrderContext'
import { formatPrice } from '../utils/format'
import { NUTRITION_FIELDS, formatAmount } from '../utils/nutrition'

function NutritionDetails({ nutrition }) {
  const [serving, ...macros] = NUTRITION_FIELDS
  return (
    <details className="nutrition">
      <summary>Tabela nutricional</summary>
      <p className="nutrition-serving">
        Porção de {formatAmount(nutrition[serving.key])} {serving.unit}
      </p>
      <dl>
        {macros.map((f) => (
          <div key={f.key}>
            <dt>{f.label}</dt>
            <dd>{formatAmount(nutrition[f.key])} {f.unit}</dd>
          </div>
        ))}
      </dl>
      {nutrition.source === 'ai' && <p className="nutrition-note">Valores médios estimados por IA.</p>}
    </details>
  )
}

export default function ProductCard({ product }) {
  const { addItem, isSubmitting, createdOrder } = useOrder()
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <article className="product-card">
      {product.image_url && !imageFailed && (
        <img className="product-image" src={product.image_url} alt="" loading="lazy"
          onError={() => setImageFailed(true)} />
      )}
      <CategoryBadge category={product.category} />
      <h3>{product.name}</h3>
      {product.description && <p>{product.description}</p>}
      {product.nutrition && <NutritionDetails nutrition={product.nutrition} />}
      <strong className="product-price">{formatPrice(product.price)}</strong>
      <Button block disabled={!product.is_active || isSubmitting || !!createdOrder}
        onClick={() => addItem(product)} aria-label={`Adicionar ${product.name}`}>
        Adicionar ao pedido
      </Button>
    </article>
  )
}

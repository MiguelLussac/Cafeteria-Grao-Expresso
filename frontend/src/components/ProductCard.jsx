import { useState } from 'react'
import { ImageIcon, Plus } from 'lucide-react'
import { Button, CategoryBadge } from './ui'
import { KcalChip, NutritionDisclosure } from './Nutrition'
import { useOrder } from '../context/OrderContext'
import { formatPrice } from '../utils/format'

export default function ProductCard({ product }) {
  const { addItem, isSubmitting, createdOrder } = useOrder()
  const [imageFailed, setImageFailed] = useState(false)
  const hasImage = product.image_url && !imageFailed
  return (
    <article className="product-card">
      <div className={`product-media product-media-${product.category}`}>
        {hasImage
          ? <img src={product.image_url} alt="" loading="lazy" onError={() => setImageFailed(true)} />
          : <ImageIcon className="product-media-placeholder" size={32} aria-hidden="true" />}
        <CategoryBadge category={product.category} />
      </div>
      <div className="product-body">
        <h3>{product.name}</h3>
        {product.description && <p className="product-description">{product.description}</p>}
        <KcalChip product={product} />
        {product.nutrition && <NutritionDisclosure nutrition={product.nutrition} />}
        <div className="product-footer">
          <strong className="product-price">{formatPrice(product.price)}</strong>
          <Button disabled={!product.is_active || isSubmitting || !!createdOrder}
            onClick={() => addItem(product)} aria-label={`Adicionar ${product.name} ao pedido`}>
            <Plus size={16} aria-hidden="true" />
            <span>Adicionar<span className="add-suffix"> ao pedido</span></span>
          </Button>
        </div>
      </div>
    </article>
  )
}

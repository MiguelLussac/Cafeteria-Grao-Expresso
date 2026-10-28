import { Button, CategoryBadge } from './ui'
import { useOrder } from '../context/OrderContext'
import { formatPrice } from '../utils/format'

export default function ProductCard({ product }) {
  const { addItem, isSubmitting, createdOrder } = useOrder()
  return (
    <article className="product-card">
      <CategoryBadge category={product.category} />
      <h3>{product.name}</h3>
      {product.description && <p>{product.description}</p>}
      <strong className="product-price">{formatPrice(product.price)}</strong>
      <Button block disabled={!product.is_active || isSubmitting || !!createdOrder}
        onClick={() => addItem(product)} aria-label={`Adicionar ${product.name}`}>
        Adicionar ao pedido
      </Button>
    </article>
  )
}

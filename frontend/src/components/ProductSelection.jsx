import { Link } from 'react-router-dom'
import { Button } from './ui'
import { useOrder } from '../context/OrderContext'
import { formatPrice } from '../utils/format'
import { estimatedTotal, itemsQuantity } from '../utils/order'

export default function ProductSelection() {
  const { items, setQuantity, removeItem, createdOrder, isSubmitting, startNewOrder } = useOrder()
  const count = itemsQuantity(items)
  const locked = isSubmitting || !!createdOrder
  return (
    <section className="selection card" aria-label="Seu pedido">
      <div className="selection-heading">
        <h2>Seu pedido</h2>
        <span role="status">{count} {count === 1 ? 'item selecionado' : 'itens selecionados'}</span>
      </div>
      {createdOrder ? (
        <>
          <p>Pedido #{createdOrder.id} já registrado. Total definitivo: {formatPrice(createdOrder.total_amount)}.</p>
          <div className="selection-actions">
            <Link className="btn btn-primary" to={`/pedido/${createdOrder.id}/pagamento`}>Consultar pedido</Link>
            <Button variant="outline" onClick={startNewOrder}>Iniciar outro pedido</Button>
          </div>
        </>
      ) : (
        <>
          {!items.length && <p>Adicione produtos do cardápio para começar.</p>}
          <ul className="selection-items">
            {items.map((item) => (
              <li key={item.id}>
                <div><strong>{item.name}</strong><p>{formatPrice(item.price)} por unidade</p></div>
                <div className="quantity-controls">
                  <Button variant="outline" disabled={locked || item.quantity <= 1}
                    aria-label={`Diminuir quantidade de ${item.name}`} onClick={() => setQuantity(item.id, item.quantity - 1)}>−</Button>
                  <label className="quantity-field">Quantidade
                    <input type="number" min="1" step="1" value={item.quantity} disabled={locked}
                      aria-label={`Quantidade de ${item.name}`} onChange={(event) => setQuantity(item.id, event.target.valueAsNumber)} />
                  </label>
                  <Button variant="outline" disabled={locked || item.quantity >= Number.MAX_SAFE_INTEGER}
                    aria-label={`Aumentar quantidade de ${item.name}`} onClick={() => setQuantity(item.id, item.quantity + 1)}>+</Button>
                  <Button variant="outline-danger" disabled={locked} onClick={() => removeItem(item.id)}
                    aria-label={`Remover ${item.name}`}>Remover</Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="selection-actions">
            <strong>Total estimado: {formatPrice(estimatedTotal(items))}</strong>
            {items.length > 0 && !isSubmitting ? <Link className="btn btn-primary" to="/pedido/resumo">Revisar pedido</Link> :
              <Button disabled>Revisar pedido</Button>}
          </div>
        </>
      )}
    </section>
  )
}

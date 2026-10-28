import { createContext, useContext, useState } from 'react'
import { createOrder } from '../services/api'
import { addProduct, changeQuantity, createOrderSubmitter, removeProduct } from '../utils/order'

const OrderContext = createContext(null)

export function OrderProvider({ children }) {
  // Contrato com a seleção: [{id, name, price, quantity}].
  const [items, setItems] = useState([])
  const [details, setDetails] = useState({ customer_name: '', table_number: '', notes: '' })
  const [createdOrder, setCreatedOrder] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submit, setSubmit] = useState(() => createOrderSubmitter(createOrder))
  const locked = isSubmitting || !!createdOrder

  function addItem(product) {
    if (!locked) setItems((current) => addProduct(current, product))
  }

  function setQuantity(id, quantity) {
    if (!locked) setItems((current) => changeQuantity(current, id, quantity))
  }

  function removeItem(id) {
    if (!locked) setItems((current) => removeProduct(current, id))
  }

  function startNewOrder() {
    if (isSubmitting) return
    setItems([])
    setDetails({ customer_name: '', table_number: '', notes: '' })
    setCreatedOrder(null)
    setSubmit(() => createOrderSubmitter(createOrder))
  }

  async function confirmOrder() {
    setIsSubmitting(true)
    try {
      const order = await submit(items, details)
      setCreatedOrder(order)
      return order
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <OrderContext.Provider value={{ items, details, setDetails, addItem, setQuantity,
      removeItem, startNewOrder, createdOrder, isSubmitting, confirmOrder }}>
      {children}
    </OrderContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOrder() {
  return useContext(OrderContext)
}

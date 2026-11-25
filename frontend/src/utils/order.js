// O preço local serve apenas para conferência. A API calcula o valor definitivo.
export function addProduct(items, product) {
  if (!product.is_active || !Number.isSafeInteger(product.id) || product.id <= 0 ||
    !Number.isFinite(product.price) || product.price <= 0) return items
  const current = items.find((item) => item.id === product.id)
  if (current) return changeQuantity(items, product.id, current.quantity + 1)
  // category, image_url e nutrition alimentam a miniatura e as calorias na revisão do pedido.
  return [...items, { id: product.id, name: product.name, price: product.price, quantity: 1,
    category: product.category, image_url: product.image_url ?? null, nutrition: product.nutrition ?? null }]
}

export function changeQuantity(items, id, quantity) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return items
  return items.map((item) => item.id === id ? { ...item, quantity } : item)
}

export function removeProduct(items, id) {
  return items.filter((item) => item.id !== id)
}

export function itemsQuantity(items) {
  return items.reduce((count, item) => count + item.quantity, 0)
}

export function estimatedTotal(items) {
  return items.reduce((total, item) => total + Math.round(item.price * 100) * item.quantity, 0) / 100
}

// Canais de origem aceitos pela API. O site só faz pedidos para retirada no balcão;
// no totem o cliente escolhe entre Mesa e Retirada.
export const CHANNELS = ['site', 'totem', 'balcao']

export function orderPayload(items, details, channel = 'totem') {
  if (!CHANNELS.includes(channel)) throw new Error('Canal do pedido inválido.')
  if (!items.length) throw new Error('Selecione ao menos um produto para confirmar o pedido.')
  if (items.some((item) => !Number.isInteger(item.id) || item.id <= 0 ||
    !Number.isInteger(item.quantity) || item.quantity <= 0)) {
    throw new Error('Revise os produtos e as quantidades antes de confirmar.')
  }
  const tableNumber = channel === 'site' ? 'Retirada' : details.table_number
  if (!['Mesa', 'Retirada'].includes(tableNumber)) {
    throw new Error('Escolha Mesa ou Retirada antes de confirmar o pedido.')
  }
  return {
    items: items.map(({ id, quantity }) => ({ product_id: id, quantity })),
    customer_name: details.customer_name.trim(),
    table_number: tableNumber,
    notes: details.notes.trim(),
    channel,
  }
}

// Compartilhado durante o fluxo para impedir dois POSTs por cliques simultâneos.
// Uma confirmação concluída sempre reutiliza o pedido criado.
export function createOrderSubmitter(createOrder) {
  let pending = null
  let created = null
  return function submit(items, details, channel) {
    if (created) return Promise.resolve(created)
    if (pending) return pending
    const payload = orderPayload(items, details, channel)
    pending = Promise.resolve().then(() => createOrder(payload)).then((order) => {
      created = order
      return order
    }).finally(() => { pending = null })
    return pending
  }
}

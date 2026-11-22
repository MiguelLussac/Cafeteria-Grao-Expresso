// Conversa do totem com o assistente de pedidos (POST /api/v1/assistant/chat).
// A API devolve sempre o carrinho completo, já conferido contra o cardápio.

export const ASSISTANT_GREETING =
  'Olá! Sou o assistente da Grão Expresso. Me diz o que você quer, do jeito que pediria no balcão.'

export const ASSISTANT_SUGGESTIONS = [
  'O que vocês têm de café?',
  'Quero um capuccino e um pão de queijo',
  'Tem alguma opção fitness?',
]

export const MAX_MESSAGE_CHARS = 500

// A saudação é só da tela; a API recebe a conversa a partir do cliente.
export function historyForApi(messages) {
  return messages
    .filter((m) => !m.local)
    .map(({ role, content }) => ({ role, content }))
}

export function cartForApi(items) {
  return items.map(({ id, quantity }) => ({ product_id: id, quantity }))
}

// Mesmo formato dos itens do OrderContext (ver utils/order.js).
export function itemsFromAssistant(cart) {
  if (!Array.isArray(cart)) return []
  return cart
    .filter((item) => Number.isSafeInteger(item?.product_id) && item.product_id > 0 &&
      Number.isSafeInteger(item.quantity) && item.quantity > 0 &&
      Number.isFinite(item.price) && item.price > 0)
    .map((item) => ({
      id: item.product_id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      category: item.category,
      image_url: item.image_url ?? null,
      nutrition: item.nutrition ?? null,
    }))
}

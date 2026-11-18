import test from 'node:test'
import assert from 'node:assert/strict'
import { cartForApi, historyForApi, itemsFromAssistant } from '../src/utils/assistant.js'

test('saudação local não vai para a API e campos extras são removidos', () => {
  const messages = [
    { role: 'assistant', content: 'Olá!', local: true },
    { role: 'user', content: 'Um latte', extra: 1 },
    { role: 'assistant', content: 'Anotado.' },
  ]
  assert.deepEqual(historyForApi(messages), [
    { role: 'user', content: 'Um latte' },
    { role: 'assistant', content: 'Anotado.' },
  ])
})

test('carrinho vai para a API só com product_id e quantity', () => {
  const items = [{ id: 3, name: 'Latte', price: 13.5, quantity: 2, category: 'bebidas', nutrition: null }]
  assert.deepEqual(cartForApi(items), [{ product_id: 3, quantity: 2 }])
})

test('carrinho do assistente vira itens do pedido e descarta entradas inválidas', () => {
  const cart = [
    { product_id: 3, name: 'Latte', price: 13.5, quantity: 2, category: 'bebidas', nutrition: null },
    { product_id: 0, name: 'X', price: 1, quantity: 1 },
    { product_id: 4, name: 'Y', price: 0, quantity: 1 },
    { product_id: 5, name: 'Z', price: 2, quantity: 1.5 },
    null,
  ]
  assert.deepEqual(itemsFromAssistant(cart), [
    { id: 3, name: 'Latte', price: 13.5, quantity: 2, category: 'bebidas', nutrition: null },
  ])
  assert.deepEqual(itemsFromAssistant(undefined), [])
})

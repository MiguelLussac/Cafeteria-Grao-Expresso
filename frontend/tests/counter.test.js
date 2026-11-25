import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterProducts } from '../src/utils/counter.js'
import { orderPayload } from '../src/utils/order.js'

const products = [
  { id: 1, name: 'Café Expresso', category: 'bebidas' },
  { id: 2, name: 'Pão de Queijo', category: 'salgados' },
  { id: 3, name: 'Brigadeiro', category: 'doces' },
]

test('balcão filtra por categoria e por nome sem diferenciar acento ou maiúscula', () => {
  assert.equal(filterProducts(products, 'todos', '').length, 3)
  assert.deepEqual(filterProducts(products, 'doces', '').map((p) => p.id), [3])
  assert.deepEqual(filterProducts(products, 'todos', 'CAFE').map((p) => p.id), [1])
  assert.deepEqual(filterProducts(products, 'todos', 'pao ').map((p) => p.id), [2])
  assert.deepEqual(filterProducts(products, 'bebidas', 'pão'), [])
})

test('pedido do balcão envia o canal e exige Mesa ou Retirada escolhida pelo atendente', () => {
  const items = [{ id: 1, quantity: 2 }]
  const payload = orderPayload(items, { customer_name: '', table_number: 'Mesa', notes: '' }, 'balcao')
  assert.equal(payload.channel, 'balcao')
  assert.equal(payload.table_number, 'Mesa')
  assert.throws(() => orderPayload(items, { customer_name: '', table_number: '', notes: '' }, 'balcao'))
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addProduct, changeQuantity, removeProduct, itemsQuantity,
  createOrderSubmitter, estimatedTotal, orderPayload } from '../src/utils/order.js'

const details = { customer_name: ' Miguel ', table_number: ' Mesa 2 ', notes: ' Sem açúcar ' }
const items = [
  { id: 1, name: 'Café', price: 6.5, quantity: 2 },
  { id: 2, name: 'Pão', price: 7, quantity: 3 },
]

test('seleção soma unidades do mesmo produto sem duplicar linhas', () => {
  const product = { id: 1, name: 'Café', price: 6.5, is_active: true }
  const first = addProduct([], product)
  const second = addProduct(first, product)
  assert.deepEqual(second, [{ id: 1, name: 'Café', price: 6.5, quantity: 2 }])
  assert.equal(first[0].quantity, 1)
  assert.equal(itemsQuantity(second), 2)
})

test('seleção permite aumentar, diminuir e remover sem perder os demais produtos', () => {
  const changed = changeQuantity(items, 1, 5)
  assert.equal(itemsQuantity(changed), 8)
  assert.equal(estimatedTotal(changed), 53.5)
  const decreased = changeQuantity(changed, 1, 1)
  assert.equal(itemsQuantity(decreased), 4)
  assert.deepEqual(removeProduct(decreased, 1), [items[1]])
  assert.deepEqual(removeProduct(removeProduct(decreased, 1), 2), [])
})

test('seleção rejeita produtos inativos e quantidades não positivas, fracionárias ou inseguras', () => {
  assert.equal(addProduct(items, { id: 3, name: 'Inativo', price: 1, is_active: false }), items)
  for (const quantity of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(changeQuantity(items, 1, quantity), items)
  }
})

test('resumo calcula unidades e total estimado de um ou vários produtos', () => {
  assert.equal(estimatedTotal(items.slice(0, 1)), 13)
  assert.equal(estimatedTotal(items), 34)
  assert.equal(estimatedTotal([{ price: 0.1, quantity: 3 }]), 0.3)
})

test('confirmação envia somente identificação, observações, IDs e quantidades', () => {
  assert.deepEqual(orderPayload(items, details), {
    customer_name: 'Miguel', table_number: 'Mesa 2', notes: 'Sem açúcar',
    items: [{ product_id: 1, quantity: 2 }, { product_id: 2, quantity: 3 }],
  })
})

test('pedido vazio ou quantidade inválida não chama API', () => {
  let calls = 0
  const submit = createOrderSubmitter(() => { calls++ })
  assert.throws(() => submit([], details), /Selecione/)
  for (const quantity of [0, -1, 1.5, '2']) {
    assert.throws(() => submit([{ ...items[0], quantity }], details), /Revise/)
  }
  assert.equal(calls, 0)
})

test('cliques simultâneos criam um único pedido e preservam ID e total do servidor', async () => {
  let resolve
  let calls = 0
  const submit = createOrderSubmitter(() => {
    calls++
    return new Promise((done) => { resolve = done })
  })
  const first = submit(items, details)
  const second = submit(items, details)
  await Promise.resolve()
  assert.equal(calls, 1)
  assert.equal(first, second)
  resolve({ id: 42, total_amount: 35, payment: null })
  assert.deepEqual(await first, { id: 42, total_amount: 35, payment: null })
  assert.equal((await second).total_amount, 35)
  assert.equal((await submit(items, details)).id, 42)
  assert.equal(calls, 1)
})

for (const status of [0, 400, 500]) {
  test(`erro ${status} preserva mensagem e permite nova tentativa`, async () => {
    let calls = 0
    const failure = Object.assign(new Error('Falha de comunicação ou validação'), { status })
    const submit = createOrderSubmitter(async () => {
      if (++calls === 1) throw failure
      return { id: 43, total_amount: 34 }
    })
    await assert.rejects(submit(items, details), (error) => error === failure)
    assert.equal((await submit(items, details)).id, 43)
    assert.equal(calls, 2)
  })
}

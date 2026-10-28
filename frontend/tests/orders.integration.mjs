// Executado pelo pytest contra um servidor Flask real e banco de teste isolado.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOrderSubmitter } from '../src/utils/order.js'
import {
  createOrder, listOrders, getOrder, registerSimulatedPayment,
  updateOrderStatus, login, listProducts, AUTH_EXPIRED_EVENT,
} from '../src/services/api.js'

test('React api.js -> HTTP -> Flask: pedido, pagamento, JWT e erros', async () => {
  const nativeFetch = globalThis.fetch
  globalThis.fetch = (url, options) => nativeFetch(new URL(url, process.env.API_TEST_URL), options)
  const storage = new Map()
  const events = []
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }
  globalThis.window = { dispatchEvent: event => events.push(event.type) }
  try {
    const [product] = await listProducts()
    const confirm = createOrderSubmitter(createOrder)
    const selected = [{ ...product, price: 0.01, quantity: 2 }]
    const details = { customer_name: 'Teste Sprint 2', table_number: 'Mesa 04', notes: 'Sem acucar' }
    const [order, duplicate] = await Promise.all([
      confirm(selected, details), confirm(selected, details),
    ])
    assert.equal(duplicate.id, order.id)
    assert.equal((await listOrders()).length, 1)
    assert.equal(order.status, 'recebido')
    assert.equal(order.total_amount, product.price * 2)
    assert.equal(order.items_count, 1)
    assert.equal(order.items[0].quantity, 2)
    assert.equal(order.payment, null)
    assert.ok(order.created_at)
    const orders = await listOrders({ status: 'recebido', limit: 1 })
    assert.equal(orders[0].id, order.id)
    assert.equal(orders[0].items, undefined)
    assert.equal(orders[0].payment, undefined)
    assert.equal((await getOrder(order.id)).notes, 'Sem acucar')
    const payment = await registerSimulatedPayment(order.id, { method: 'pix' })
    assert.equal(payment.amount, order.total_amount)
    assert.equal(payment.order_id, order.id)
    assert.equal(payment.status, 'pago')
    assert.ok(payment.payment_id)
    assert.ok(payment.paid_at)
    assert.deepEqual((await getOrder(order.id)).payment, payment)
    await assert.rejects(registerSimulatedPayment(order.id, { method: 'pix' }), { status: 400 })
    await assert.rejects(updateOrderStatus(order.id, 'pronto'), { status: 401 })
    assert.deepEqual(events, [AUTH_EXPIRED_EVENT])
    await login('barista', 'barista123')
    for (const status of ['em_preparo', 'pronto', 'entregue']) {
      const updated = await updateOrderStatus(order.id, status)
      assert.equal(updated.id, order.id)
      assert.equal(updated.status, status)
      assert.ok(updated.updated_at)
      assert.equal((await getOrder(order.id)).status, status)
    }
    assert.deepEqual(await listOrders({ status: 'recebido' }), [])
    await assert.rejects(updateOrderStatus(order.id, 'invalido'), { status: 400 })
    await assert.rejects(listOrders({ status: 'invalido' }), { status: 400 })
    await assert.rejects(getOrder(999999), { status: 404 })
    await assert.rejects(registerSimulatedPayment(999999, { method: 'pix' }), { status: 404 })
    await assert.rejects(updateOrderStatus(999999, 'pronto'), { status: 404 })
    await assert.rejects(createOrder({ items: [] }), { status: 400 })
    const second = await createOrder({ items: [{ product_id: product.id }] })
    assert.equal(second.customer_name, 'Balcão')
    assert.equal(second.table_number, 'Retirada')
    assert.equal(second.items[0].quantity, 1)
    await assert.rejects(registerSimulatedPayment(second.id, { method: 'invalido' }), { status: 400 })
    const explicit = await registerSimulatedPayment(second.id, { method: 'dinheiro', amount: second.total_amount })
    assert.equal(explicit.amount, second.total_amount)
    const products = await listProducts()
    const multi = createOrderSubmitter(createOrder)
    const multiple = await multi([
      { ...products[0], quantity: 3 }, { ...products[1], quantity: 2 },
    ], details)
    assert.equal(multiple.items.length, 2)
    assert.equal(multiple.total_amount, products[0].price * 3 + products[1].price * 2)
    assert.equal(multiple.payment, null)
    const invalid = createOrderSubmitter(createOrder)
    await assert.rejects(invalid([{ id: 999999, quantity: 1 }], details), { status: 400 })
    assert.equal((await listOrders()).length, 3)
  } finally {
    globalThis.fetch = nativeFetch
    delete globalThis.localStorage
    delete globalThis.window
  }
})

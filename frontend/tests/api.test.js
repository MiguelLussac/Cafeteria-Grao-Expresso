import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import {
  ApiError, AUTH_EXPIRED_EVENT, createOrder, listOrders, getOrder,
  registerSimulatedPayment, updateOrderStatus,
} from '../src/services/api.js'

let calls
let storage
let events
const originalFetch = globalThis.fetch

beforeEach(() => {
  calls = []
  storage = new Map([['grao_token', 'jwt-test'], ['grao_user', '{}']])
  events = []
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    removeItem: key => storage.delete(key),
  }
  globalThis.window = { dispatchEvent: event => events.push(event.type) }
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options })
    return Response.json({ success: true, data: { id: 7 } })
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  delete globalThis.localStorage
  delete globalThis.window
})

test('cria pedido publico e retorna apenas data', async () => {
  const order = { customer_name: 'Ana', items: [{ product_id: 1, quantity: 2 }] }
  assert.deepEqual(await createOrder(order), { id: 7 })
  assert.deepEqual(calls[0], {
    url: '/api/v1/orders', method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order),
  })
})

test('lista pedidos com filtros codificados e sem filtros', async () => {
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options })
    return Response.json({ success: true, count: 1, data: [{ id: 7 }] })
  }
  assert.deepEqual(await listOrders(), [{ id: 7 }])
  assert.equal(calls[0].url, '/api/v1/orders')
  await listOrders({ status: 'em_preparo', limit: 10 })
  assert.equal(calls[1].url, '/api/v1/orders?status=em_preparo&limit=10')
  await listOrders({ status: 'valor & invalido', limit: 0 })
  assert.equal(calls[2].url, '/api/v1/orders?status=valor+%26+invalido&limit=0')
})

test('consulta detalhes do pedido', async () => {
  assert.deepEqual(await getOrder(7), { id: 7 })
  assert.equal(calls[0].url, '/api/v1/orders/7')
  assert.equal(calls[0].method, 'GET')
  assert.deepEqual(calls[0].headers, {})
})

test('registra pagamento publico com valor explicito ou omitido', async () => {
  for (const payment of [{ method: 'pix', amount: 13 }, { method: 'cartao' }]) {
    assert.deepEqual(await registerSimulatedPayment(7, payment), { id: 7 })
    assert.deepEqual(calls.at(-1), {
      url: '/api/v1/orders/7/payment', method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payment),
    })
  }
})

test('atualiza status enviando JWT e corpo esperado', async () => {
  assert.deepEqual(await updateOrderStatus(7, 'pronto'), { id: 7 })
  assert.deepEqual(calls[0], {
    url: '/api/v1/orders/7/status', method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-test' },
    body: JSON.stringify({ status: 'pronto' }),
  })
})

for (const status of [400, 403, 404, 500]) {
  test(`preserva mensagem e status HTTP ${status}`, async () => {
    globalThis.fetch = async () => Response.json({ error: 'Erro da API' }, { status })
    await assert.rejects(updateOrderStatus(7, 'pronto'), error => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, status)
      assert.equal(error.message, 'Erro da API')
      return true
    })
    assert.equal(storage.get('grao_token'), 'jwt-test')
    assert.deepEqual(events, [])
  })
}

test('401 limpa sessao e dispara evento de autenticacao expirada', async () => {
  globalThis.fetch = async () => Response.json({ error: 'Token expirado' }, { status: 401 })
  await assert.rejects(updateOrderStatus(7, 'pronto'), { status: 401, message: 'Token expirado' })
  assert.equal(storage.size, 0)
  assert.deepEqual(events, [AUTH_EXPIRED_EVENT])
})

test('status sem token continua recebendo o erro do backend', async () => {
  storage.clear()
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, undefined)
    return Response.json({ error: 'Token ausente' }, { status: 401 })
  }
  await assert.rejects(updateOrderStatus(7, 'pronto'), { status: 401 })
})

test('falha de rede vira ApiError com status zero', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(listOrders(), error => error instanceof ApiError && error.status === 0)
})

test('erro HTTP sem JSON usa mensagem padrao', async () => {
  globalThis.fetch = async () => new Response('<html>Bad Gateway</html>', { status: 502 })
  await assert.rejects(getOrder(7), { status: 502, message: 'Erro inesperado (HTTP 502).' })
})

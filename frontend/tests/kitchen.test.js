import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { listKitchenOrders, subscribeOrderEvents } from '../src/services/api.js'
import { formatTime, parseApiDate } from '../src/utils/format.js'
import {
  KITCHEN_ACTIONS, createSerialRunner, groupKitchenOrders, minutesWaiting,
} from '../src/utils/kitchen.js'

const order = (id, status, paidAt) => ({
  id, status, created_at: '2026-10-28T12:00:00', payment: paidAt ? { paid_at: paidAt } : null,
})

// ---------- API ----------

let calls
const originalFetch = globalThis.fetch

beforeEach(() => {
  calls = []
  const storage = new Map([['grao_token', 'jwt-test']])
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    removeItem: key => storage.delete(key),
  }
  globalThis.window = { dispatchEvent: () => {} }
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options })
    return Response.json({ success: true, count: 1, data: [{ id: 7 }] })
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  delete globalThis.localStorage
  delete globalThis.window
  delete globalThis.EventSource
})

test('consulta a fila da cozinha com JWT e filtro opcional', async () => {
  assert.deepEqual(await listKitchenOrders(), [{ id: 7 }])
  assert.equal(calls[0].url, '/api/v1/orders/kitchen')
  assert.equal(calls[0].method, 'GET')
  assert.deepEqual(calls[0].headers, { Authorization: 'Bearer jwt-test' })
  await listKitchenOrders({ status: 'em_preparo' })
  assert.equal(calls[1].url, '/api/v1/orders/kitchen?status=em_preparo')
})

class FakeEventSource {
  static CLOSED = 2
  static last = null

  constructor(url) {
    this.url = url
    this.listeners = {}
    this.readyState = 0
    this.closed = false
    FakeEventSource.last = this
  }

  addEventListener(type, fn) {
    this.listeners[type] = fn
  }

  emit(type, data) {
    this.listeners[type]?.({ data })
  }

  close() {
    this.closed = true
  }
}

test('stream SSE repassa conexao, eventos de pedido e erros', () => {
  globalThis.EventSource = FakeEventSource
  const seen = []
  const close = subscribeOrderEvents({
    onConnected: () => seen.push('connected'),
    onEvent: (type, data) => seen.push([type, data]),
    onError: closed => seen.push(['error', closed]),
  })
  const source = FakeEventSource.last
  assert.equal(source.url, '/api/v1/events/orders')
  // Nenhum token na URL: o stream é público e a fila é consultada com JWT.
  assert.ok(!source.url.includes('jwt'))

  source.emit('connected', '{}')
  source.emit('new_order', '{"order_id":7}')
  source.emit('order_status_updated', 'texto invalido')
  source.onerror()
  source.readyState = FakeEventSource.CLOSED
  source.onerror()
  close()

  assert.deepEqual(seen, [
    'connected',
    ['new_order', { order_id: 7 }],
    ['order_status_updated', null],
    ['error', false],
    ['error', true],
  ])
  assert.equal(source.closed, true)
})

// ---------- Datas ----------

test('interpreta datas do Flask como UTC', () => {
  assert.equal(parseApiDate('2026-10-28T12:00:00').toISOString(), '2026-10-28T12:00:00.000Z')
  assert.equal(parseApiDate('2026-10-28T12:00:00Z').toISOString(), '2026-10-28T12:00:00.000Z')
  assert.equal(parseApiDate('2026-10-28T09:00:00-03:00').toISOString(), '2026-10-28T12:00:00.000Z')
  assert.equal(parseApiDate(null), null)
  assert.equal(parseApiDate('invalida'), null)
  assert.equal(formatTime(null), '')
})

// ---------- Fila ----------

test('agrupa por status, do pagamento mais antigo ao mais recente', () => {
  const groups = groupKitchenOrders([
    order(3, 'recebido', '2026-10-28T12:10:00'),
    order(1, 'recebido', '2026-10-28T12:05:00'),
    order(2, 'em_preparo', '2026-10-28T12:00:00'),
    order(4, 'pronto', '2026-10-28T12:01:00'),
  ])
  assert.deepEqual(groups.recebido.map(o => o.id), [1, 3])
  assert.deepEqual(groups.em_preparo.map(o => o.id), [2])
  assert.deepEqual(groups.pronto.map(o => o.id), [4])
})

test('desempata pelo id quando o horario e igual', () => {
  const groups = groupKitchenOrders([
    order(9, 'recebido', '2026-10-28T12:00:00'),
    order(8, 'recebido', '2026-10-28T12:00:00'),
  ])
  assert.deepEqual(groups.recebido.map(o => o.id), [8, 9])
})

test('nao duplica pedidos e mantem a versao mais recente', () => {
  const groups = groupKitchenOrders([
    order(5, 'recebido', '2026-10-28T12:00:00'),
    order(5, 'em_preparo', '2026-10-28T12:00:00'),
  ])
  assert.equal(groups.recebido.length, 0)
  assert.deepEqual(groups.em_preparo.map(o => o.id), [5])
})

test('descarta pedidos entregues ou cancelados', () => {
  const groups = groupKitchenOrders([
    order(1, 'entregue', '2026-10-28T12:00:00'),
    order(2, 'cancelado', '2026-10-28T12:00:00'),
  ])
  assert.deepEqual(Object.values(groups).flat(), [])
})

test('acoes seguem as transicoes permitidas pelo backend', () => {
  assert.equal(KITCHEN_ACTIONS.recebido.next, 'em_preparo')
  assert.equal(KITCHEN_ACTIONS.em_preparo.next, 'pronto')
  assert.equal(KITCHEN_ACTIONS.pronto.next, 'entregue')
})

test('calcula a espera a partir do pagamento ou da criacao', () => {
  const now = Date.parse('2026-10-28T12:30:00Z')
  assert.equal(minutesWaiting(order(1, 'recebido', '2026-10-28T12:18:30'), now), 11)
  assert.equal(minutesWaiting(order(1, 'recebido', null), now), 30)
  assert.equal(minutesWaiting(order(1, 'recebido', '2026-10-28T13:00:00'), now), 0)
})

// ---------- Consultas serializadas ----------

test('serializa consultas e agrupa chamadas feitas durante uma execucao', async () => {
  let runs = 0
  let release
  const run = createSerialRunner(async () => {
    runs += 1
    if (runs === 1) await new Promise(resolve => { release = resolve })
  })

  const first = run()
  run()
  run()
  assert.equal(runs, 1)
  release()
  await first
  // As duas chamadas pendentes viram uma única nova consulta.
  assert.equal(runs, 2)

  await run()
  assert.equal(runs, 3)
})

test('continua aceitando consultas apos uma falha', async () => {
  let runs = 0
  const run = createSerialRunner(async () => {
    runs += 1
    if (runs === 1) throw new Error('falhou')
  })
  await assert.rejects(run(), /falhou/)
  await run()
  assert.equal(runs, 2)
})

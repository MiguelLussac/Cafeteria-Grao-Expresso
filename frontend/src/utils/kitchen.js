// Regras de apresentação da fila da cozinha (sem React, para facilitar os testes).
import { parseApiDate } from './format.js'

export const KITCHEN_COLUMNS = [
  { status: 'recebido', label: 'Recebidos', empty: 'Nenhum pedido aguardando preparo.' },
  { status: 'em_preparo', label: 'Em preparo', empty: 'Nenhum pedido em preparo.' },
  { status: 'pronto', label: 'Prontos', empty: 'Nenhum pedido pronto para retirada.' },
]

// Próxima ação de cada status, conforme as transições aceitas pelo backend.
export const KITCHEN_ACTIONS = {
  recebido: { next: 'em_preparo', label: 'Iniciar preparo' },
  em_preparo: { next: 'pronto', label: 'Finalizar preparo' },
  pronto: { next: 'entregue', label: 'Marcar como entregue' },
}

// Minutos a partir dos quais o pedido é destacado como atrasado.
export const LATE_AFTER_MINUTES = 10

// Momento em que o pedido chegou à cozinha: o pagamento libera o pedido.
export function arrivedAt(order) {
  return parseApiDate(order.payment?.paid_at ?? order.created_at)
}

export function minutesWaiting(order, now = Date.now()) {
  const arrived = arrivedAt(order)
  if (!arrived) return 0
  return Math.max(0, Math.floor((now - arrived.getTime()) / 60000))
}

// Agrupa por status, sem duplicar pedidos (o último com o mesmo id prevalece)
// e do mais antigo para o mais recente.
export function groupKitchenOrders(orders) {
  const unique = new Map()
  for (const order of orders) unique.set(order.id, order)

  const groups = Object.fromEntries(KITCHEN_COLUMNS.map((c) => [c.status, []]))
  for (const order of unique.values()) groups[order.status]?.push(order)

  const time = (order) => arrivedAt(order)?.getTime() ?? 0
  for (const list of Object.values(groups)) {
    list.sort((a, b) => time(a) - time(b) || a.id - b.id)
  }
  return groups
}

// Executa `task` sem sobreposição: chamadas feitas durante uma execução
// marcam uma nova rodada, que roda uma única vez ao final. Assim uma resposta
// antiga nunca sobrescreve o resultado de uma consulta mais recente.
export function createSerialRunner(task) {
  let running = null
  let pending = false

  async function loop() {
    do {
      pending = false
      await task()
    } while (pending)
  }

  return function run() {
    if (running) {
      pending = true
      return running
    }
    running = loop().finally(() => {
      running = null
    })
    return running
  }
}

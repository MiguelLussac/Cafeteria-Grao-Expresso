// Fila da cozinha sincronizada com a API Flask (task 10).
// Protocolo em docs/kitchen_sse.md: a API é a fonte de verdade; o SSE só avisa
// que algo mudou, e a cada (re)conexão a fila inteira é consultada de novo.
import { useCallback, useEffect, useRef, useState } from 'react'
import { listKitchenOrders, subscribeOrderEvents, updateOrderStatus } from '../services/api'
import { createSerialRunner } from '../utils/kitchen'

// Espera antes de reabrir o stream quando a conexão é perdida.
const RECONNECT_DELAY_MS = 5000
// Consulta de segurança: o stream pode ficar "pendurado" sem o navegador
// perceber (proxy, rede instável) e o heartbeat do servidor não é visível ao EventSource.
const RESYNC_INTERVAL_MS = 30000

export default function useKitchenQueue() {
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [connection, setConnection] = useState('connecting') // connecting | live | offline
  const [updating, setUpdating] = useState({}) // { [orderId]: true } enquanto o PATCH roda
  const updatingRef = useRef(new Set())
  const connectionLostRef = useRef(() => {})

  const [refresh] = useState(() =>
    createSerialRunner(async () => {
      try {
        // O snapshot substitui a lista local: pedidos que saíram da fila somem
        // e nenhum pedido aparece duplicado por causa de eventos repetidos.
        setOrders(await listKitchenOrders())
        setStatus('ready')
        setError('')
      } catch (err) {
        setError(err.message)
        setStatus((current) => (current === 'ready' ? 'ready' : 'error'))
        // Servidor inalcançável (proxies respondem 5xx): o stream atual não é confiável, reabre-o.
        if (err.status === 0 || err.status >= 500) connectionLostRef.current()
      }
    }),
  )

  useEffect(() => {
    let unsubscribe = null
    let retryTimer = null
    let disposed = false

    function connect() {
      setConnection('connecting')
      unsubscribe = subscribeOrderEvents({
        onConnected: () => {
          setConnection('live')
          refresh()
        },
        onEvent: () => refresh(),
        onError: (closed) => {
          // Com closed=false o próprio navegador tenta reconectar.
          if (closed) reconnectLater()
          else setConnection('offline')
        },
      })
    }

    function reconnectLater() {
      if (disposed) return
      unsubscribe?.()
      clearTimeout(retryTimer)
      setConnection('offline')
      retryTimer = setTimeout(connect, RECONNECT_DELAY_MS)
    }

    connectionLostRef.current = reconnectLater

    // Carrega a fila mesmo que o SSE demore ou falhe ao conectar.
    refresh()
    connect()
    const resyncTimer = setInterval(refresh, RESYNC_INTERVAL_MS)

    return () => {
      disposed = true
      connectionLostRef.current = () => {}
      clearTimeout(retryTimer)
      clearInterval(resyncTimer)
      unsubscribe?.()
    }
  }, [refresh])

  // Muda o status e só reflete na tela depois que a API confirmar.
  const changeStatus = useCallback(
    async (order, nextStatus) => {
      if (updatingRef.current.has(order.id)) return
      updatingRef.current.add(order.id)
      setUpdating((current) => ({ ...current, [order.id]: true }))
      try {
        const updated = await updateOrderStatus(order.id, nextStatus)
        setOrders((current) =>
          current.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
        )
      } catch (err) {
        // 409: outro dispositivo já alterou o pedido; recarrega para mostrar o estado real.
        if (err.status === 409) refresh()
        throw err
      } finally {
        updatingRef.current.delete(order.id)
        setUpdating((current) => {
          const next = { ...current }
          delete next[order.id]
          return next
        })
      }
    },
    [refresh],
  )

  return { orders, status, error, connection, updating, changeStatus, refresh }
}

// Camada única de comunicação com a API Flask (task 10).
// Todas as telas devem usar as funções deste arquivo em vez de chamar fetch diretamente.
// Contrato: docs/api_contracts.md

const BASE_URL = `${import.meta.env?.VITE_API_URL ?? ''}/api/v1`

const TOKEN_KEY = 'grao_token'
const USER_KEY = 'grao_user'

// Evento disparado quando o backend recusa o token (ausente, inválido ou expirado).
export const AUTH_EXPIRED_EVENT = 'grao:auth-expired'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    // 0 = sem resposta do servidor (offline, CORS, URL errada)
    this.status = status
  }
}

// ---------- Sessão ----------

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSession(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // armazenamento indisponível (aba anônima, etc.): a sessão dura só até recarregar
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {
    // ignora
  }
}

// ---------- Requisição base ----------

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Tente novamente.', 0)
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && auth) {
      clearSession()
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }
    const message = data?.error || `Erro inesperado (HTTP ${response.status}).`
    throw new ApiError(message, response.status)
  }

  return data
}

// ---------- Autenticação ----------

export async function login(username, password) {
  const res = await request('/auth/login', {
    method: 'POST',
    body: { username, password },
  })
  saveSession(res.data.token, res.data.user)
  return res.data.user
}

export async function getCurrentUser() {
  const res = await request('/auth/me', { auth: true })
  return res.data
}

// ---------- Produtos (cardápio) ----------

// filtros: { category: 'bebidas' | 'doces' | 'salgados', activeOnly: boolean }
export async function listProducts({ category, activeOnly = true } = {}) {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (!activeOnly) params.set('active_only', 'false')
  const query = params.toString() ? `?${params}` : ''

  const res = await request(`/products${query}`)
  return res.data
}

export async function getProduct(id) {
  const res = await request(`/products/${id}`)
  return res.data
}

// product: { name, price, category, description? }
export async function createProduct(product) {
  const res = await request('/products', { method: 'POST', body: product, auth: true })
  return res.data
}

// changes: qualquer subconjunto de { name, price, category, description, is_active }
export async function updateProduct(id, changes) {
  const res = await request(`/products/${id}`, { method: 'PUT', body: changes, auth: true })
  return res.data
}

// O backend desativa o produto (soft-delete); exige perfil admin.
export async function deleteProduct(id) {
  await request(`/products/${id}`, { method: 'DELETE', auth: true })
}

// ---------- Pedidos e pagamento simulado ----------

// order: { items: [{ product_id, quantity }], customer_name?, table_number?, notes? }
export async function createOrder(order) {
  const res = await request('/orders', { method: 'POST', body: order })
  return res.data
}

// Retorna o array de res.data, assim como listProducts (sem o envelope/count).
export async function listOrders({ status, limit } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (limit !== undefined) params.set('limit', limit)
  const query = params.toString() ? `?${params}` : ''
  const res = await request(`/orders${query}`)
  return res.data
}

export async function getOrder(id) {
  const res = await request(`/orders/${id}`)
  return res.data
}

// payment: { method: 'dinheiro' | 'cartao' | 'pix', amount? }
// Sem amount, o Flask usa o total do pedido. Não processa dinheiro real.
export async function registerSimulatedPayment(id, payment) {
  const res = await request(`/orders/${id}/payment`, { method: 'POST', body: payment })
  return res.data
}

// Exige login como barista, atendente ou admin; retorna { id, status, updated_at }.
export async function updateOrderStatus(id, status) {
  const res = await request(`/orders/${id}/status`, {
    method: 'PATCH', body: { status }, auth: true,
  })
  return res.data
}

// ---------- Cozinha e eventos em tempo real ----------

// Fila completa da cozinha (pedidos pagos em recebido, em_preparo ou pronto),
// do pagamento mais antigo para o mais recente. Exige barista, atendente ou admin.
export async function listKitchenOrders({ status } = {}) {
  const query = status ? `?${new URLSearchParams({ status })}` : ''
  const res = await request(`/orders/kitchen${query}`, { auth: true })
  return res.data
}

export const ORDER_EVENT_TYPES = ['new_order', 'order_status_updated', 'order_ready']

// Abre o stream SSE de pedidos (docs/kitchen_sse.md) e retorna a função que o fecha.
// onConnected: a cada (re)conexão — o estado deve ser recuperado pela API.
// onEvent(type, data): eventos de pedido. onError(closed): perda de conexão;
// closed=true quando o navegador desistiu de reconectar sozinho.
export function subscribeOrderEvents({ onConnected, onEvent, onError } = {}) {
  const source = new EventSource(`${BASE_URL}/events/orders`)

  source.addEventListener('connected', () => onConnected?.())
  for (const type of ORDER_EVENT_TYPES) {
    source.addEventListener(type, (event) => {
      let data = null
      try {
        data = JSON.parse(event.data)
      } catch {
        // evento sem JSON válido: trata apenas como aviso de mudança
      }
      onEvent?.(type, data)
    })
  }
  source.onerror = () => onError?.(source.readyState === EventSource.CLOSED)

  return () => source.close()
}

// ---------- Utilitários ----------

export async function checkHealth() {
  return request('/health')
}

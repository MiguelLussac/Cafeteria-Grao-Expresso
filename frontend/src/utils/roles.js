// Quem pode abrir cada área da equipe. O cardápio (/) e o fluxo de pedido são públicos.
// O admin acessa todas as telas.
const ROUTE_ROLES = [
  { prefix: '/admin', roles: ['admin'] },
  { prefix: '/cozinha', roles: ['barista', 'atendente', 'admin'] },
  { prefix: '/balcao', roles: ['atendente', 'admin'] },
]

// Tela inicial de cada perfil depois do login.
export const ROLE_HOME = { admin: '/admin', atendente: '/balcao', barista: '/cozinha' }

export function homeFor(role) {
  return ROLE_HOME[role] ?? '/'
}

// O atendente acompanha a fila, mas só barista e admin mudam o status dos pedidos.
export function canChangeKitchen(role) {
  return role === 'barista' || role === 'admin'
}

export function canAccess(role, path) {
  const rule = ROUTE_ROLES.find(({ prefix }) => path === prefix || path.startsWith(prefix + '/'))
  return !rule || rule.roles.includes(role)
}

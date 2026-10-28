const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatPrice(value) {
  return currency.format(Number(value) || 0)
}

// "12,90" ou "12.90" -> 12.9 ; retorna NaN se não for número
export function parsePrice(text) {
  const normalized = String(text).trim().replace(/\./g, '').replace(',', '.')
  if (normalized === '') return NaN
  return Number(normalized)
}

// 12.9 -> "12,90" (para preencher o campo de preço na edição)
export function priceToInput(value) {
  return Number(value).toFixed(2).replace('.', ',')
}

export const CATEGORIES = [
  { value: 'bebidas', label: 'Bebidas' },
  { value: 'doces', label: 'Doces' },
  { value: 'salgados', label: 'Salgados' },
]

export function categoryLabel(value) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value
}

export const ROLE_LABELS = {
  admin: 'Admin',
  atendente: 'Atendente',
  barista: 'Barista',
}

// O Flask envia datas ISO em UTC sem fuso ("2026-10-28T17:50:22"); sem o "Z"
// o navegador as leria como horário local.
export function parseApiDate(value) {
  if (!value) return null
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value)
  const date = new Date(hasZone ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function formatTime(value) {
  const date = parseApiDate(value)
  return date ? time.format(date) : ''
}

export const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'pix', label: 'Pix' },
]

export function paymentMethodLabel(value) {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value
}

export function initials(name = '') {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase()
}

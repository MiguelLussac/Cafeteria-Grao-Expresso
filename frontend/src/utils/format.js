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

export function initials(name = '') {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase()
}

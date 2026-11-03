// Tabela nutricional média por porção (campo "nutrition" do produto na API),
// estimada pela IA (Edge Function "macros") ou preenchida pela equipe.
import { parseApiDate } from './format.js'

export const SERVING_UNITS = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
]

// Cores definidas no design: proteínas escura, carboidratos clara, gorduras média.
export const MACROS = [
  { key: 'protein_g', label: 'Proteínas', short: 'P', kcalPerGram: 4, className: 'macro-protein' },
  { key: 'carbs_g', label: 'Carboidratos', short: 'C', kcalPerGram: 4, className: 'macro-carbs' },
  { key: 'fat_g', label: 'Gorduras', short: 'G', kcalPerGram: 9, className: 'macro-fat' },
]

export const NUTRITION_FIELDS = [
  { key: 'serving_size', label: 'Porção' },
  { key: 'calories_kcal', label: 'Energia', unit: 'kcal' },
  ...MACROS.map((m) => ({ key: m.key, label: m.label, unit: 'g' })),
]

export const EMPTY_NUTRITION = { ...Object.fromEntries(NUTRITION_FIELDS.map((f) => [f.key, ''])), serving_unit: 'g' }

export const REFERENCE_DIET_KCAL = 2000
// Sem resposta da IA após esse tempo, "Calculando" vira "Indisponível" (ex.: ambiente sem a Edge Function).
export const PENDING_WINDOW_MS = 2 * 60 * 1000

const oneDecimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

// 12.5 -> "12,5"
export function formatAmount(value) {
  return oneDecimal.format(Number(value) || 0)
}

// 1130.4 -> "1.130"
export function formatInteger(value) {
  return integer.format(Math.round(Number(value) || 0))
}

export function formatServing(nutrition) {
  return `${formatAmount(nutrition.serving_size)} ${nutrition.serving_unit}`
}

// "ready" | "pending" | "unavailable" para decidir o que mostrar no lugar da tabela.
export function nutritionState(product, now = Date.now()) {
  if (product?.nutrition) return 'ready'
  if (product?.nutrition_status === 'pending') {
    const since = parseApiDate(product.updated_at)
    if (since && now - since.getTime() < PENDING_WINDOW_MS) return 'pending'
  }
  return 'unavailable'
}

// Participação de cada macro nas calorias (4/4/9 kcal por grama), em % inteiros que somam 100.
export function macroShares(totals) {
  const energies = MACROS.map((m) => (Number(totals[m.key]) || 0) * m.kcalPerGram)
  const sum = energies.reduce((a, b) => a + b, 0)
  if (sum <= 0) return MACROS.map(() => 0)
  const raw = energies.map((e) => (e / sum) * 100)
  const shares = raw.map(Math.floor)
  // Distribui o que sobrou do arredondamento para as maiores frações.
  const order = raw.map((r, i) => [r - shares[i], i]).sort((a, b) => b[0] - a[0])
  const remainder = 100 - shares.reduce((a, b) => a + b, 0)
  for (let k = 0; k < remainder; k++) shares[order[k][1]] += 1
  return shares
}

export function referenceDietPercent(kcal) {
  return Math.round(((Number(kcal) || 0) / REFERENCE_DIET_KCAL) * 100)
}

// items: [{ name, quantity, nutrition }] -> totais do pedido e o que ficou de fora.
export function orderNutrition(items) {
  const totals = { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  const rows = []
  const missing = []
  for (const item of items) {
    if (!item.nutrition) {
      missing.push(item.name)
      continue
    }
    const row = { name: item.name, quantity: item.quantity }
    for (const key of Object.keys(totals)) {
      row[key] = item.nutrition[key] * item.quantity
      totals[key] += row[key]
    }
    rows.push(row)
  }
  const status = rows.length === 0 ? 'empty' : missing.length > 0 ? 'partial' : 'complete'
  return { status, totals, rows, missing, counted: rows.length, count: items.length }
}

// "12,5" ou "12.5" -> 12.5 ; retorna NaN se não for número
export function parseAmount(text) {
  const normalized = String(text).trim().replace(',', '.')
  if (normalized === '' || !/^\d*\.?\d+$/.test(normalized)) return NaN
  return Number(normalized)
}

// nutrition da API (ou null) -> valores de texto para o formulário
export function nutritionToInputs(nutrition) {
  if (!nutrition) return { ...EMPTY_NUTRITION }
  return {
    ...Object.fromEntries(NUTRITION_FIELDS.map((f) => [f.key, String(nutrition[f.key]).replace('.', ',')])),
    serving_unit: nutrition.serving_unit,
  }
}

// Valores do formulário -> { nutrition, errors }.
// Tudo vazio = sem tabela (nutrition null); preenchida em parte = erro.
export function parseNutritionInputs(values, source = 'manual') {
  const filled = NUTRITION_FIELDS.filter((f) => String(values[f.key] ?? '').trim() !== '')
  if (filled.length === 0) return { nutrition: null, errors: {} }

  const errors = {}
  const nutrition = { source, serving_unit: values.serving_unit === 'ml' ? 'ml' : 'g' }
  for (const { key } of NUTRITION_FIELDS) {
    const number = parseAmount(values[key] ?? '')
    if (String(values[key] ?? '').trim() === '') errors[key] = 'Preencha ou deixe a tabela toda vazia.'
    else if (Number.isNaN(number)) errors[key] = 'Informe um número.'
    else nutrition[key] = number
  }
  if (Object.keys(errors).length > 0) return { nutrition: null, errors }

  if (nutrition.serving_size <= 0) {
    errors.serving_size = 'A porção deve ser maior que zero.'
  } else if (nutrition.protein_g + nutrition.carbs_g + nutrition.fat_g > nutrition.serving_size) {
    errors.serving_size = 'Proteínas + carboidratos + gorduras passam do tamanho da porção.'
  }
  return Object.keys(errors).length > 0 ? { nutrition: null, errors } : { nutrition, errors }
}

// Aceita só endereços http(s); vazio é válido (produto sem imagem).
export function isValidImageUrl(text) {
  const value = String(text ?? '').trim()
  if (value === '') return true
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.host)
  } catch {
    return false
  }
}

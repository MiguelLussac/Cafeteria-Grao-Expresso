// Tabela nutricional média por porção (campo "nutrition" do produto na API).

export const NUTRITION_FIELDS = [
  { key: 'serving_size_g', label: 'Porção', unit: 'g' },
  { key: 'calories_kcal', label: 'Calorias', unit: 'kcal' },
  { key: 'protein_g', label: 'Proteínas', unit: 'g' },
  { key: 'carbs_g', label: 'Carboidratos', unit: 'g' },
  { key: 'fat_g', label: 'Gorduras', unit: 'g' },
]

export const EMPTY_NUTRITION = Object.fromEntries(NUTRITION_FIELDS.map((f) => [f.key, '']))

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

// 12.5 -> "12,5"
export function formatAmount(value) {
  return decimal.format(Number(value) || 0)
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
  return Object.fromEntries(
    NUTRITION_FIELDS.map((f) => [f.key, String(nutrition[f.key]).replace('.', ',')]),
  )
}

// Valores do formulário -> { nutrition, errors }.
// Tudo vazio = sem tabela (nutrition null); preenchida em parte = erro.
export function parseNutritionInputs(values, source = 'manual') {
  const filled = NUTRITION_FIELDS.filter((f) => String(values[f.key] ?? '').trim() !== '')
  if (filled.length === 0) return { nutrition: null, errors: {} }

  const errors = {}
  const nutrition = { source }
  for (const { key } of NUTRITION_FIELDS) {
    const number = parseAmount(values[key] ?? '')
    if (String(values[key] ?? '').trim() === '') errors[key] = 'Preencha ou deixe a tabela toda vazia.'
    else if (Number.isNaN(number)) errors[key] = 'Informe um número.'
    else nutrition[key] = number
  }
  if (Object.keys(errors).length > 0) return { nutrition: null, errors }

  if (nutrition.serving_size_g <= 0) {
    errors.serving_size_g = 'A porção deve ser maior que zero.'
  } else if (nutrition.protein_g + nutrition.carbs_g + nutrition.fat_g > nutrition.serving_size_g) {
    errors.serving_size_g = 'Proteínas + carboidratos + gorduras passam do peso da porção.'
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

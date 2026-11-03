// Regras puras da função "macros": quando estimar e como validar a resposta da IA.
// Sem dependências de Deno/Supabase para poder rodar em `node --test`.

export type ProductRow = {
  id: number
  name: string
  description: string | null
  category: string
  nutrition_source: string | null
  // pending: aguardando a IA; ready: tabela preenchida; failed: a IA não conseguiu estimar.
  nutrition_status: 'pending' | 'ready' | 'failed'
}

// Formato enviado pelos Database Webhooks do Supabase.
export type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: ProductRow | null
  old_record: ProductRow | null
}

export const SERVING_UNITS = ['g', 'ml'] as const

export type Nutrition = {
  serving_size: number
  serving_unit: (typeof SERVING_UNITS)[number]
  calories_kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export const NUMERIC_KEYS = ['serving_size', 'calories_kcal', 'protein_g', 'carbs_g', 'fat_g'] as const

// Mesmos limites das CHECK constraints de app/models/product.py.
const LIMITS: Record<(typeof NUMERIC_KEYS)[number], number> = {
  serving_size: 5000,
  calories_kcal: 10000,
  protein_g: 5000,
  carbs_g: 5000,
  fat_g: 5000,
}

// A API Flask marca o produto como "pending" sempre que ele precisa de uma
// estimativa (cadastro, mudança de nome/descrição, "Tentar de novo"). As
// gravações desta função mudam o status para "ready" ou "failed" e por isso
// não disparam outra estimativa.
export function decide(payload: WebhookPayload): { estimate: boolean; reason: string } {
  if (payload.schema !== 'public' || payload.table !== 'products') {
    return { estimate: false, reason: 'tabela ignorada' }
  }
  const product = payload.record
  if (!product || (payload.type !== 'INSERT' && payload.type !== 'UPDATE')) {
    return { estimate: false, reason: 'evento ignorado' }
  }
  if (product.nutrition_source === 'manual') {
    return { estimate: false, reason: 'tabela preenchida manualmente' }
  }
  if (product.nutrition_status !== 'pending') {
    return { estimate: false, reason: `status ${product.nutrition_status}` }
  }

  const old = payload.old_record
  // Edição que não mexe no texto (ex.: preço) enquanto a estimativa já está em andamento.
  if (payload.type === 'UPDATE' && old?.nutrition_status === 'pending'
    && old.name === product.name && (old.description ?? '') === (product.description ?? '')) {
    return { estimate: false, reason: 'estimativa já em andamento' }
  }
  return { estimate: true, reason: payload.type === 'INSERT' ? 'produto novo' : 'produto alterado' }
}

// Valida e arredonda (1 casa) a resposta da IA; nunca confie no JSON sem checar.
export function validateNutrition(raw: unknown): { nutrition: Nutrition } | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: 'resposta não é um objeto' }
  const data = raw as Record<string, unknown>

  const unit = data.serving_unit
  if (typeof unit !== 'string' || !(SERVING_UNITS as readonly string[]).includes(unit)) {
    return { error: 'serving_unit deve ser "g" ou "ml"' }
  }
  const nutrition = { serving_unit: unit } as Nutrition
  for (const key of NUMERIC_KEYS) {
    const value = data[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) return { error: `${key} ausente ou não numérico` }
    const rounded = Math.round(value * 10) / 10
    if (rounded < 0 || rounded > LIMITS[key]) return { error: `${key} fora do intervalo` }
    nutrition[key] = rounded
  }
  if (nutrition.serving_size <= 0) return { error: 'porção deve ser maior que zero' }
  if (nutrition.protein_g + nutrition.carbs_g + nutrition.fat_g > nutrition.serving_size) {
    return { error: 'macros somam mais que a porção' }
  }
  return { nutrition }
}

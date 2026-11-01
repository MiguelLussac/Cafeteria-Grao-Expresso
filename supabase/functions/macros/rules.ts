// Regras puras da função "macros": quando estimar e como validar a resposta da IA.
// Sem dependências de Deno/Supabase para poder rodar em `node --test`.

export type ProductRow = {
  id: number
  name: string
  description: string | null
  category: string
  calories_kcal: number | string | null
  nutrition_source: string | null
}

// Formato enviado pelos Database Webhooks do Supabase.
export type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: ProductRow | null
  old_record: ProductRow | null
}

export type Nutrition = {
  serving_size_g: number
  calories_kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export const NUTRITION_KEYS = ['serving_size_g', 'calories_kcal', 'protein_g', 'carbs_g', 'fat_g'] as const

// Mesmos limites das CHECK constraints de app/models/product.py.
const LIMITS: Record<keyof Nutrition, number> = {
  serving_size_g: 5000,
  calories_kcal: 10000,
  protein_g: 5000,
  carbs_g: 5000,
  fat_g: 5000,
}

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

  const old = payload.old_record
  const sameText = payload.type === 'UPDATE' && old !== null
    && old.name === product.name && (old.description ?? '') === (product.description ?? '')
  // Evita loop: o UPDATE feito por esta própria função não muda nome nem descrição.
  if (sameText && product.calories_kcal !== null) {
    return { estimate: false, reason: 'produto sem mudanças relevantes' }
  }
  return { estimate: true, reason: payload.type === 'INSERT' ? 'produto novo' : 'produto alterado' }
}

// Valida e arredonda (1 casa) a resposta da IA; nunca confie no JSON sem checar.
export function validateNutrition(raw: unknown): { nutrition: Nutrition } | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: 'resposta não é um objeto' }
  const data = raw as Record<string, unknown>
  const nutrition = {} as Nutrition
  for (const key of NUTRITION_KEYS) {
    const value = data[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) return { error: `${key} ausente ou não numérico` }
    const rounded = Math.round(value * 10) / 10
    if (rounded < 0 || rounded > LIMITS[key]) return { error: `${key} fora do intervalo` }
    nutrition[key] = rounded
  }
  if (nutrition.serving_size_g <= 0) return { error: 'porção deve ser maior que zero' }
  if (nutrition.protein_g + nutrition.carbs_g + nutrition.fat_g > nutrition.serving_size_g) {
    return { error: 'macros somam mais que a porção' }
  }
  return { nutrition }
}

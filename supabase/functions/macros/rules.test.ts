// Roda com Node 22.6+ (`node --test supabase/functions/macros/rules.test.ts`).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decide, type ProductRow, validateNutrition, type WebhookPayload } from './rules.ts'

const pending: ProductRow = {
  id: 1, name: 'Latte', description: 'Expresso com leite', category: 'bebidas',
  nutrition_source: null, nutrition_status: 'pending',
}
const ready: ProductRow = { ...pending, nutrition_source: 'ai', nutrition_status: 'ready' }
const failed: ProductRow = { ...pending, nutrition_status: 'failed' }
const event = (type: WebhookPayload['type'], record: ProductRow | null, old_record: ProductRow | null = null): WebhookPayload =>
  ({ type, table: 'products', schema: 'public', record, old_record })

test('estima produto novo, texto alterado e "Tentar de novo"', () => {
  assert.equal(decide(event('INSERT', pending)).estimate, true)
  // A API volta o status para pending ao mudar nome/descrição.
  assert.equal(decide(event('UPDATE', { ...pending, name: 'Latte grande' }, ready)).estimate, true)
  assert.equal(decide(event('UPDATE', pending, failed)).estimate, true)
})

test('não estima de novo as gravações da própria função (sem loop)', () => {
  assert.equal(decide(event('UPDATE', ready, pending)).estimate, false)
  assert.equal(decide(event('UPDATE', failed, pending)).estimate, false)
})

test('não repete a estimativa em andamento quando só o preço muda', () => {
  assert.equal(decide(event('UPDATE', pending, pending)).estimate, false)
  assert.equal(decide(event('UPDATE', { ...pending, description: 'Com canela' }, pending)).estimate, true)
})

test('nunca sobrescreve tabela manual e ignora outros eventos', () => {
  const manual = { ...ready, nutrition_source: 'manual' }
  assert.equal(decide(event('UPDATE', { ...manual, name: 'Outro' }, manual)).estimate, false)
  assert.equal(decide(event('DELETE', null, pending)).estimate, false)
  assert.equal(decide({ ...event('INSERT', pending), table: 'orders' }).estimate, false)
})

test('valida e arredonda a resposta da IA', () => {
  assert.deepEqual(
    validateNutrition({ serving_size: 240, serving_unit: 'ml', calories_kcal: 130.25, protein_g: 7, carbs_g: 10.96, fat_g: 6, extra: 'x' }),
    { nutrition: { serving_unit: 'ml', serving_size: 240, calories_kcal: 130.3, protein_g: 7, carbs_g: 11, fat_g: 6 } },
  )
})

test('recusa respostas fora do formato ou impossíveis', () => {
  const ok = { serving_size: 200, serving_unit: 'g', calories_kcal: 150, protein_g: 8, carbs_g: 12, fat_g: 7 }
  for (const bad of [null, 'texto', { ...ok, fat_g: '7' }, { ...ok, protein_g: -1 },
    { ...ok, serving_size: 0 }, { ...ok, calories_kcal: 20000 }, { ...ok, carbs_g: 190 },
    { ...ok, serving_unit: 'kg' }, { ...ok, serving_unit: undefined }]) {
    assert.ok('error' in validateNutrition(bad), JSON.stringify(bad))
  }
})

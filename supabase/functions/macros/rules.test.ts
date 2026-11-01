// Roda com Node 22.6+ (`node --test supabase/functions/macros/rules.test.ts`).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decide, type ProductRow, validateNutrition, type WebhookPayload } from './rules.ts'

const product: ProductRow = {
  id: 1, name: 'Latte', description: 'Expresso com leite', category: 'bebidas',
  calories_kcal: null, nutrition_source: null,
}
const event = (type: WebhookPayload['type'], record: ProductRow | null, old_record: ProductRow | null = null): WebhookPayload =>
  ({ type, table: 'products', schema: 'public', record, old_record })

test('produto novo ou com nome/descrição alterados é estimado', () => {
  assert.equal(decide(event('INSERT', product)).estimate, true)
  const withAi = { ...product, calories_kcal: 150, nutrition_source: 'ai' }
  assert.equal(decide(event('UPDATE', { ...withAi, name: 'Latte Grande' }, withAi)).estimate, true)
  assert.equal(decide(event('UPDATE', { ...withAi, description: 'Com canela' }, withAi)).estimate, true)
})

test('não estima de novo a própria gravação nem mudanças só de preço', () => {
  const withAi = { ...product, calories_kcal: 150, nutrition_source: 'ai' }
  assert.equal(decide(event('UPDATE', withAi, product)).estimate, false)
  assert.equal(decide(event('UPDATE', withAi, withAi)).estimate, false)
})

test('produto sem tabela tenta de novo em qualquer edição', () => {
  assert.equal(decide(event('UPDATE', product, product)).estimate, true)
})

test('nunca sobrescreve tabela manual e ignora outros eventos', () => {
  const manual = { ...product, calories_kcal: 150, nutrition_source: 'manual' }
  assert.equal(decide(event('UPDATE', { ...manual, name: 'Outro' }, manual)).estimate, false)
  assert.equal(decide(event('DELETE', null, product)).estimate, false)
  assert.equal(decide({ ...event('INSERT', product), table: 'orders' }).estimate, false)
})

test('valida e arredonda a resposta da IA', () => {
  assert.deepEqual(
    validateNutrition({ serving_size_g: 200, calories_kcal: 152.25, protein_g: 8, carbs_g: 12.46, fat_g: 7.9, extra: 'x' }),
    { nutrition: { serving_size_g: 200, calories_kcal: 152.3, protein_g: 8, carbs_g: 12.5, fat_g: 7.9 } },
  )
})

test('recusa respostas fora do formato ou impossíveis', () => {
  const ok = { serving_size_g: 200, calories_kcal: 150, protein_g: 8, carbs_g: 12, fat_g: 7 }
  for (const bad of [null, 'texto', { ...ok, fat_g: '7' }, { ...ok, protein_g: -1 },
    { ...ok, serving_size_g: 0 }, { ...ok, calories_kcal: 20000 }, { ...ok, carbs_g: 190 }]) {
    assert.ok('error' in validateNutrition(bad), JSON.stringify(bad))
  }
})

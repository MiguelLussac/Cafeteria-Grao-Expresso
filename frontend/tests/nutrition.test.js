import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatAmount, formatInteger, formatServing, isValidImageUrl, macroShares, nutritionState,
  nutritionToInputs, orderNutrition, parseAmount, parseNutritionInputs, referenceDietPercent,
} from '../src/utils/nutrition.js'

const filled = { serving_size: '240', serving_unit: 'ml', calories_kcal: '130,3', protein_g: '7', carbs_g: '10.5', fat_g: '6,2' }
const cappuccino = { serving_size: 240, serving_unit: 'ml', calories_kcal: 130, protein_g: 7, carbs_g: 11, fat_g: 6 }
const paoDeQueijo = { serving_size: 90, serving_unit: 'g', calories_kcal: 300, protein_g: 6, carbs_g: 34, fat_g: 15 }
const brownie = { serving_size: 80, serving_unit: 'g', calories_kcal: 370, protein_g: 5, carbs_g: 44, fat_g: 20 }

test('números aceitam vírgula ou ponto e são exibidos no formato brasileiro', () => {
  assert.equal(parseAmount('12,5'), 12.5)
  assert.equal(parseAmount('12.5'), 12.5)
  assert.ok(Number.isNaN(parseAmount('')))
  assert.ok(Number.isNaN(parseAmount('-1')))
  assert.ok(Number.isNaN(parseAmount('1.000,5')))
  assert.equal(formatAmount(152.25), '152,3')
  assert.equal(formatInteger(1130.4), '1.130')
  assert.equal(formatServing(cappuccino), '240 ml')
})

test('estado da tabela: pronta, calculando há pouco ou indisponível', () => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  assert.equal(nutritionState({ nutrition: cappuccino, nutrition_status: 'ready' }, now), 'ready')
  assert.equal(nutritionState({ nutrition: null, nutrition_status: 'pending', updated_at: '2026-11-01T11:59:30' }, now), 'pending')
  // Sem resposta da IA depois de 2 minutos (ex.: ambiente local sem a Edge Function).
  assert.equal(nutritionState({ nutrition: null, nutrition_status: 'pending', updated_at: '2026-11-01T11:50:00' }, now), 'unavailable')
  assert.equal(nutritionState({ nutrition: null, nutrition_status: 'failed', updated_at: '2026-11-01T11:59:59' }, now), 'unavailable')
})

test('resumo do pedido completo bate com o design (930 kcal, 11/43/46%)', () => {
  const summary = orderNutrition([
    { name: 'Cappuccino', quantity: 2, nutrition: cappuccino },
    { name: 'Pão de queijo', quantity: 1, nutrition: paoDeQueijo },
    { name: 'Brownie', quantity: 1, nutrition: brownie },
  ])
  assert.equal(summary.status, 'complete')
  assert.deepEqual(summary.totals, { calories_kcal: 930, protein_g: 25, carbs_g: 100, fat_g: 47 })
  assert.deepEqual(macroShares(summary.totals), [11, 43, 46])
  assert.equal(referenceDietPercent(summary.totals.calories_kcal), 47)
  assert.deepEqual(summary.rows[0], { name: 'Cappuccino', quantity: 2, calories_kcal: 260, protein_g: 14, carbs_g: 22, fat_g: 12 })
})

test('resumo parcial deixa de fora os itens sem tabela e vazio quando nenhum tem', () => {
  const partial = orderNutrition([
    { name: 'Cappuccino', quantity: 2, nutrition: cappuccino },
    { name: 'Pão de queijo', quantity: 1, nutrition: paoDeQueijo },
    { name: 'Brownie', quantity: 1, nutrition: null },
  ])
  assert.equal(partial.status, 'partial')
  assert.equal(partial.totals.calories_kcal, 560)
  assert.deepEqual(partial.missing, ['Brownie'])
  assert.equal(`${partial.counted} de ${partial.count}`, '2 de 3')
  assert.equal(orderNutrition([{ name: 'Chá', quantity: 1, nutrition: null }]).status, 'empty')
  assert.deepEqual(macroShares({ protein_g: 0, carbs_g: 0, fat_g: 0 }), [0, 0, 0])
})

test('tabela vazia vira null e tabela completa vira o payload da API', () => {
  assert.deepEqual(parseNutritionInputs(nutritionToInputs(null)), { nutrition: null, errors: {} })
  const { nutrition, errors } = parseNutritionInputs(filled)
  assert.deepEqual(errors, {})
  assert.deepEqual(nutrition, {
    source: 'manual', serving_unit: 'ml', serving_size: 240, calories_kcal: 130.3, protein_g: 7, carbs_g: 10.5, fat_g: 6.2,
  })
})

test('tabela preenchida em parte ou inconsistente aponta o campo com erro', () => {
  const partial = parseNutritionInputs({ ...filled, fat_g: ' ' })
  assert.equal(partial.nutrition, null)
  assert.deepEqual(Object.keys(partial.errors), ['fat_g'])
  assert.ok(parseNutritionInputs({ ...filled, protein_g: 'abc' }).errors.protein_g)
  assert.ok(parseNutritionInputs({ ...filled, serving_size: '0' }).errors.serving_size)
  assert.ok(parseNutritionInputs({ ...filled, protein_g: '150', carbs_g: '100' }).errors.serving_size)
})

test('dados da API voltam para o formulário com vírgula decimal e unidade', () => {
  assert.deepEqual(nutritionToInputs({ ...cappuccino, carbs_g: 10.5 }), {
    serving_size: '240', calories_kcal: '130', protein_g: '7', carbs_g: '10,5', fat_g: '6', serving_unit: 'ml',
  })
})

test('URL da imagem precisa ser http(s) ou vazia', () => {
  assert.ok(isValidImageUrl(''))
  assert.ok(isValidImageUrl(' https://cdn.exemplo.com/latte.jpg '))
  assert.ok(!isValidImageUrl('exemplo.com/a.png'))
  assert.ok(!isValidImageUrl('javascript:alert(1)'))
  assert.ok(!isValidImageUrl('ftp://exemplo.com/a.png'))
})

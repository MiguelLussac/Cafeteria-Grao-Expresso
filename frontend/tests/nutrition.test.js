import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatAmount, isValidImageUrl, nutritionToInputs, parseAmount,
  parseNutritionInputs } from '../src/utils/nutrition.js'

const filled = { serving_size_g: '200', calories_kcal: '152,3', protein_g: '8', carbs_g: '12.5', fat_g: '7,9' }

test('números aceitam vírgula ou ponto e são exibidos no formato brasileiro', () => {
  assert.equal(parseAmount('12,5'), 12.5)
  assert.equal(parseAmount('12.5'), 12.5)
  assert.ok(Number.isNaN(parseAmount('')))
  assert.ok(Number.isNaN(parseAmount('-1')))
  assert.ok(Number.isNaN(parseAmount('1.000,5')))
  assert.equal(formatAmount(152.25), '152,3')
})

test('tabela vazia vira null e tabela completa vira o payload da API', () => {
  assert.deepEqual(parseNutritionInputs(nutritionToInputs(null)), { nutrition: null, errors: {} })
  const { nutrition, errors } = parseNutritionInputs(filled, 'ai')
  assert.deepEqual(errors, {})
  assert.deepEqual(nutrition, {
    source: 'ai', serving_size_g: 200, calories_kcal: 152.3, protein_g: 8, carbs_g: 12.5, fat_g: 7.9,
  })
})

test('tabela preenchida em parte ou inconsistente aponta o campo com erro', () => {
  const partial = parseNutritionInputs({ ...filled, fat_g: ' ' })
  assert.equal(partial.nutrition, null)
  assert.deepEqual(Object.keys(partial.errors), ['fat_g'])
  assert.ok(parseNutritionInputs({ ...filled, protein_g: 'abc' }).errors.protein_g)
  assert.ok(parseNutritionInputs({ ...filled, serving_size_g: '0' }).errors.serving_size_g)
  assert.ok(parseNutritionInputs({ ...filled, protein_g: '150', carbs_g: '60' }).errors.serving_size_g)
})

test('dados da API voltam para o formulário com vírgula decimal', () => {
  const inputs = nutritionToInputs({ serving_size_g: 200, calories_kcal: 152.3, protein_g: 8, carbs_g: 12.5, fat_g: 7.9 })
  assert.deepEqual(inputs, { serving_size_g: '200', calories_kcal: '152,3', protein_g: '8', carbs_g: '12,5', fat_g: '7,9' })
})

test('URL da imagem precisa ser http(s) ou vazia', () => {
  assert.ok(isValidImageUrl(''))
  assert.ok(isValidImageUrl(' https://cdn.exemplo.com/latte.jpg '))
  assert.ok(!isValidImageUrl('exemplo.com/a.png'))
  assert.ok(!isValidImageUrl('javascript:alert(1)'))
  assert.ok(!isValidImageUrl('ftp://exemplo.com/a.png'))
})

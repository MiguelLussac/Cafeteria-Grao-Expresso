import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canAccess, canChangeKitchen, homeFor } from '../src/utils/roles.js'

test('barista só acessa a cozinha entre as áreas da equipe', () => {
  assert.equal(canAccess('barista', '/cozinha'), true)
  assert.equal(canAccess('barista', '/balcao'), false)
  assert.equal(canAccess('barista', '/admin'), false)
  assert.equal(canAccess('barista', '/admin/produtos/novo'), false)
})

test('atendente acessa balcão e a fila da cozinha, mas não a administração', () => {
  assert.equal(canAccess('atendente', '/balcao'), true)
  assert.equal(canAccess('atendente', '/cozinha'), true)
  assert.equal(canAccess('atendente', '/admin'), false)
  assert.equal(canAccess('atendente', '/admin/produtos/3/editar'), false)
})

test('admin acessa todas as telas e telas públicas ficam livres', () => {
  for (const path of ['/admin', '/admin/produtos/novo', '/cozinha', '/balcao']) assert.equal(canAccess('admin', path), true)
  for (const role of ['admin', 'atendente', 'barista']) {
    assert.equal(canAccess(role, '/'), true)
    assert.equal(canAccess(role, '/pedido/resumo'), true)
  }
})

test('prefixo parecido não é confundido com área restrita', () => {
  assert.equal(canAccess('atendente', '/administracao-falsa'), true)
})

test('cada perfil volta para a própria tela inicial', () => {
  assert.equal(homeFor('admin'), '/admin')
  assert.equal(homeFor('atendente'), '/balcao')
  assert.equal(homeFor('barista'), '/cozinha')
  assert.equal(homeFor('desconhecido'), '/')
})

test('só barista e admin mudam o status dos pedidos na cozinha', () => {
  assert.equal(canChangeKitchen('barista'), true)
  assert.equal(canChangeKitchen('admin'), true)
  assert.equal(canChangeKitchen('atendente'), false)
  assert.equal(canChangeKitchen(undefined), false)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitWithin, imageTypeError } from '../src/utils/image.js'

test('reduz mantendo a proporção e nunca amplia', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1200, height: 900 })
  assert.deepEqual(fitWithin(3000, 4000), { width: 900, height: 1200 })
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 })
})

test('aceita só JPEG, PNG e WebP', () => {
  assert.equal(imageTypeError({ type: 'image/jpeg' }), '')
  assert.equal(imageTypeError({ type: 'image/webp' }), '')
  assert.ok(imageTypeError({ type: 'image/heic' }))
  assert.ok(imageTypeError({ type: 'image/gif' }))
  assert.ok(imageTypeError(null))
})

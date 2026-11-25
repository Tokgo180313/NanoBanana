import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAi147Model, imageSizesForModel, normalizeModelSettings } from '../src/views/jimeng/js/model-capabilities.ts'

test('Flash avoids unsupported resolution controls when switching from a 4K task', () => {
  const settings = { modelName: 'gemini-2.5-flash-image', imageSize: '4K', imageRatio: '16:9' }
  assert.deepEqual(normalizeModelSettings(settings), { ...settings, imageSize: '1K' })
  assert.deepEqual(imageSizesForModel(settings.modelName), ['1K'])
  assert.equal(settings.imageSize, '4K')
})

test('Pro retains supported settings through batch application, draft duplication and history reuse', () => {
  for (const imageSize of ['1K', '2K', '4K']) {
    const settings = { modelName: 'gemini-3-pro-image-preview', imageSize, imageRatio: '3:4' }
    assert.deepEqual(normalizeModelSettings(settings), settings)
  }
})

test('existing providers keep their supported sizes and reject stale Flash sizes', () => {
  for (const modelName of ['BANANA_2', 'BANANA_PRO', 'GPT_2_IMAGE']) {
    assert.deepEqual(imageSizesForModel(modelName), ['2K', '4K'])
    assert.equal(normalizeModelSettings({ modelName, imageSize: '1K' }).imageSize, '2K')
    assert.equal(isAi147Model(modelName), false)
  }
  assert.equal(isAi147Model('gemini-2.5-flash-image'), true)
  assert.equal(isAi147Model('gemini-3-pro-image-preview'), true)
})

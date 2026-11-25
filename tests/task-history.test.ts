import { accountStorage,setAccountStorageScope } from '../src/account/storage.ts'
import { LocalImageHistoryRepository,installImageHistoryRepository } from '../src/repositories/imageHistory.ts'
import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useJimengTaskStore } from '../src/stores/jimengTaskStore.ts'

let saved: Map<string, string>
beforeEach(() => {
  saved = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return saved.size },
    key: (index: number) => [...saved.keys()][index] ?? null,
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  } })
  setAccountStorageScope(1,3)
  installImageHistoryRepository(new LocalImageHistoryRepository())
  setActivePinia(createPinia())
})

test('历史参数是生成时的快照，后续设置修改不影响复用', () => {
  const store = useJimengTaskStore()
  const settings = { modelName: 'BANANA_2', imageRatio: '3:4', imageSize: '4K' }
  store.completeTaskWithPlaceholder('1', { url: '/result.png', code: '', context: '原始提示词', settings })
  settings.imageSize = '2K'
  const record = store.tasks['1']!.historyImageList[0]!
  assert.equal(record.settings?.imageSize, '4K')
  assert.equal(record.context, '原始提示词')
  assert.ok(record.createdAt)
  assert.equal(JSON.parse(accountStorage.getItem('jimeng-task-runtime-1')!).historyImageList[0].settings.imageSize, '4K')
})

test('超过保留上限时仍保留最新二十条结果', () => {
  const store = useJimengTaskStore()
  for (let i = 0; i < 25; i++) store.completeTaskWithPlaceholder('1', { url: `/result-${i}.png`, code: '', context: String(i) })
  assert.equal(store.tasks['1']!.historyImageList.length, 20)
  assert.equal(store.tasks['1']!.historyImageList[0]!.url, '/result-24.png')
  assert.equal(store.tasks['1']!.historyImageList.at(-1)!.url, '/result-5.png')
})

test('删除其他历史记录不能清除当前预览', () => {
  const store = useJimengTaskStore()
  store.completeTaskWithPlaceholder('1', { url: '/old.png', code: '', context: '' })
  const old = store.tasks['1']!.historyImageList[0]!
  store.tasks['1']!.currentUrl = '/standalone-current.png'
  store.deleteHistoryItem('1', old.uid)
  assert.equal(store.tasks['1']!.currentUrl, '/standalone-current.png')
  assert.equal(store.tasks['1']!.showStatus, '2')
})

test('清空生成记录不清空独立保存的提示词', () => {
  const store = useJimengTaskStore()
  accountStorage.setItem('jimeng-task-text-1', '保留草稿')
  store.completeTaskWithPlaceholder('1', { url: '/result.png', code: '', context: '保留草稿' })
  store.clearTaskImages('1')
  assert.equal(store.tasks['1']!.currentUrl, '')
  assert.equal(store.tasks['1']!.historyImageList.length, 0)
  assert.equal(accountStorage.getItem('jimeng-task-text-1'), '保留草稿')
})

test('本地空间不足不会把已生成的结果变成失败', () => {
  const store = useJimengTaskStore()
  localStorage.setItem = () => { throw new Error('QuotaExceededError') }
  assert.doesNotThrow(() => store.completeTaskWithPlaceholder('1', { url: '/result.png', code: '', context: '' }))
  assert.equal(store.tasks['1']!.showStatus, '2')
  assert.equal(store.tasks['1']!.currentUrl, '/result.png')
  assert.ok(store.persistenceError)
})

test('刷新后独立恢复各任务参数，包括尚未生成图片的草稿', () => {
  const store = useJimengTaskStore()
  const first = { modelName: 'gemini-2.5-flash-image', imageRatio: '9:16', imageSize: '1K' }
  const second = { modelName: 'gemini-3-pro-image-preview', imageRatio: '16:9', imageSize: '2K' }
  store.setTaskSettings('1', first)
  store.setTaskSettings('2', second)
  first.imageRatio = '1:1'
  setActivePinia(createPinia())
  const restored = useJimengTaskStore()
  restored.ensureTask('1')
  restored.ensureTask('2')
  assert.deepEqual(restored.tasks['1']!.settings, { ...first, imageRatio: '9:16' })
  assert.deepEqual(restored.tasks['2']!.settings, second)
  assert.equal(restored.tasks['2']!.currentUrl, '')
})

test('旧数据从当前预览对应记录恢复参数，不能使用另一条较新的记录', () => {
  const store = useJimengTaskStore()
  const previous = { modelName: 'gemini-2.5-flash-image', imageRatio: '9:16', imageSize: '1K' }
  store.completeTaskWithPlaceholder('1', { url: '/portrait.png', code: 'old', context: '', settings: previous })
  const old = store.tasks['1']!.historyImageList[0]!
  store.completeTaskWithPlaceholder('1', { url: '/wide.png', code: 'new', context: '', settings: { modelName: 'BANANA_PRO', imageRatio: '21:9', imageSize: '4K' } })
  store.viewHistoryItem('1', old)
  setActivePinia(createPinia())
  const restored = useJimengTaskStore()
  restored.ensureTask('1')
  assert.equal(restored.tasks['1']!.currentUrl, '/portrait.png')
  assert.deepEqual(restored.tasks['1']!.settings, previous)
})

test('保存的草稿参数优先于旧图片参数，缺少匹配记录时不猜测参数', () => {
  const store = useJimengTaskStore()
  store.completeTaskWithPlaceholder('1', { url: '/old.png', code: '', context: '', settings: { modelName: 'BANANA_2', imageRatio: '3:4', imageSize: '4K' } })
  const draft = { modelName: 'gemini-3-pro-image-preview', imageRatio: '1:1', imageSize: '1K' }
  store.setTaskSettings('1', draft)
  store.completeTaskWithPlaceholder('2', { url: '/different.png', code: '', context: '', settings: draft })
  store.tasks['2']!.currentUrl = '/unmatched.png'
  store.persistTask('2')
  setActivePinia(createPinia())
  const restored = useJimengTaskStore()
  restored.ensureTask('1')
  restored.ensureTask('2')
  assert.deepEqual(restored.tasks['1']!.settings, draft)
  assert.equal(restored.tasks['2']!.settings, undefined)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { LocalImageHistoryRepository, installImageHistoryRepository, IMAGE_HISTORY_KEY, type ImageHistoryRecord, type ImageHistoryQuery } from '../src/repositories/imageHistory.ts'
import { useJimengTaskStore } from '../src/stores/jimengTaskStore.ts'
import { useImageHistoryStore } from '../src/stores/imageHistoryStore.ts'

class MemoryStorage {
  values = new Map<string, string>()
  get length() { return this.values.size }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}
const query: ImageHistoryQuery = { search: '', model: '', sort: 'newest', page: 1, pageSize: 20 }
function record(index: number): ImageHistoryRecord {
  return { id: `1:${index}`, taskId: '1', url: `/image-${index}.png`, code: '', prompt: `测试提示词 ${index}`, settings: { modelName: index % 2 ? 'BANANA_PRO' : 'BANANA_2', imageRatio: '3:4', imageSize: '4K' }, createdAt: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString() }
}

test('导入旧任务记录且不会为缺失的时间或参数编造数值', async () => {
  const storage = new MemoryStorage()
  storage.setItem('jimeng-task-runtime-4', JSON.stringify({ historyImageList: [{ uid: 'old', url: '/old.png', code: '', context: '原始内容' }] }))
  storage.setItem('jimeng-task-runtime-broken', '{bad')
  const repo = new LocalImageHistoryRepository(storage)
  await repo.initialize(); await repo.initialize()
  const page = await repo.list(query)
  assert.equal(page.total, 1)
  assert.equal(page.items[0]?.id, '4:old')
  assert.equal(page.items[0]?.prompt, '原始内容')
  assert.equal(page.items[0]?.settings, undefined)
  assert.equal(page.items[0]?.createdAt, undefined)
})

test('超过任务卡二十条后仍可在独立归档中完整分页', async () => {
  const repo = new LocalImageHistoryRepository(new MemoryStorage())
  await Promise.all(Array.from({ length: 45 }, (_, i) => repo.append(record(i))))
  const first = await repo.list(query)
  const last = await repo.list({ ...query, page: 3 })
  assert.equal(first.total, 45)
  assert.equal(first.items.length, 20)
  assert.equal(last.items.length, 5)
  assert.equal(first.items[0]?.id, '1:44')
  assert.equal(last.items.at(-1)?.id, '1:0')
  assert.equal(new Set([...first.items, ...last.items].map(item => item.id)).size, 25)
})

test('搜索和模型筛选在分页前执行，并准确返回匹配总数', async () => {
  const repo = new LocalImageHistoryRepository(new MemoryStorage())
  for (let i = 0; i < 30; i++) await repo.append(record(i))
  const result = await repo.list({ ...query, search: 'Banana Pro', model: 'BANANA_PRO', pageSize: 10, page: 2 })
  assert.equal(result.total, 15)
  assert.equal(result.items.length, 5)
  assert.ok(result.items.every(item => item.settings?.modelName === 'BANANA_PRO'))
  const oldest = await repo.list({ ...query, sort: 'oldest' })
  assert.equal(oldest.items[0]?.id, '1:0')
})

test('重复归档不会覆盖原始提示词和参数，长文本不会截断', async () => {
  const repo = new LocalImageHistoryRepository(new MemoryStorage())
  const item = { ...record(1), prompt: '长提示词\n'.repeat(3000) }
  await repo.append(item)
  await repo.append({ ...item, prompt: '后续编辑内容' })
  const result = await repo.list(query)
  assert.equal(result.total, 1)
  assert.equal(result.items[0]?.prompt, item.prompt)
})

test('未知日期的旧记录始终放在已知日期之后', async () => {
  const repo = new LocalImageHistoryRepository(new MemoryStorage())
  await repo.append({ ...record(0), createdAt: undefined })
  await repo.append(record(1))
  for (const sort of ['newest', 'oldest'] as const) {
    const result = await repo.list({ ...query, sort })
    assert.equal(result.items[0]?.id, '1:1')
    assert.equal(result.items[1]?.id, '1:0')
  }
})

test('无法识别的历史存储不会被新结果静默覆盖', async () => {
  const storage = new MemoryStorage()
  storage.setItem(IMAGE_HISTORY_KEY, '{broken')
  const repo = new LocalImageHistoryRepository(storage)
  await assert.rejects(repo.append(record(1)))
  assert.equal(storage.getItem(IMAGE_HISTORY_KEY), '{broken')
})

test('生成成功会独立归档，清空与删除任务卡不删除归档', async () => {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  installImageHistoryRepository(new LocalImageHistoryRepository(storage))
  setActivePinia(createPinia())
  const tasks = useJimengTaskStore(), history = useImageHistoryStore()
  for (let i = 0; i < 25; i++) tasks.completeTaskWithPlaceholder('7', { url: `/result-${i}.png`, code: '', context: `文案 ${i}` })
  assert.equal(await history.ensureSaved(), true)
  tasks.clearTaskImages('7'); tasks.clearTask('7')
  await history.load(query)
  assert.equal(history.total, 25)
  assert.equal(tasks.tasks['7']?.historyImageList.length, 0)
  const original = history.items[0]!
  history.prepareReuse(original)
  const draft = history.consumeReuse()
  assert.equal(draft?.prompt, original.prompt)
  assert.equal(history.consumeReuse(), null)
})

import { defineStore } from 'pinia'
import { imageHistoryRepository, type ImageHistoryQuery, type ImageHistoryRecord } from '../repositories/imageHistory.ts'

const pendingWrites = new WeakMap<object, Set<Promise<void>>>()
function pendingFor(owner: object) {
  let pending = pendingWrites.get(owner)
  if (!pending) { pending = new Set(); pendingWrites.set(owner, pending) }
  return pending
}
const defaultQuery: ImageHistoryQuery = { search: '', model: '', sort: 'newest', page: 1, pageSize: 20 }
export const useImageHistoryStore = defineStore('imageHistory', {
  state: () => ({
    items: [] as ImageHistoryRecord[], total: 0, models: [] as string[],
    loading: false, loadError: '', writeError: '', initialized: false,
    query: { ...defaultQuery }, requestVersion: 0,
    failedRecords: [] as ImageHistoryRecord[],
    pendingReuse: null as ImageHistoryRecord | null,
    revision: 0,
  }),
  getters: { storageLocation: () => imageHistoryRepository.storageLocation },
  actions: {
    async initialize(): Promise<boolean> {
      if (this.initialized) return true
      try { await imageHistoryRepository.initialize(); this.initialized = true; this.writeError = ''; return true }
      catch { this.writeError = '部分历史记录未能归档，请下载重要图片后释放浏览器存储空间，再重试保存。'; return false }
    },
    async record(record: ImageHistoryRecord) {
      const operation = imageHistoryRepository.append(record)
      const pending = pendingFor(this)
      pending.add(operation)
      try {
        await operation
        this.initialized = true
        this.failedRecords = this.failedRecords.filter(item => item.id !== record.id)
        if (!this.failedRecords.length) this.writeError = ''
        this.revision++
      } catch {
        if (!this.failedRecords.some(item => item.id === record.id)) this.failedRecords.push(record)
        this.writeError = '历史归档未能保存。当前任务的图片仍可下载，请释放浏览器存储空间后重试保存。'
      } finally { pending.delete(operation) }
    },
    async ensureSaved(): Promise<boolean> {
      if (!await this.initialize()) return false
      await Promise.allSettled([...pendingFor(this)])
      for (const record of [...this.failedRecords]) await this.record(record)
      return this.failedRecords.length === 0
    },
    async load(query?: ImageHistoryQuery) {
      const requested = { ...(query ?? this.query) }
      this.query = requested
      const version = ++this.requestVersion
      this.loading = true; this.loadError = ''
      try {
        await this.initialize()
        const result = await imageHistoryRepository.list(requested)
        if (version !== this.requestVersion) return
        this.items = result.items; this.total = result.total; this.models = result.models
      } catch {
        if (version === this.requestVersion) this.loadError = '暂时无法读取历史记录，请重试。'
      } finally { if (version === this.requestVersion) this.loading = false }
    },
    prepareReuse(record: ImageHistoryRecord) {
      this.pendingReuse = { ...record, settings: record.settings ? { ...record.settings } : undefined }
    },
    consumeReuse() {
      const draft = this.pendingReuse
      this.pendingReuse = null
      return draft
    },
  },
})

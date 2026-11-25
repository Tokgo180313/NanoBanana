/** Replace this repository with an HTTP adapter when server/database storage is ready. */
export interface ImageHistoryRecord {
  id: string
  taskId: string
  url: string
  code: string
  prompt: string
  modelName?: string
  settings?: { modelName: string; imageRatio: string; imageSize: string }
  createdAt?: string
}
export interface ImageHistoryQuery {
  search: string
  model: string
  sort: 'newest' | 'oldest'
  page: number
  pageSize: number
}
export interface ImageHistoryPage {
  items: ImageHistoryRecord[]
  total: number
  models: string[]
}
export interface ImageHistoryRepository {
  readonly storageLocation: 'browser' | 'server'
  initialize(): Promise<void>
  list(query: ImageHistoryQuery): Promise<ImageHistoryPage>
  append(record: ImageHistoryRecord): Promise<void>
}
export const IMAGE_HISTORY_KEY = 'banana-image-history-v1'
type HistoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>

function asRecord(value: unknown): ImageHistoryRecord | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<ImageHistoryRecord>
  if (typeof item.id !== 'string' || typeof item.taskId !== 'string' || typeof item.url !== 'string' || !item.url) return null
  const settings = item.settings
  return {
    id: item.id, taskId: item.taskId, url: item.url,
    code: typeof item.code === 'string' ? item.code : '',
    prompt: typeof item.prompt === 'string' ? item.prompt : '',
    modelName: typeof item.modelName === 'string' ? item.modelName : undefined,
    createdAt: typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : undefined,
    settings: settings && typeof settings.modelName === 'string' && typeof settings.imageRatio === 'string' && typeof settings.imageSize === 'string' ? { ...settings } : undefined,
  }
}
export class LocalImageHistoryRepository implements ImageHistoryRepository {
  readonly storageLocation = 'browser' as const
  private storageOverride?: HistoryStorage
  private initialized = false
  constructor(storage?: HistoryStorage) { this.storageOverride = storage }
  private get storage(): HistoryStorage { return this.storageOverride ?? localStorage }
  private read(): ImageHistoryRecord[] {
    const raw = this.storage.getItem(IMAGE_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) throw new Error('历史数据格式无法识别')
    return parsed.items.map(asRecord).filter((item: ImageHistoryRecord | null): item is ImageHistoryRecord => !!item)
  }
  private save(records: ImageHistoryRecord[]) {
    this.storage.setItem(IMAGE_HISTORY_KEY, JSON.stringify({ version: 1, items: records }))
  }
  async initialize() {
    if (this.initialized) return
    const records = this.read()
    const ids = new Set(records.map(item => item.id))
    let changed = false
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)
      if (!key?.startsWith('jimeng-task-runtime-')) continue
      const taskId = key.slice('jimeng-task-runtime-'.length)
      let legacy: unknown
      try { legacy = JSON.parse(this.storage.getItem(key) || 'null') } catch { continue }
      const history = (legacy as { historyImageList?: unknown[] } | null)?.historyImageList
      if (!Array.isArray(history)) continue
      for (const entry of history) {
        if (!entry || typeof entry !== 'object') continue
        const old = entry as Record<string, unknown>
        if (typeof old.uid !== 'string') continue
        const record = asRecord({ ...old, id: `${taskId}:${old.uid}`, taskId, prompt: old.context })
        if (!record || ids.has(record.id)) continue
        records.push(record); ids.add(record.id); changed = true
      }
    }
    if (changed) this.save(records)
    this.initialized = true
  }
  async append(record: ImageHistoryRecord) {
    await this.initialize()
    const validated = asRecord(record)
    if (!validated) throw new Error('生成记录不完整')
    const records = this.read()
    if (records.some(item => item.id === validated.id)) return
    this.save([validated, ...records])
  }
  async list(query: ImageHistoryQuery): Promise<ImageHistoryPage> {
    const all = this.read()
    const models = [...new Set(all.map(item => item.settings?.modelName || ''))].sort()
    const normalize = (value: string) => value.toLocaleLowerCase().replace(/[\s_·-]+/g, '')
    const needle = normalize(query.search.trim())
    const records = all.filter(item => (!query.model || (query.model === '__unknown__' ? !item.settings?.modelName : item.settings?.modelName === query.model)) && (!needle || normalize(`${item.prompt} ${item.settings?.modelName || ''}`).includes(needle)))
    records.sort((a, b) => {
      const at = a.createdAt ? Date.parse(a.createdAt) : NaN
      const bt = b.createdAt ? Date.parse(b.createdAt) : NaN
      if (!Number.isFinite(at)) return Number.isFinite(bt) ? 1 : a.id.localeCompare(b.id)
      if (!Number.isFinite(bt)) return -1
      return (query.sort === 'newest' ? bt - at : at - bt) || a.id.localeCompare(b.id)
    })
    const page = Math.max(1, query.page)
    const pageSize = Math.max(1, Math.min(100, query.pageSize))
    return { items: records.slice((page - 1) * pageSize, page * pageSize), total: records.length, models }
  }
}
// This is the only binding to replace with the future database-backed API adapter.
export class ServerImageHistoryRepository implements ImageHistoryRepository {
 readonly storageLocation='server' as const
 async initialize(){}
 async append(record:ImageHistoryRecord){if(!/^\/api\/workbench\/assets\/nb-asset-[a-z0-9-]+\/preview$/.test(record.url))throw new Error('未经验证的旧记录不能归入当前账号');/* The authenticated backend has already persisted this generated asset. */}
 async list(query:ImageHistoryQuery):Promise<ImageHistoryPage>{const {request}=await import('../utils/request.ts');return request<ImageHistoryPage>({url:'/api/workbench/assets',method:'get',params:query})}
}
export let imageHistoryRepository:ImageHistoryRepository=new ServerImageHistoryRepository()
/** Explicit test/legacy tooling hook; the application never installs the unscoped browser repository. */
export function installImageHistoryRepository(repository:ImageHistoryRepository){imageHistoryRepository=repository}

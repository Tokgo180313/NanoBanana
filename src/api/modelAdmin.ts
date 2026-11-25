import { request } from '../utils/request'

export type MediaKind = 'image' | 'video' | 'text'
export interface Provider {
  id: string
  name: string
  apiUrl: string
  protocol: string
  version: number
  keyConfigured: boolean
  modelCount: number
}
export interface ModelCapabilities {
  ratios?: string[]
  sizes?: string[]
  maxReferenceImages?: number
  resolutions?: string[]
  minDuration?: number
  maxDuration?: number
  maxMaterials?: number
}
export interface Model {
  id: string
  providerId: string
  upstreamModelId: string
  name: string
  kind: MediaKind
  capabilities: ModelCapabilities
  enabled: boolean
  isDefault: boolean
  sortOrder: number
  version: number
}
export interface Adapter { id: string; label: string; kind: MediaKind }
export type AuditEntity = 'provider' | 'model' | 'default'
interface Change {
  id: string
  actorId: string
  action: string
  createdAt: string
  details: unknown
}
const root = '/api/admin'
export const providers = () => request<Provider[]>({ url: `${root}/providers` })
export const models = () => request<Model[]>({ url: `${root}/models` })
export const adapters = () => request<Adapter[]>({ url: `${root}/model-adapters` })
export const changes = (entityType: AuditEntity, entityId: string, page: number) =>
  request<{ items: Change[]; hasNext: boolean }>({
    url: `${root}/model-config-changes`, params: { entityType, entityId, page },
  })
export const saveProvider = (data: { name: string; apiUrl: string; protocol: string; apiKey?: string; version?: number }, id?: string) =>
  request<{ id: string }>({ url: `${root}/providers${id ? '/' + id : ''}`, method: id ? 'patch' : 'post', data })
export const createModel = (data: Pick<Model, 'providerId' | 'upstreamModelId' | 'name' | 'kind' | 'capabilities' | 'sortOrder'>) =>
  request<{ id: string }>({ url: `${root}/models`, method: 'post', data })
export const updateModel = (id: string, data: Partial<Pick<Model, 'name' | 'capabilities' | 'sortOrder' | 'enabled'>> & {
  version: number; setDefault?: boolean; replacementId?: string
}) => request<{ id: string }>({ url: `${root}/models/${id}`, method: 'patch', data })

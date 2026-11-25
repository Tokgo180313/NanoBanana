import { request } from '../utils/request'

export type VideoStatus =
  | 'submitting' | 'submission_unknown' | 'queued' | 'running'
  | 'succeeded' | 'failed' | 'cancelled' | 'expired'

export interface VideoTask {
  id: string
  status: VideoStatus
  prompt: string
  model: string
  modelId?: string
  duration: number
  resolution: string
  ratio: string
  sound: boolean
  createdAt: string
  videoUrl?: string
  expiresAt?: string
  error?: string
}

const tasksUrl = '/api/videos/tasks'

export function createVideoTask(data: FormData) {
  return request<VideoTask>({ url: tasksUrl, method: 'post', data, timeout: 60_000, silentError: true })
}

export function listVideoTasks(page: number, signal: AbortSignal) {
  return request<{ items: VideoTask[]; hasMore: boolean }>({
    url: tasksUrl, params: { page }, signal, timeout: 15_000, silentError: true,
  })
}

export function queryVideoTask(id: string, signal: AbortSignal) {
  return request<VideoTask>({
    url: `${tasksUrl}/${encodeURIComponent(id)}`, signal, timeout: 15_000, silentError: true,
  })
}

export function videoDownloadUrl(id: string) {
  return `${tasksUrl}/${encodeURIComponent(id)}/download`
}

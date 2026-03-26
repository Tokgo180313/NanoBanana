import { defineStore } from 'pinia'
import { generateImageApi } from '../api/images'

export type RequestStatus = '未开始' | '生成中' | '已完成' | '失败'
export type SlotId = 'slot1' | 'slot2' | 'slot3'

export const slotIds: SlotId[] = ['slot1', 'slot2', 'slot3']

export interface HistoryItem {
  id: string
  createdAt: number
  imageUrl: string
}

export interface SlotState {
  status: RequestStatus
  uploadedFile: File | null
  uploadedImageUrl: string | null

  generatedImageUrl: string | null
  errorMessage: string | null

  history: HistoryItem[]
  abortController: AbortController | null
}

export const useGenerateStore = defineStore('generate', {
  state: (): { slots: Record<SlotId, SlotState> } => ({
    slots: {
      slot1: {
        status: '未开始',
        uploadedFile: null,
        uploadedImageUrl: null,
        generatedImageUrl: null,
        errorMessage: null,
        history: [],
        abortController: null,
      },
      slot2: {
        status: '未开始',
        uploadedFile: null,
        uploadedImageUrl: null,
        generatedImageUrl: null,
        errorMessage: null,
        history: [],
        abortController: null,
      },
      slot3: {
        status: '未开始',
        uploadedFile: null,
        uploadedImageUrl: null,
        generatedImageUrl: null,
        errorMessage: null,
        history: [],
        abortController: null,
      },
    },
  }),

  actions: {
    async setUploadedImage(slotId: SlotId, file: File) {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onerror = () => reject(new Error('读取图片失败'))
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.readAsDataURL(file)
      })

      const slot = this.slots[slotId]
      slot.uploadedFile = file
      slot.uploadedImageUrl = dataUrl
    },

    cancel(slotId: SlotId) {
      const slot = this.slots[slotId]
      if (slot.abortController) {
        slot.abortController.abort()
      }
      slot.abortController = null
      slot.status = '未开始'
      slot.errorMessage = null
    },

    async generate(
      slotId: SlotId,
      params: { model: string; version: string; resolution: string },
    ) {
      const slot = this.slots[slotId]
      if (!slot.uploadedFile) {
        throw new Error('请先上传图片')
      }

      slot.abortController?.abort()
      const controller = new AbortController()
      slot.abortController = controller

      slot.status = '生成中'
      slot.errorMessage = null

      const formData = new FormData()
      formData.append('model', params.model)
      formData.append('version', params.version)
      formData.append('resolution', params.resolution)
      formData.append('file', slot.uploadedFile)

      try {
        const resp = await generateImageApi(formData, controller.signal)
        const imageValue = extractImageString(resp)
        if (!imageValue) {
          throw new Error('服务端未返回图片结果')
        }

        const imageUrl = toImageUrl(imageValue)
        slot.generatedImageUrl = imageUrl
        slot.status = '已完成'
        slot.errorMessage = null
        slot.abortController = null

        const item: HistoryItem = {
          id: createId(),
          createdAt: Date.now(),
          imageUrl,
        }
        slot.history = [item, ...slot.history].slice(0, 3)
      } catch (err) {
        if (isAbortError(err)) {
          slot.status = '未开始'
          slot.errorMessage = null
          slot.abortController = null
          return
        }

        slot.status = '失败'
        slot.errorMessage = err instanceof Error ? err.message : '生成失败'
        slot.abortController = null
      }
    },
  },
})

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function extractImageString(resp: unknown): string | null {
  if (typeof resp === 'string' && resp.length > 0) return resp
  if (!resp || typeof resp !== 'object') return null

  const r = resp as Record<string, unknown>
  const candidates: unknown[] = [
    r.image,
    r.imageUrl,
    r.url,
    r.result,
    r.data,
    (r as any)?.data?.image,
    (r as any)?.data?.imageUrl,
    (r as any)?.data?.url,
  ]

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c
  }

  return null
}

function toImageUrl(imageValue: string) {
  const s = imageValue.trim()
  if (s.startsWith('data:')) return s
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return s
  return `data:image/png;base64,${s}`
}

function isAbortError(err: unknown) {
  if (!err) return false
  if (err instanceof DOMException) return err.name === 'AbortError'
  if (typeof err === 'object') {
    const anyErr = err as any
    return anyErr.name === 'CanceledError' || anyErr.code === 'ERR_CANCELED'
  }
  return false
}


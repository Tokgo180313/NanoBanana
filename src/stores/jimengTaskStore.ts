import { accountStorage } from '../account/storage.ts'
import { defineStore } from 'pinia'
import { useImageHistoryStore } from './imageHistoryStore.ts'

export type TaskShowStatus = '0' | '1' | '2' | '3'

export interface HistoryImageItem {
  uid: string
  url: string
  code: string
  context: string
  modelName?: string
  settings?: { modelName: string; imageRatio: string; imageSize: string }
  createdAt?: string
}

export interface TaskRuntimeState {
  settings?: HistoryImageItem['settings']
  showStatus: TaskShowStatus
  responseErrorText: string

  responseLoading: boolean
  generatedTaskId: string
  currentUrlCode: string
  currentUrl: string

  historyImageList: HistoryImageItem[]
  requestTimerId: number | null
}

function createDefaultRuntimeState(): TaskRuntimeState {
  return {
    showStatus: '0',
    responseErrorText: '',

    responseLoading: false,
    generatedTaskId: '',
    currentUrlCode: '',
    currentUrl: '',

    historyImageList: [],
    requestTimerId: null,
  }
}

const TASK_STORAGE_KEY_PREFIX = 'jimeng-task-runtime-'

type PersistedTaskRuntimeState = Omit<TaskRuntimeState, 'requestTimerId' | 'responseLoading'>

function getTaskStorageKey(taskId: string) {
  return `${TASK_STORAGE_KEY_PREFIX}${taskId}`
}

function toPersisted(runtime: TaskRuntimeState): PersistedTaskRuntimeState {
  return {
    settings: runtime.settings,
    showStatus: runtime.showStatus,
    responseErrorText: runtime.responseErrorText,
    generatedTaskId: runtime.generatedTaskId,
    currentUrlCode: runtime.currentUrlCode,
    currentUrl: runtime.currentUrl,
    historyImageList: runtime.historyImageList,
  }
}

function safeLoadTask(taskId: string): PersistedTaskRuntimeState | null {
  try {
    const raw = accountStorage.getItem(getTaskStorageKey(taskId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedTaskRuntimeState>
    if (!parsed || typeof parsed !== 'object') return null
    const currentRecord = parsed.currentUrl && Array.isArray(parsed.historyImageList)
      ? parsed.historyImageList.find(item => item?.url === parsed.currentUrl && item.code === parsed.currentUrlCode)
      : undefined
    const settings = parsed.settings ?? currentRecord?.settings
    return {
      settings: settings && typeof settings.modelName === 'string' && typeof settings.imageRatio === 'string' && typeof settings.imageSize === 'string'
        ? { ...settings } : undefined,
      showStatus:
        parsed.showStatus === '0' ||
        parsed.showStatus === '1' ||
        parsed.showStatus === '2' ||
        parsed.showStatus === '3'
          ? parsed.showStatus
          : '0',
      responseErrorText: typeof parsed.responseErrorText === 'string' ? parsed.responseErrorText : '',
      generatedTaskId:
        typeof parsed.generatedTaskId === 'string' ? parsed.generatedTaskId : '',
      currentUrlCode: typeof parsed.currentUrlCode === 'string' ? parsed.currentUrlCode : '',
      currentUrl: typeof parsed.currentUrl === 'string' ? parsed.currentUrl : '',
      historyImageList: Array.isArray(parsed.historyImageList)
        ? parsed.historyImageList.filter((x: any) => x && typeof x.uid === 'string')
        : [],
    }
  } catch {
    return null
  }
}

export const useJimengTaskStore = defineStore('jimengTask', {
  state: (): { tasks: Record<string, TaskRuntimeState>; persistenceError: string } => ({
    tasks: {},
    persistenceError: '',
  }),

  actions: {
    setTaskSettings(taskId: string, settings: NonNullable<HistoryImageItem['settings']>) {
      this.ensureTask(taskId)
      this.tasks[taskId].settings = { ...settings }
      this.persistTask(taskId)
    },
    persistTask(taskId: string) {
      const runtime = this.tasks[taskId]
      if (!runtime) return
      try {
        accountStorage.setItem(getTaskStorageKey(taskId), JSON.stringify(toPersisted(runtime)))
        this.persistenceError = ''
      } catch {
        this.persistenceError = '浏览器存储空间不足，部分生成记录无法保存。请先下载重要图片，再清理本地历史。'
      }
    },

    removePersistedTask(taskId: string) {
      accountStorage.removeItem(getTaskStorageKey(taskId))
    },

    ensureTask(taskId: string) {
      if (!this.tasks[taskId]) {
        const loaded = safeLoadTask(taskId)
        this.tasks[taskId] = {
          ...createDefaultRuntimeState(),
          ...(loaded ?? {}),
          responseLoading: false,
          requestTimerId: null,
        }
      }
    },

    clearTask(taskId: string) {
      const runtime = this.tasks[taskId]
      if (!runtime) return
      if (runtime.requestTimerId) {
        window.clearTimeout(runtime.requestTimerId)
      }
      this.tasks[taskId] = createDefaultRuntimeState()
      this.removePersistedTask(taskId)
    },

    startTask(taskId: string) {
      this.ensureTask(taskId)
      const runtime = this.tasks[taskId]

      if (runtime.requestTimerId) {
        window.clearTimeout(runtime.requestTimerId)
      }

      runtime.showStatus = '1'
      runtime.responseLoading = true
      runtime.responseErrorText = ''
      runtime.generatedTaskId = ''
      this.persistTask(taskId)
    },

    setGeneratedTaskId(taskId: string, generatedTaskId: string) {
      this.ensureTask(taskId)
      this.tasks[taskId].generatedTaskId = generatedTaskId
      this.persistTask(taskId)
    },

    setError(taskId: string, message: string) {
      this.ensureTask(taskId)
      const runtime = this.tasks[taskId]

      if (runtime.requestTimerId) {
        window.clearTimeout(runtime.requestTimerId)
      }

      runtime.requestTimerId = null
      runtime.showStatus = '3'
      runtime.responseLoading = false
      runtime.responseErrorText = message
      runtime.currentUrlCode = ''
      runtime.currentUrl = ''
      this.persistTask(taskId)
    },

    cancelTask(taskId: string) {
      this.ensureTask(taskId)
      const runtime = this.tasks[taskId]

      if (runtime.requestTimerId) {
        window.clearTimeout(runtime.requestTimerId)
      }

      runtime.requestTimerId = null
      runtime.showStatus = '0'
      runtime.responseLoading = false
      runtime.responseErrorText = ''
      runtime.currentUrlCode = ''
      runtime.currentUrl = ''
      this.persistTask(taskId)
    },

    completeTaskWithPlaceholder(
      taskId: string,
      payload: { url: string; code: string; context: string; modelName?: string; settings?: HistoryImageItem['settings'] },
    ) {
      this.ensureTask(taskId)
      const runtime = this.tasks[taskId]

      if (runtime.requestTimerId) {
        window.clearTimeout(runtime.requestTimerId)
      }

      runtime.requestTimerId = null
      runtime.showStatus = '2'
      runtime.responseLoading = false
      runtime.responseErrorText = ''

      runtime.currentUrlCode = payload.code
      runtime.currentUrl = payload.url

      const uid = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      runtime.historyImageList.unshift({
        uid,
        url: payload.url,
        code: payload.code,
        context: payload.context,
        modelName: payload.modelName,
        settings: payload.settings ? { ...payload.settings } : undefined,
        createdAt: new Date().toISOString(),
      })
      runtime.historyImageList = runtime.historyImageList.slice(0, 20)
      this.persistTask(taskId)
      void useImageHistoryStore().record({
        id: `${taskId}:${uid}`, taskId, url: payload.url, code: payload.code,
        prompt: payload.context, modelName: payload.modelName, settings: payload.settings ? { ...payload.settings } : undefined,
        createdAt: runtime.historyImageList[0]?.createdAt,
      })
    },

    viewHistoryItem(taskId: string, item: HistoryImageItem) {
      this.ensureTask(taskId)
      const runtime = this.tasks[taskId]
      runtime.showStatus = '2'
      runtime.responseLoading = false
      runtime.responseErrorText = ''
      runtime.currentUrlCode = item.code
      runtime.currentUrl = item.url
      this.persistTask(taskId)
    },

    deleteHistoryItem(taskId: string, uid: string) {
      this.ensureTask(taskId)
      const runtime = this.tasks[taskId]
      const removed = runtime.historyImageList.find((x) => x.uid === uid)
      runtime.historyImageList = runtime.historyImageList.filter((x) => x.uid !== uid)
      const isCurrentDeleted = !!removed && removed.url === runtime.currentUrl && removed.code === runtime.currentUrlCode && !runtime.historyImageList.some(x => x.url === runtime.currentUrl && x.code === runtime.currentUrlCode)
      if (isCurrentDeleted) {
        runtime.currentUrlCode = ''
        runtime.currentUrl = ''
        runtime.showStatus = '0'
      }
      this.persistTask(taskId)
    },

    clearTaskImages(taskId: string) {
      this.ensureTask(taskId)
      const runtime = this.tasks[taskId]
      runtime.currentUrlCode = ''
      runtime.currentUrl = ''
      runtime.historyImageList = []
      runtime.responseErrorText = ''
      runtime.showStatus = '0'
      runtime.responseLoading = false
      if (runtime.requestTimerId) {
        window.clearTimeout(runtime.requestTimerId)
      }
      runtime.requestTimerId = null
      this.persistTask(taskId)
    },

    setRequestTimerId(taskId: string, timerId: number) {
      this.ensureTask(taskId)
      this.tasks[taskId].requestTimerId = timerId
    },
  },
})


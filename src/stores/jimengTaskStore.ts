import { defineStore } from 'pinia'

export type TaskShowStatus = '0' | '1' | '2' | '3'

export interface HistoryImageItem {
  uid: string
  url: string
  code: string
  context: string
}

export interface TaskRuntimeState {
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
    const raw = localStorage.getItem(getTaskStorageKey(taskId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedTaskRuntimeState>
    if (!parsed || typeof parsed !== 'object') return null
    return {
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
  state: (): { tasks: Record<string, TaskRuntimeState> } => ({
    tasks: {},
  }),

  actions: {
    persistTask(taskId: string) {
      const runtime = this.tasks[taskId]
      if (!runtime) return
      localStorage.setItem(getTaskStorageKey(taskId), JSON.stringify(toPersisted(runtime)))
    },

    removePersistedTask(taskId: string) {
      localStorage.removeItem(getTaskStorageKey(taskId))
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
      payload: { url: string; code: string; context: string },
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
      })
      runtime.historyImageList = runtime.historyImageList.slice(0, 3)
      this.persistTask(taskId)
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
      runtime.historyImageList = runtime.historyImageList.filter((x) => x.uid !== uid)

      const isCurrentDeleted = !runtime.historyImageList.some(
        (x) => x.url === runtime.currentUrl && x.code === runtime.currentUrlCode,
      )
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


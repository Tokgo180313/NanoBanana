import { computed, ref, shallowRef } from 'vue'
import { isAxiosError } from 'axios'
import { request } from '../utils/request'

type CatalogModel<C> = { id: string; name: string; capabilities: C }
export type ImageModel = CatalogModel<{ ratios: string[]; sizes: string[]; maxReferenceImages: number }> & {
  referenceMode: 'upload' | 'inline'
}
export type VideoModel = CatalogModel<{
  ratios: string[]
  resolutions: string[]
  minDuration: number
  maxDuration: number
  maxMaterials: number
}>

export function useGenerationCatalog<K extends 'image' | 'video'>(kind: K) {
  type Model = K extends 'image' ? ImageModel : VideoModel
  const catalog = shallowRef<{ defaultModelId: string | null; models: Model[] }>()
  const loading = ref(false)
  const failed = ref(false)
  let pending: Promise<void> | undefined
  function reload() {
    if (pending) return pending
    loading.value = true
    failed.value = false
    pending = request<{ defaultModelId: string | null; models: Model[] }>({
      url: '/api/models', method: 'GET', params: { kind }, silentError: true,
    }).then(result => {
      catalog.value = result
    }).catch(() => {
      catalog.value = undefined
      failed.value = true
    }).finally(() => {
      loading.value = false
      pending = undefined
    })
    return pending
  }
  return {
    models: computed(() => catalog.value?.models ?? []),
    defaultModelId: computed(() => catalog.value?.defaultModelId ?? ''),
    reload, loading, failed,
  }
}

export function modelChanged(error: unknown) {
  return isAxiosError(error) && ['MODEL_UNAVAILABLE', 'MODEL_PARAMETERS_CHANGED'].includes(error.response?.data?.message)
}

export type ImageSettings = { modelName: string; imageRatio: string; imageSize: string }

export function normalizeImageSettings(settings: ImageSettings, model?: ImageModel): ImageSettings {
  if (!model) return { modelName: '', imageRatio: '', imageSize: '' }
  const { ratios, sizes } = model.capabilities
  return {
    modelName: model.id,
    imageRatio: ratios.includes(settings.imageRatio) ? settings.imageRatio : ratios[0] ?? '',
    imageSize: sizes.includes(settings.imageSize) ? settings.imageSize : sizes.includes('2K') ? '2K' : sizes[0] ?? '',
  }
}

export function generateWorkbenchImage<T>(data: {
  modelId: string; prompt: string; imageList: string[]; aspectRatio: string; resolution: string
}, signal?: AbortSignal) {
  return request<T>({
    url: '/api/workbench/images/generate', method: 'POST', data, signal,
    timeout: 1200000, silentError: true,
  })
}

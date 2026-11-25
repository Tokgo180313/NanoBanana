import { computed, onUnmounted, reactive, ref, type Ref } from 'vue'

export const materialModes = ['参考图', '首尾帧']
export const frames = ['首帧', '尾帧'] as const
type Frame = (typeof frames)[number]
export const limits = { image: 9, audio: 3 }
const maxFileBytes = { image: 29_999_999, audio: 15_000_000 }
const maxUploadBytes = 47_000_000
export const imageExtensions = '.jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif,.gif,.heic,.heif'
export const audioExtensions = '.mp3,.wav'
type MediaKind = keyof typeof limits

export function useVideoMaterials(frameMode: Ref<boolean>, maxMaterials: Ref<number | undefined>) {
  const references = ref<{ id: number; file: File; kind: MediaKind; url: string }[]>([])
  const frameFiles = reactive<Partial<Record<Frame, { file: File; url: string }>>>({})
  const materialCount = computed(() => frameMode.value
    ? frames.filter(frame => frameFiles[frame]).length
    : references.value.length)
  const materialError = computed(() => {
    const max = maxMaterials.value
    return max !== undefined && materialCount.value > max
      ? `当前模型最多支持 ${max} 个素材，已添加 ${materialCount.value} 个，请移除多余素材。`
      : ''
  })
  const uploadSizeError = computed(() => {
    const files = frameMode.value
      ? frames.map(frame => frameFiles[frame]?.file)
      : references.value.map(item => item.file)
    return files.reduce((total, file) => total + (file?.size ?? 0), 0) > maxUploadBytes
      ? '素材总大小超过 47 MB，请减少素材或换用较小文件。'
      : ''
  })

  const selectionError = ref('')
  let nextId = 0

  function report(message: string) {
    selectionError.value = message
  }

  function mediaKind(file: File): MediaKind | undefined {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (imageExtensions.split(',').includes(extension)) return 'image'
    if (audioExtensions.split(',').includes(extension)) return 'audio'
  }

  function addReferences(event: Event, expectedKind: MediaKind) {
    const input = event.currentTarget as HTMLInputElement
    const counts = { image: 0, audio: 0 }
    for (const item of references.value) counts[item.kind]++

    selectionError.value = ''
    let skipped = false
    for (const file of Array.from(input.files ?? [])) {
      const kind = mediaKind(file)
      if (kind !== expectedKind || counts[kind] >= limits[kind] || file.size > maxFileBytes[kind]) {
        skipped = true
        continue
      }
      references.value.push({
        id: nextId++,
        file,
        kind,
        url: URL.createObjectURL(file),
      })
      counts[kind]++
    }
    input.value = ''
    if (skipped) report('部分文件不符合要求。最多 9 张图片（单图小于 30 MB）和 3 段 MP3 或 WAV 音频（单段不超过 15 MB）。')
  }

  function clearReferences(kind: MediaKind) {
    for (const item of references.value.filter(item => item.kind === kind)) removeReference(item.id)
    selectionError.value = ''
  }

  function removeReference(id: number) {
    const index = references.value.findIndex(item => item.id === id)
    if (index < 0) return
    const url = references.value[index]?.url
    references.value.splice(index, 1)
    if (url) URL.revokeObjectURL(url)
  }

  function removeFrame(frame: Frame) {
    const image = frameFiles[frame]
    delete frameFiles[frame]
    if (image) URL.revokeObjectURL(image.url)
  }

  function selectFrame(frame: Frame, event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    selectionError.value = ''
    if (mediaKind(file) !== 'image') {
      report('请选择图片文件。')
      return
    }
    if (file.size > maxFileBytes.image) {
      report('首尾帧图片须小于 30 MB。')
      return
    }
    removeFrame(frame)
    frameFiles[frame] = { file, url: URL.createObjectURL(file) }
  }

  onUnmounted(() => {
    for (const { url } of references.value) URL.revokeObjectURL(url)
    for (const frame of frames) removeFrame(frame)
  })

  return { references, frameFiles, materialError, uploadSizeError, selectionError,
    addReferences, clearReferences, removeReference, selectFrame, removeFrame }
}

export type VideoMaterialsState = ReturnType<typeof useVideoMaterials>

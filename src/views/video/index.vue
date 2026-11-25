<script setup lang="ts">
import { computed, onActivated, onDeactivated, onUnmounted, reactive, ref, watch } from 'vue'
import VideoMaterials from './VideoMaterials.vue'
import VideoDescription from './VideoDescription.vue'
import VideoGenerationSettings from './VideoGenerationSettings.vue'
import VideoResults from './VideoResults.vue'
import VideoResultDetail from './VideoResultDetail.vue'
import { useVideoMaterials } from './useVideoMaterials'
import { isAxiosError } from 'axios'
import { modelChanged, useGenerationCatalog } from '../../api/generationModels'
import { createVideoTask, listVideoTasks, queryVideoTask, type VideoTask } from '../../api/videos'
import { ElMessage } from 'element-plus'
import { MagicStick } from '@element-plus/icons-vue'

const ratioShapes = [
  { label: '自适应', width: 22, height: 17 },
  { label: '9:16', width: 13, height: 23 },
  { label: '16:9', width: 24, height: 14 },
  { label: '1:1', width: 19, height: 19 },
  { label: '4:3', width: 22, height: 17 },
  { label: '3:4', width: 16, height: 22 },
  { label: '21:9', width: 26, height: 12 },
]
const settings = reactive({
  materialMode: '参考图',
  description: '',
  modelId: '',
  resolution: '720p',
  duration: 5,
  ratio: '16:9',
  sound: true,
})
const { models, defaultModelId, loading: loadingModels, failed: modelError, reload: loadModels } = useGenerationCatalog('video')
const selectedModel = computed(() => models.value.find(model => model.id === settings.modelId))
const capabilities = computed(() => selectedModel.value?.capabilities)
const ratios = computed(() => (capabilities.value?.ratios ?? []).map(value => {
  const label = value === 'adaptive' ? '自适应' : value
  return ratioShapes.find(shape => shape.label === label) ?? { label, width: 18, height: 18 }
}))
const modelNotice = ref('')
const parameterNotice = ref('')
let choseInitialDefault = false
watch([models, defaultModelId, loadingModels, modelError, () => settings.modelId], () => {
  if (loadingModels.value || modelError.value) return
  if (settings.modelId && !selectedModel.value) {
    settings.modelId = ''
    modelNotice.value = '所选视频模型已不可用，请重新选择。'
    parameterNotice.value = ''
    return
  }
  if (!choseInitialDefault && models.value.length) {
    choseInitialDefault = true
    if (models.value.some(model => model.id === defaultModelId.value)) {
      settings.modelId ||= defaultModelId.value
    }
  }
  const options = capabilities.value
  if (!options) return
  const changes: string[] = []
  if (!options.resolutions.includes(settings.resolution)) {
    settings.resolution = options.resolutions[0] ?? ''
    changes.push('分辨率 ' + settings.resolution.toUpperCase())
  }
  if (!ratios.value.some(ratio => ratio.label === settings.ratio)) {
    settings.ratio = ratios.value[0]?.label ?? ''
    changes.push('比例 ' + settings.ratio)
  }
  const duration = Math.min(options.maxDuration, Math.max(options.minDuration, settings.duration))
  if (duration !== settings.duration) {
    settings.duration = duration
    changes.push('时长 ' + duration + ' 秒')
  }
  if (changes.length) parameterNotice.value = '已调整为：' + changes.join('、')
})
const frameMode = computed(() => settings.materialMode === '首尾帧')
const materials = useVideoMaterials(frameMode, computed(() => capabilities.value?.maxMaterials))
const { references, frameFiles, materialError, uploadSizeError } = materials
const ratioError = computed(() => frameMode.value && capabilities.value && !capabilities.value.ratios.includes('adaptive')
  ? '当前模型不支持跟随首帧，请更换模型或素材模式。'
  : '')
const tasks = ref<VideoTask[]>([])
const submitting = ref(false)
const loadingTasks = ref(false)
const checkingTasks = ref(false)
const hasMore = ref(false)
const taskPage = ref(1)
const listError = ref('')
const pollingError = ref('')
const now = ref(Date.now())
let session: AbortController | undefined
let pollTimer: ReturnType<typeof setTimeout> | undefined
let clock: ReturnType<typeof setInterval> | undefined

onActivated(() => {
  session = new AbortController()
  tasks.value = []
  hasMore.value = false
  now.value = Date.now()
  clock = setInterval(() => { now.value = Date.now() }, 1000)
  void loadTasks()
  void loadModels()
})

function stopQueries() {
  session?.abort()
  session = undefined
  clearTimeout(pollTimer)
  clearInterval(clock)
  checkingTasks.value = false
  loadingTasks.value = false
  detailOpen.value = false
  detailId.value = undefined
}

onDeactivated(stopQueries)
onUnmounted(stopQueries)

function updateTask(task: VideoTask) {
  const index = tasks.value.findIndex(item => item.id === task.id)
  if (index < 0) tasks.value.unshift(task)
  else tasks.value[index] = task
}

function isPending(task: VideoTask) {
  return ['submitting', 'queued', 'running'].includes(task.status)
}

const detailId = ref<string>()
const detailTask = computed(() => tasks.value.find(task => task.id === detailId.value))
const detailOpen = ref(false)

function showDetail(id: string) {
  detailId.value = id
  detailOpen.value = true
}

function schedulePoll() {
  clearTimeout(pollTimer)
  if (session && !pollingError.value && tasks.value.some(isPending)) {
    pollTimer = setTimeout(() => { void refreshPending() }, 5000)
  }
}

async function refreshPending() {
  const signal = session?.signal
  if (!signal || checkingTasks.value) return
  if (loadingTasks.value) {
    schedulePoll()
    return
  }
  checkingTasks.value = true
  pollingError.value = ''
  try {
    // Query sequentially so recovery of a large task list does not burst upstream requests.
    for (const task of tasks.value.filter(isPending)) {
      try {
        const result = await queryVideoTask(task.id, signal)
        if (signal.aborted) return
        if (tasks.value.some(item => item.id === task.id)) updateTask(result)
      } catch {
        if (signal.aborted) return
        pollingError.value = '暂时无法查询部分视频任务。'
      }
    }
  } finally {
    if (!signal.aborted) {
      checkingTasks.value = false
      schedulePoll()
    }
  }
}

async function loadTasks(page = 1) {
  const signal = session?.signal
  if (!signal || loadingTasks.value) return
  loadingTasks.value = true
  listError.value = ''
  try {
    const result = await listVideoTasks(page, signal)
    if (signal.aborted) return
    if (page === 1) tasks.value = result.items
    else {
      const ids = new Set(tasks.value.map(item => item.id))
      tasks.value.push(...result.items.filter(item => !ids.has(item.id)))
    }
    taskPage.value = page
    hasMore.value = result.hasMore
    pollingError.value = ''
  } catch {
    if (!signal.aborted) listError.value = '暂时无法读取视频任务列表。'
  } finally {
    if (!signal.aborted) {
      loadingTasks.value = false
      schedulePoll()
    }
  }
}

async function generateVideo() {
  if (submitting.value || loadingTasks.value || !capabilities.value || loadingModels.value) return
  const prompt = settings.description.trim()
  const first = frameFiles.首帧?.file
  const last = frameFiles.尾帧?.file
  if (frameMode.value && !first) {
    ElMessage.warning('请先添加首帧图片。')
    return
  }
  if (!prompt && !frameMode.value && !references.value.length) {
    ElMessage.warning('请输入视频描述或添加素材。')
    return
  }

  const ratio = frameMode.value || settings.ratio === '自适应' ? 'adaptive' : settings.ratio
  if (materialError.value || uploadSizeError.value || ratioError.value || !capabilities.value.ratios.includes(ratio)) {
    ElMessage.warning('请检查当前模型支持的比例和素材数量。')
    return
  }
  const form = new FormData()
  form.set('modelId', settings.modelId)
  form.set('prompt', prompt)
  form.set('duration', String(settings.duration))
  form.set('resolution', settings.resolution)
  form.set('ratio', ratio)
  form.set('sound', String(settings.sound))
  if (frameMode.value) {
    if (first) form.append('firstFrame', first)
    if (last) form.append('lastFrame', last)
  } else {
    for (const { file, kind } of references.value) form.append(kind === 'image' ? 'images' : 'audio', file)
  }

  const signal = session?.signal
  submitting.value = true
  try {
    const task = await createVideoTask(form)
    if (signal?.aborted) {
      void loadTasks()
      return
    }
    updateTask(task)
    pollingError.value = ''
    schedulePoll()
  } catch (error) {
    if (signal?.aborted) return
    if (modelChanged(error)) {
      void loadModels()
      modelNotice.value = '模型或可用参数已更新，请确认设置后重试。'
      return
    }
    const response = isAxiosError(error) ? error.response : undefined
    const detail = response?.data?.message
    if (!response || [408, 502, 504].includes(response.status)) {
      ElMessage.warning('提交结果暂无法确认，请刷新任务列表查看，避免重复生成。')
    } else {
      ElMessage.error(typeof detail === 'string' ? detail : '提交视频任务失败。')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="video-page" aria-labelledby="video-title">
    <header>
      <h1 id="video-title">视频生成</h1>
    </header>

    <div class="video-workspace">
      <section class="panel settings-panel" aria-label="视频配置">
        <div class="settings-scroll">
          <VideoMaterials v-model="settings.materialMode" :materials="materials" />
          <VideoDescription v-model="settings.description" :model-id="selectedModel?.id" :disabled="submitting" />

          <VideoGenerationSettings v-model:model-id="settings.modelId" v-model:resolution="settings.resolution"
            v-model:duration="settings.duration" v-model:ratio="settings.ratio" v-model:sound="settings.sound"
            :models="models" :ratios="ratios" :frame-mode="frameMode" :ratio-error="ratioError"
            :loading="loadingModels" :failed="modelError" :submitting="submitting"
            :model-notice="modelNotice" :parameter-notice="parameterNotice"
            @reload="loadModels" @model-change="modelNotice = ''; parameterNotice = ''" />
        </div>

        <footer class="generate-footer">
          <el-button type="primary" :icon="MagicStick" :loading="submitting" :disabled="loadingTasks || loadingModels || !selectedModel || !!materialError || !!uploadSizeError || !!ratioError" @click="generateVideo">立即生成</el-button>
        </footer>
      </section>

      <VideoResults :tasks="tasks" :now="now" :loading="loadingTasks" :checking="checkingTasks"
        :submitting="submitting" :has-more="hasMore" :list-error="listError" :polling-error="pollingError"
        @open="showDetail" @refresh="loadTasks()" @retry="refreshPending()" @load-more="loadTasks(taskPage + 1)" />
    </div>
    <VideoResultDetail v-if="detailTask" v-model="detailOpen" :task="detailTask" :now="now"
      @closed="detailId = undefined" />
  </section>
</template>

<style scoped>
.video-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  padding: 16px 20px;
}
h1 { font-size: 21px; }
.video-workspace {
  display: grid;
  grid-template-columns: minmax(300px, 340px) minmax(0, 1fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
}
.panel { min-width: 0; min-height: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.settings-panel { display: flex; flex-direction: column; }
.settings-scroll { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 12px; padding: 14px; overflow-y: auto; }
.settings-scroll > * { flex-shrink: 0; }
.generate-footer { flex-shrink: 0; padding: 10px 14px; border-top: 1px solid var(--border); }
.generate-footer .el-button { width: 100%; height: 43px; background: linear-gradient(100deg, #2b62db, #682fe2); border: 0; }
.generate-footer .el-button:disabled { opacity: .55; }
@container workspace (max-width: 700px) {
  .video-page { height: auto; padding: 12px; }
  .video-workspace { grid-template-columns: minmax(0, 1fr); }
  .settings-scroll { overflow: visible; }
}
</style>

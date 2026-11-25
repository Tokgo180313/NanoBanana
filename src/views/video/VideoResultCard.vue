<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { CopyDocument, Film, Picture, VideoPlay } from '@element-plus/icons-vue'
import { videoDownloadUrl, type VideoTask } from '../../api/videos'
import { copyTaskId, dateFormat, linkExpired, playableUrl, statusLabels, taskSpecs } from './videoResult'

const props = defineProps<{ task: VideoTask; now: number }>()
const emit = defineEmits<{ open: [] }>()
const card = ref<HTMLElement>()
const player = ref<HTMLVideoElement>()
const nearViewport = ref(false)
const hovering = ref(false)
const playbackError = ref(false)
const videoUrl = computed(() => playableUrl(props.task, props.now))
const previewUrl = computed(() => videoUrl.value
  ? videoUrl.value + (videoUrl.value.includes('#') ? '' : '#t=0.001')
  : undefined)
let observer: IntersectionObserver | undefined

onMounted(() => {
  if (!card.value || !('IntersectionObserver' in window)) {
    nearViewport.value = true
    return
  }
  observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return
    nearViewport.value = true
    observer?.disconnect()
  }, { rootMargin: '160px' })
  observer.observe(card.value)
})

function startPreview(event: PointerEvent) {
  if (event.pointerType === 'mouse') hovering.value = true
}

function stopPreview() {
  hovering.value = false
  const video = player.value
  if (!video) return
  video.pause()
  if (video.readyState >= 1) video.currentTime = 0
}

function openDetail() {
  stopPreview()
  emit('open')
}

watch([hovering, player], ([active, video]) => {
  if (active && video) void video.play().catch(() => {})
}, { flush: 'post' })
watch(videoUrl, () => {
  stopPreview()
  playbackError.value = false
}, { flush: 'sync' })
onDeactivated(stopPreview)
onBeforeUnmount(() => {
  observer?.disconnect()
  stopPreview()
})
</script>

<template>
  <article ref="card" class="task-card">
    <header class="task-header">
      <div class="task-info">
        <div class="task-summary">
          <el-icon class="task-icon"><Film /></el-icon>
          <div class="task-heading">
            <h3>{{ taskSpecs(task) }}</h3>
            <p v-if="task.prompt" class="task-prompt" :title="task.prompt">{{ task.prompt }}</p>
          </div>
        </div>
        <div class="task-meta">
          <time :datetime="task.createdAt">{{ dateFormat.format(new Date(task.createdAt)) }}</time>
          <button class="copy-id" type="button" aria-label="复制任务 ID" :title="task.id" @click="copyTaskId(task.id)">
            <span>任务 ID：{{ task.id }}</span><el-icon><CopyDocument /></el-icon>
          </button>
          <el-tag v-if="!videoUrl" size="small" :type="task.status === 'failed' ? 'danger' : 'info'">
            {{ linkExpired(task, now) ? '视频链接已过期' : statusLabels[task.status] }}
          </el-tag>
        </div>
      </div>
      <div class="task-actions">
        <el-link v-if="videoUrl" type="primary" :href="videoDownloadUrl(task.id)">下载视频</el-link>
        <el-button plain size="small" @click="openDetail">查看详情</el-button>
      </div>
    </header>
    <p v-if="task.error" class="task-error">{{ task.error }}</p>
    <button v-if="previewUrl" class="result-preview" :class="{ playing: hovering && !playbackError }"
      type="button" aria-label="查看视频详情" @pointerenter="startPreview" @pointerleave="stopPreview" @click="openDetail">
      <video v-if="(nearViewport || hovering) && !playbackError" ref="player" :key="previewUrl" :src="previewUrl"
        muted loop playsinline preload="metadata" aria-hidden="true" @error="playbackError = true" />
      <el-icon v-else class="preview-fallback" :size="26"><Picture /></el-icon>
      <span class="play-badge" aria-hidden="true"><el-icon :size="23"><VideoPlay /></el-icon></span>
    </button>
    <p v-if="playbackError" class="task-error" role="status">预览暂时无法播放，可查看详情或下载视频。</p>
  </article>
</template>

<style scoped>
.task-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; min-width: 0; padding: 16px; border-radius: 8px; background: var(--surface); }
.task-header, .task-summary, .task-meta, .task-actions { display: flex; align-items: center; gap: 7px 10px; min-width: 0; }
.task-header { align-items: flex-start; justify-content: space-between; }
.task-info { flex: 1; min-width: 0; }
.task-icon { flex: 0 0 30px; height: 30px; border-radius: 50%; color: var(--brand); background: var(--brand-soft); }
.task-heading { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.task-heading h3 { font-size: 12px; }
.task-meta, .task-prompt { color: var(--text-muted); font-size: 12px; }
.task-meta, .task-actions { flex-wrap: wrap; }
.task-meta { margin-top: 5px; }
.task-prompt, .copy-id span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copy-id { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; }
.copy-id .el-icon { flex-shrink: 0; }
.task-error { color: var(--el-color-danger); font-size: 12px; overflow-wrap: anywhere; }
.result-preview { position: relative; display: grid; place-items: center; width: min(100%, 324px); aspect-ratio: 16 / 9; overflow: hidden; border: 0; padding: 0; border-radius: 7px; background: #171622; color: white; cursor: pointer; }
.result-preview video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.preview-fallback { color: #b4a8cc; }
.play-badge { position: absolute; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: #171622aa; }
.playing:not(:focus-visible) .play-badge { opacity: 0; }
@container (max-width: 710px) {
  .task-heading { display: block; }
  .task-heading h3 { overflow-wrap: anywhere; }
}
@container (max-width: 520px) {
  .task-header { flex-direction: column; }
  .task-info { width: 100%; }
  .task-card { padding: 13px; }
}
</style>

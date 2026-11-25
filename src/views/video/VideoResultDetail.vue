<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CopyDocument, Film } from '@element-plus/icons-vue'
import { videoDownloadUrl, type VideoTask } from '../../api/videos'
import { copyTaskId, dateFormat, linkExpired, playableUrl, ratioLabel, statusLabels } from './videoResult'

const open = defineModel<boolean>({ required: true })
defineEmits<{ closed: [] }>()
const props = defineProps<{ task: VideoTask; now: number }>()
const video = ref<HTMLVideoElement>()
const playbackError = ref(false)
const videoUrl = computed(() => playableUrl(props.task, props.now))
const status = computed(() => linkExpired(props.task, props.now) ? '视频链接已过期' : statusLabels[props.task.status])
const fields = computed(() => [
  { label: '生成状态', value: status.value },
  { label: '视频模型', value: props.task.model },
  { label: '视频分辨率', value: props.task.resolution.toUpperCase() },
  { label: '视频时长', value: props.task.duration + ' 秒' },
  { label: '视频比例', value: ratioLabel(props.task) },
  { label: '视频描述', value: props.task.prompt || '—' },
  { label: '成片声音', value: props.task.sound ? '开启' : '关闭' },
  { label: '创建时间', value: dateFormat.format(new Date(props.task.createdAt)) },
])

watch([() => props.task.id, videoUrl], () => { playbackError.value = false })
watch(open, (visible) => {
  if (!visible) video.value?.pause()
})
</script>

<template>
  <el-dialog v-model="open" class="video-detail-dialog" fullscreen append-to-body destroy-on-close
    title="视频详情" :close-on-click-modal="false" @closed="$emit('closed')">
    <template #header="{ titleId, titleClass }">
      <div class="detail-header">
        <h2 :id="titleId" :class="titleClass">视频详情</h2>
        <el-link v-if="videoUrl" type="primary" :href="videoDownloadUrl(task.id)">下载视频</el-link>
      </div>
    </template>
    <div class="detail-layout">
      <div class="detail-media">
        <div class="player-stage">
          <video v-if="videoUrl && !playbackError" ref="video" :key="videoUrl" :src="videoUrl"
            controls playsinline preload="metadata" aria-label="生成的视频" @error="playbackError = true" />
          <div v-else class="unavailable-player" role="status">
            <el-icon :size="30"><Film /></el-icon>
            <strong>{{ playbackError ? '视频暂时无法播放' : status }}</strong>
            <span v-if="task.error">{{ task.error }}</span>
            <el-link v-if="videoUrl && playbackError" :href="videoUrl" target="_blank" rel="noopener noreferrer">打开原视频</el-link>
          </div>
        </div>
      </div>
      <aside class="detail-info" aria-label="视频任务信息" tabindex="0">
        <dl>
          <div>
            <dt>任务 ID</dt>
            <dd>
              <button class="copy-id" type="button" aria-label="复制任务 ID" @click="copyTaskId(task.id)">
                <span>{{ task.id }}</span><el-icon><CopyDocument /></el-icon>
              </button>
            </dd>
          </div>
          <div v-for="field in fields" :key="field.label">
            <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
          </div>
        </dl>
      </aside>
    </div>
  </el-dialog>
</template>

<style scoped>
:global(.video-detail-dialog.el-dialog) { display: flex; flex-direction: column; height: 100%; padding: 0; }
:global(.video-detail-dialog > .el-dialog__header) { padding: 0; border-bottom: 1px solid var(--border); }
:global(.video-detail-dialog > .el-dialog__body) { flex: 1; min-height: 0; padding: 0; }
.detail-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 54px; padding: 8px 54px 8px 16px; }
.detail-header h2 { font-size: 15px; font-weight: 600; }
.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 270px; height: 100%; }
.detail-media { display: flex; min-height: 0; padding: 10px; background: #eef0f5; }
.player-stage { position: relative; display: grid; flex: 1; min-width: 0; min-height: 0; place-items: center; overflow: hidden; background: #13121b; }
.player-stage video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.unavailable-player { display: grid; justify-items: center; gap: 6px; padding: 12px; color: #e1d9ee; text-align: center; overflow-wrap: anywhere; }
.unavailable-player .el-link { color: #e1d9ee; text-decoration: underline; }
.detail-info { min-height: 0; padding: 17px 19px; overflow-y: auto; border-left: 1px solid var(--border); }
.detail-info dl { display: grid; gap: 14px; margin: 0; }
.detail-info dt { margin-bottom: 4px; font-weight: 700; }
.detail-info dd { margin: 0; color: var(--text-muted); overflow-wrap: anywhere; white-space: pre-wrap; }
.copy-id { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; border: 0; padding: 0; color: inherit; background: none; font: inherit; cursor: pointer; text-align: left; }
.copy-id .el-icon { flex-shrink: 0; }
@media (max-width: 700px) {
  .detail-layout { display: block; overflow-y: auto; }
  .player-stage { min-height: 165px; height: min(52vw, 50dvh); }
  .detail-info { overflow: visible; border-top: 1px solid var(--border); border-left: 0; }
}
</style>

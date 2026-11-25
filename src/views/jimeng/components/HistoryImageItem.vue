<template>
  <el-popover placement="bottom-end" :fallback-placements="['top-end', 'bottom-start', 'top-start']" title="历史记录" trigger="click" :popper-options="{ modifiers: [{ name: 'preventOverflow', options: { padding: 12, tether: false } }] }" :width="popoverWidth" :popper-style="{ maxWidth: 'calc(100vw - 24px)' }">
    <p class="history-notice">此任务卡保留最近 20 条记录，更多图片可在左侧「历史记录」模块查看。</p>
    <div class="history-list-wrap">
      <div v-for="image in historyImageList" :key="image.uid" class="history-item">
        <el-image
          class="history-img"
          alt="历史生成结果"
          :src="resolveImageSrc(image.url, image.code)"
          fit="cover"
          :preview-src-list="[resolveImageSrc(image.url, image.code)]"
        />
        <div class="history-content">
          <div class="history-prompt" :title="image.context || ''">
            {{ image.context || "（无文案）" }}
          </div>
          <p class="history-meta">{{ image.settings ? `${image.modelName || modelLabel(image.settings.modelName)} · ${image.settings.imageRatio} · ${image.settings.imageSize}` : '旧记录：未保存模型参数' }}</p>
          <p v-if="image.createdAt" class="history-meta">{{ new Date(image.createdAt).toLocaleString('zh-CN') }}</p>
          <div class="history-actions">
            <el-button size="small" type="primary" link :disabled="busy" @click="emit('view', image)">
              查看
            </el-button>
            <el-button size="small" type="primary" link @click="emit('download', image)">
              下载
            </el-button>
            <el-button size="small" type="primary" link :disabled="busy" @click="emit('reuse', image)">复用配置</el-button>
            <a v-if="/^https?:\/\//i.test(image.url)" :href="image.url" target="_blank" rel="noopener noreferrer" class="original-link">打开原图</a>
            <el-button size="small" type="danger" link :disabled="busy" @click="emit('delete', image)">
              移除
            </el-button>
          </div>
        </div>
      </div>
    </div>
    <template #reference>
      <el-button class="output-history-btn" :icon="Clock" :disabled="!historyImageList.length">历史记录<span class="history-count">{{ historyImageList.length }}</span></el-button>
    </template>
  </el-popover>
</template>

<script setup lang="ts">
import { Clock } from '@element-plus/icons-vue'
import { modelOptions } from '../js/config'
function modelLabel(value: string) { return modelOptions.find(option => option.value === value)?.label || value }
type HistoryImage = {
  uid: string
  url: string
  code: string
  context: string
  modelName?: string
  settings?: { modelName: string; imageRatio: string; imageSize: string }
  createdAt?: string
}

defineProps<{
  historyImageList: HistoryImage[]
  resolveImageSrc: (urlOrBase64: string, code: string) => string
  busy: boolean
  popoverWidth: number
}>()

const emit = defineEmits<{
  (e: "reuse", image: HistoryImage): void
  (e: "view", image: HistoryImage): void
  (e: "download", image: HistoryImage): void
  (e: "delete", image: HistoryImage): void
}>()
</script>

<style scoped>
.history-count { margin-left: 5px; color: var(--text-muted); font-size: 11px; }
.history-notice { color: var(--text-muted); font-size: 11px; line-height: 1.6; margin-bottom: 12px; }
.history-list-wrap { max-height: min(420px, 65vh); overflow-y: auto; }
.history-item { display: flex; align-items: flex-start; gap: 10px; padding: 12px 0; border-top: 1px solid var(--border); }
.history-img { flex: 0 0 64px; width: 64px; height: 64px; border-radius: 6px; background: var(--canvas); border: 1px solid var(--border); }
.history-content { flex: 1; min-width: 0; }
.history-prompt { font-size: 12px; color: var(--text); line-height: 1.6; margin-bottom: 4px; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.history-meta { font-size: 11px; color: var(--text-muted); line-height: 1.6; }
.history-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 6px; }
.history-actions :deep(.el-button) { height: 24px; min-height: 24px; padding: 0; }
.original-link { color: var(--brand); font-size: 12px; text-decoration: none; }
.original-link:hover { text-decoration: underline; }
</style>

<script setup lang="ts">
import { Film } from '@element-plus/icons-vue'
import type { VideoTask } from '../../api/videos'
import VideoResultCard from './VideoResultCard.vue'

defineProps<{
  tasks: VideoTask[]
  now: number
  loading: boolean
  checking: boolean
  submitting: boolean
  hasMore: boolean
  listError: string
  pollingError: string
}>()
defineEmits<{ open: [id: string]; refresh: []; retry: []; loadMore: [] }>()
</script>

<template>
  <section class="results" aria-labelledby="video-results-title">
    <header class="result-header">
      <h2 id="video-results-title">生成结果</h2>
      <el-button text :loading="loading" :disabled="submitting" @click="$emit('refresh')">刷新任务列表</el-button>
    </header>
    <div class="result-scroll">
      <p v-if="listError" class="result-message" role="status">{{ listError }}</p>
      <div v-if="pollingError" class="result-message" role="status">
        {{ pollingError }}
        <el-button text type="primary" :loading="checking" @click="$emit('retry')">重新查询</el-button>
      </div>
      <div v-if="!tasks.length && !listError" class="empty-results" role="status">
        <el-icon :size="22"><Film /></el-icon>
        <strong>{{ loading ? '正在读取任务' : '暂无生成任务' }}</strong>
        <p v-if="!loading">设置生成内容后，点击「立即生成」。</p>
      </div>
      <VideoResultCard v-for="task in tasks" :key="task.id" :task="task" :now="now" @open="$emit('open', task.id)" />
      <el-button v-if="hasMore" :loading="loading" :disabled="submitting" @click="$emit('loadMore')">加载更多</el-button>
    </div>
  </section>
</template>

<style scoped>
.results { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border-radius: 9px; background: #eef0f5; }
.result-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; padding: 8px 15px; background: var(--surface); }
.result-header h2 { font-size: 14px; }
.result-scroll { display: grid; flex: 1; align-content: start; gap: 14px; min-height: 0; padding: 14px; overflow-y: auto; container-type: inline-size; }
.result-scroll > .el-button { justify-self: center; }
.empty-results { display: grid; justify-items: center; gap: 6px; padding: 45px 12px; border-radius: 8px; background: var(--surface); text-align: center; }
.empty-results .el-icon { width: 40px; height: 40px; border-radius: 8px; background: var(--brand-soft); color: var(--brand); }
.empty-results p, .result-message { color: var(--text-muted); font-size: 13px; }
@container workspace (max-width: 700px) {
  .result-scroll { overflow: visible; padding: 10px; }
}
</style>

<script setup lang="ts">
import { Delete } from '@element-plus/icons-vue'
import PromptOptimizer from '../../components/PromptOptimizer.vue'

const description = defineModel<string>({ required: true })
defineProps<{ modelId?: string; disabled?: boolean }>()
</script>

<template>
  <section class="description" aria-labelledby="video-description-title">
    <h2 id="video-description-title"><label for="video-description">视频描述</label></h2>
    <div class="prompt">
      <textarea id="video-description" v-model="description" maxlength="4000"
        placeholder="描述画面、主体动作和镜头变化。例如：镜头从侧面缓缓推进，主体轻轻旋转。" />
      <div class="prompt-bottom">
        <button type="button" aria-label="清空描述" :disabled="!description" @click="description = ''">
          <el-icon><Delete /></el-icon>
        </button>
        <span>{{ description.length }} / 4000</span>
      </div>
    </div>
    <PromptOptimizer kind="video" :prompt="description" :model-id="modelId" :disabled="disabled" @apply="description = $event" />
  </section>
</template>

<style scoped>
.description { padding-top: 12px; border-top: 1px solid var(--border); }
.description h2 { margin-bottom: 7px; font-size: 13px; }
.prompt { overflow: hidden; border: 1px solid var(--border); border-radius: 6px; }
.prompt:focus-within { border-color: var(--brand); }
.prompt textarea { display: block; width: 100%; min-height: 94px; padding: 8px 10px; resize: vertical; border: 0; outline: none; color: var(--text); background: var(--surface); font: inherit; }
.prompt-bottom { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 3px 8px; color: var(--text-muted); background: var(--canvas); font-size: 11px; }
.prompt-bottom button { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; color: inherit; background: none; cursor: pointer; }
.prompt-bottom button:disabled { opacity: .45; cursor: default; }
</style>

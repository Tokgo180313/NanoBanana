<script setup lang="ts">
import { MagicStick } from '@element-plus/icons-vue'
import { IMAGE_PROMPT_LIMIT } from './promptLimits'
import { isAxiosError } from 'axios'
import { computed, onDeactivated, onUnmounted, ref, watch } from 'vue'
import { request } from '../utils/request'

const props = defineProps<{
  prompt: string
  kind: 'image' | 'video'
  modelId?: string
  disabled?: boolean
  compact?: boolean
}>()
const emit = defineEmits<{ apply: [prompt: string] }>()
const limit = computed(() => props.kind === 'image' ? IMAGE_PROMPT_LIMIT : 4000)
const loading = ref(false)
const open = ref(false)
const suggestion = ref('')
const error = ref('')
let pending: AbortController | undefined

function reset() {
  pending?.abort()
  pending = undefined
  loading.value = false
  open.value = false
  suggestion.value = ''
  error.value = ''
}

watch(() => [props.prompt, props.modelId, props.disabled], reset, { flush: 'sync' })
onDeactivated(reset)
onUnmounted(reset)

async function optimize() {
  if (loading.value || props.disabled || !props.modelId || !props.prompt.trim()) return
  error.value = ''
  if (props.prompt.trim().length > limit.value) {
    error.value = `优化支持最多 ${limit.value.toLocaleString()} 个字符。`
    return
  }
  const controller = new AbortController()
  pending = controller
  loading.value = true
  try {
    const result = await request<{ optimizedPrompt: string }>({
      url: '/api/prompts/optimize',
      method: 'POST',
      data: { kind: props.kind, modelId: props.modelId, prompt: props.prompt },
      signal: controller.signal,
      timeout: 20000,
      silentError: true,
    })
    if (pending !== controller) return
    suggestion.value = result.optimizedPrompt
    open.value = true
  } catch (cause) {
    if (pending !== controller) return
    const message = isAxiosError(cause) ? cause.response?.data?.message : undefined
    error.value = message === 'MODEL_UNAVAILABLE'
      ? '当前创作模型已不可用，请刷新后重选模型。'
      : typeof message === 'string' ? message : '提示词优化失败，请重试。'
  } finally {
    if (pending === controller) {
      pending = undefined
      loading.value = false
    }
  }
}

function apply() {
  const prompt = suggestion.value.trim()
  if (!open.value || props.disabled || !prompt || prompt.length > limit.value) return
  open.value = false
  emit('apply', prompt)
}
</script>

<template>
  <div class="prompt-optimizer" :class="{ 'prompt-optimizer-compact': compact }">
    <el-button native-type="button" :link="!compact" :plain="compact" type="primary" :loading="loading"
      :icon="compact ? MagicStick : undefined"
      :disabled="disabled || loading || !modelId || !prompt.trim()" @click="optimize">
      {{ loading ? '优化中' : compact ? '提示词优化' : '优化提示词' }}
    </el-button>
    <p v-if="error" class="prompt-optimizer-error" role="alert">{{ error }}</p>
    <el-dialog v-model="open" title="优化提示词" append-to-body
      width="min(640px, calc(100vw - 32px))" :close-on-click-modal="false">
      <el-input v-model="suggestion" type="textarea" :rows="8" :maxlength="limit"
        aria-label="优化后的提示词" show-word-limit />
      <template #footer>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :disabled="disabled || !suggestion.trim() || suggestion.trim().length > limit"
          @click="apply">应用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.prompt-optimizer { margin-top: 4px; }
.prompt-optimizer :deep(.el-button) { min-height: 44px; }
.prompt-optimizer-compact { display: contents; }
.prompt-optimizer-compact :deep(.el-button) {
  grid-column: 2;
  grid-row: 1;
  min-height: 32px;
  padding: 0 8px;
  border-radius: 6px;
}
.prompt-optimizer-compact :deep(.el-button.is-disabled) {
  background: var(--el-fill-color);
  border-color: transparent;
  color: var(--el-text-color-placeholder);
}
.prompt-optimizer-compact .prompt-optimizer-error { grid-column: 1 / -1; }
.prompt-optimizer-error { margin: 0; color: var(--el-color-danger); font-size: 13px; }
</style>

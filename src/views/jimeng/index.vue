<template>
  <div class="generation-page">
    <header class="page-header">
      <div class="page-title">
        <h1>图片生成</h1>
        <p>用参考图和提示词，快速创建你的作品</p>
      </div>
      <div class="page-actions">
        <el-button type="primary" plain :icon="Plus" @click="addTasks(1)">新建任务</el-button>
        <el-button :icon="Download" :disabled="!downloadCount || downloading" :loading="downloading" @click="applyDownloadBtn">批量下载<span class="button-count">{{ downloadCount }}</span></el-button>
        <el-button type="primary" :icon="MagicStick" :disabled="!availableCount || !models.length || loading" @click="applyRequestBtn">全部生成<span class="button-count">{{ availableCount }}</span></el-button>
      </div>
    </header>

    <el-alert v-if="failed" title="图片模型读取失败" type="error" :closable="false"><el-button text @click="reload">重试</el-button></el-alert>
    <el-alert v-else-if="!loading && !models.length" title="暂无可用图片模型" :closable="false" />
    <section class="batch-toolbar" aria-label="批量设置">
      <span class="toolbar-title"><el-icon><SetUp /></el-icon>批量设置</span>
      <details class="batch-details" :open="!compactToolbar || batchExpanded" @toggle="onBatchToggle">
        <summary>批量设置 <span v-if="selectedModel">{{ submitParam.imageRatio }} · {{ submitParam.imageSize }}</span></summary>
      <div class="toolbar-fields">
        <label class="toolbar-field model-field"><span>模型</span>
          <el-select v-model="submitForm.modelName" aria-label="批量模型" :disabled="!models.length">
            <el-option v-for="item in modelOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </label>
        <label class="toolbar-field"><span>比例</span>
          <el-select v-model="submitForm.imageRatio" aria-label="批量比例" :disabled="!selectedModel">
            <el-option v-for="item in ratioOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </label>
        <label class="toolbar-field"><span>分辨率</span>
          <el-select v-model="submitForm.imageSize" aria-label="批量分辨率" :disabled="batchSizeOptions.length <= 1">
            <el-option v-for="item in batchSizeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </label>
        <el-tooltip content="仅应用到空闲任务，生成中的任务保持原配置；新任务使用已应用的设置。" placement="top">
          <el-button class="apply-button" type="primary" plain :disabled="!selectedModel" @click="applySubmitBtn">应用设置</el-button>
        </el-tooltip>
      </div>
      </details>
      <el-dropdown class="clear-menu" trigger="click" @command="clearBatch">
        <el-button :icon="MoreFilled" aria-label="更多清空操作">更多操作</el-button>
        <template #dropdown><el-dropdown-menu>
          <el-dropdown-item command="text">清空所有提示词</el-dropdown-item>
          <el-dropdown-item command="references">清空所有参考图</el-dropdown-item>
          <el-dropdown-item command="results">清空所有生成记录</el-dropdown-item>
        </el-dropdown-menu></template>
      </el-dropdown>
    </section>
    <div class="workspace-meta">
      <p class="status-summary" role="status" aria-live="polite"><strong>{{ taskList.length }}</strong> 个任务<span class="meta-divider">/</span><span class="running-count">{{ runningCount }} 个生成中</span><span class="meta-divider">/</span>{{ downloadCount }} 个可下载</p>
      <span class="workspace-hint">每个任务可独立调整参数</span>
    </div>
    <el-alert v-if="imageHistory.writeError" :title="imageHistory.writeError" type="warning" :closable="false" show-icon class="storage-warning"><el-button type="primary" link @click="imageHistory.ensureSaved()">重试保存历史</el-button></el-alert>
    <el-alert v-if="store.persistenceError" :title="store.persistenceError" type="warning" :closable="false" show-icon class="storage-warning" />
    <el-empty v-if="!taskList.length" description="还没有任务，新建一个任务开始创作"><el-button type="primary" :icon="Plus" @click="addTasks(1)">新建任务</el-button></el-empty>
    <div class="task-grid" :class="{ single: taskList.length === 1 }" :style="{ '--task-columns': Math.min(taskList.length, 3) }">
      <GeminiTaskItem v-for="(task, index) in taskList" :key="task.id" :task-id="task.id" :task-number="index + 1" :param="submitParam" :models="models" :default-model-id="defaultModelId" @refresh-models="reload"
        :ref="(el) => setTaskRef(task.id, el)" @duplicate="duplicateTask(task.id)" @remove="removeTask(task.id)" />
    </div>
    <footer v-if="taskList.length" class="add-tasks">
      <el-button text :icon="Plus" @click="addTasks(1)">继续添加任务</el-button>
      <span class="footer-divider" />
      <el-button text @click="addTasks(3)">批量添加 3 个</el-button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { accountStorage } from '../../account/storage.ts'

import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { Plus, Download, MagicStick, SetUp, MoreFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import GeminiTaskItem from './components/TaskItem.vue'
import { normalizeImageSettings, useGenerationCatalog } from '../../api/generationModels'
import { useImageHistoryStore } from '../../stores/imageHistoryStore.ts'
import { useJimengTaskStore } from '../../stores/jimengTaskStore'

type SubmitParam = { modelName: string; imageRatio: string; imageSize: string }
type TaskInstance = InstanceType<typeof GeminiTaskItem>
const compactQuery = window.matchMedia('(max-width: 650px)')
const compactToolbar = ref(compactQuery.matches)
const batchExpanded = ref(false)
function syncCompactToolbar() { compactToolbar.value = compactQuery.matches; batchExpanded.value = false }
function onBatchToggle(event: Event) { if (compactToolbar.value) batchExpanded.value = (event.target as HTMLDetailsElement).open }
onMounted(() => compactQuery.addEventListener('change', syncCompactToolbar))
onUnmounted(() => compactQuery.removeEventListener('change', syncCompactToolbar))
const store = useJimengTaskStore()
const imageHistory = useImageHistoryStore()
const { models, defaultModelId, loading, failed, reload } = useGenerationCatalog('image')
const modelOptions = computed(() => models.value.map(model => ({ label: model.name, value: model.id })))
const submitForm = ref<SubmitParam>({ modelName: '', imageRatio: '', imageSize: '' })
const selectedModel = computed(() => models.value.find(model => model.id === submitForm.value.modelName))
const ratioOptions = computed(() => (selectedModel.value?.capabilities.ratios ?? []).map(value => ({ label: value, value })))
const batchSizeOptions = computed(() => (selectedModel.value?.capabilities.sizes ?? []).map(value => ({ label: value, value })))
const submitParam = ref({ ...submitForm.value })
watch(() => [models.value, defaultModelId.value, submitForm.value.modelName] as const, () => {
  if (!selectedModel.value) submitForm.value.modelName = defaultModelId.value
  Object.assign(submitForm.value, normalizeImageSettings(submitForm.value, selectedModel.value))
  if (!models.value.some(model => model.id === submitParam.value.modelName)) {
    const model = models.value.find(item => item.id === defaultModelId.value)
    submitParam.value = normalizeImageSettings(submitParam.value, model)
  }
})
const taskListKey = 'jimeng-task-list'
function readTasks(): Array<{ id: number }> {
  try {
    const saved = JSON.parse(accountStorage.getItem(taskListKey) || 'null')
    if (Array.isArray(saved)) return [...new Set(saved.filter((id): id is number => Number.isSafeInteger(id) && id > 0))].map(id => ({ id }))
    // Keep existing local drafts/results reachable when migrating the original three cards.
    const ids = [1, 2, 3].filter(id => accountStorage.getItem(`jimeng-task-text-${id}`) || accountStorage.getItem(`jimeng-task-runtime-${id}`))
    if (ids.length) return ids.map(id => ({ id }))
  } catch { /* Use fresh cards if local storage is unavailable. */ }
  return [{ id: 1 }, { id: 2 }]
}
const taskList = ref(readTasks())
let nextId = Math.max(Date.now(), ...taskList.value.map(t => t.id))
const taskRefs = ref<Record<number, TaskInstance>>({})
function setTaskRef(id: number, el: unknown) {
  if (el) taskRefs.value[id] = el as TaskInstance
  else delete taskRefs.value[id]
}
function saveTasks() {
  try { accountStorage.setItem(taskListKey, JSON.stringify(taskList.value.map(t => t.id))) }
  catch { ElMessage.warning('浏览器存储空间不足，任务列表可能无法在刷新后保留') }
}
const refs = computed(() => taskList.value.map(t => taskRefs.value[t.id]).filter((item): item is TaskInstance => !!item))
const runningCount = computed(() => refs.value.filter(t => t.isBusy()).length)
const availableCount = computed(() => refs.value.filter(t => !t.isBusy()).length)
const downloadCount = computed(() => refs.value.filter(t => t.hasResult()).length)
const downloading = ref(false)
function addTasks(count: number) {
  for (let i = 0; i < count; i++) taskList.value.push({ id: ++nextId })
  saveTasks()
}
function applySubmitBtn() {
  if (!selectedModel.value) return
  submitParam.value = { ...submitForm.value }
  const targets = refs.value.filter(t => !t.isBusy())
  targets.forEach(t => t.applySettings(submitForm.value))
  ElMessage.success(`已应用到 ${targets.length} 个任务${runningCount.value ? '，生成中的任务保持原配置' : ''}`)
}
async function confirmAction(message: string, title: string) {
  try { await ElMessageBox.confirm(message, title, { type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '取消' }); return true }
  catch { return false }
}
async function clearBatch(kind: string) {
  const labels: Record<string, string> = { text: '提示词', references: '参考图', results: '生成结果和历史记录' }
  if (!labels[kind]) return
  const targets = refs.value.filter(t => !t.isBusy())
  if (!targets.length) { ElMessage.info('当前没有可清空的任务，生成中的任务不会被修改'); return }
  if (!await confirmAction(`将清空 ${targets.length} 个任务的${labels[kind]}，无法撤销。生成中的任务会跳过。${kind === 'results' ? '历史模块中的归档图片仍会保留。' : ''}`, `清空${labels[kind]}`)) return
  if (kind === 'results' && !await imageHistory.ensureSaved()) { ElMessage.error('历史归档尚未保存，请先下载重要图片后重试'); return }
  // Recheck after the dialog: a task may have started while confirmation was open.
  let count = 0
  for (const t of targets) {
    if (t.isBusy()) continue
    if (kind === 'text') t.clearTextBtn()
    if (kind === 'references') t.clearReferenceImages()
    if (kind === 'results') t.clearResults()
    count++
  }
  ElMessage.success(`已清空 ${count} 个任务的${labels[kind]}`)
}
async function applyDownloadBtn() {
  if (downloading.value) return
  downloading.value = true
  const targets = refs.value.filter(t => t.hasResult())
  let failed = 0
  try {
    for (const task of targets) {
      try { await task.downloadBtn() } catch { failed++ }
    }
    if (failed) ElMessage.warning(`${failed} 个结果下载失败，请重试`)
    else ElMessage.success(`已发起 ${targets.length} 个文件下载；若浏览器拦截，请允许本站下载多个文件`)
  } finally { downloading.value = false }
}
function applyRequestBtn() {
  const targets = refs.value.filter(t => !t.isBusy())
  const valid = targets.filter(t => t.validateTask())
  valid.forEach(t => t.submitBtn2())
  if (valid.length) ElMessage.success(`已提交 ${valid.length} 个任务${targets.length > valid.length ? `，另有 ${targets.length - valid.length} 个任务需要补全输入` : ''}`)
  else ElMessage.warning('请补全任务卡中标出的提示词或参考图')
}
async function duplicateTask(id: number) {
  const snapshot = taskRefs.value[id]?.getDraft()
  if (!snapshot) return
  const newId = ++nextId
  taskList.value.push({ id: newId })
  saveTasks()
  await nextTick()
  taskRefs.value[newId]?.setDraft(snapshot)
  ElMessage.success('已复制提示词、参考图和设置，生成结果不复制')
}
async function removeTask(id: number) {
  const task = taskRefs.value[id]
  if (!task || task.isBusy()) return
  try {
    await ElMessageBox.confirm('删除后将移除此任务卡的提示词、参考图和最近记录，无法撤销。历史模块中的归档图片仍会保留。', '删除任务', { type: 'warning', confirmButtonText: '删除任务', cancelButtonText: '取消' })
  } catch { return }
  if (task.isBusy()) return
  if (!await imageHistory.ensureSaved()) { ElMessage.error('历史归档尚未保存，请先下载重要图片后重试'); return }
  store.clearTask(String(id))
  accountStorage.removeItem(`jimeng-task-text-${id}`)
  taskList.value = taskList.value.filter(t => t.id !== id)
  saveTasks()
  ElMessage.success('任务已删除')
}
onActivated(async () => {
  await reload()
  const record = imageHistory.consumeReuse()
  if (!record) return
  const defaults = { ...submitParam.value }
  const original = record.settings
  const model = models.value.find(item => item.id === original?.modelName)
    ?? models.value.find(item => item.id === defaults.modelName)
  const settings = normalizeImageSettings(original ?? defaults, model)
  const id = ++nextId
  taskList.value.push({ id }); saveTasks()
  await nextTick()
  taskRefs.value[id]?.setDraft({ text: record.prompt, settings, uploads: [[], [], [], []] })
  ElMessage.success('已新建任务并复用提示词及可用参数，请补充参考图')
  if (!original || JSON.stringify(settings) !== JSON.stringify(original)) ElMessage.info('缺失或已不可选的参数使用了当前默认设置')
})

</script>

<style scoped>
.generation-page { padding: 18px 20px; min-height: 100%; background: var(--canvas); }
.page-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px; }
.page-title h1 { font-size: 21px; line-height: 1.4; letter-spacing: -.3px; }
.page-title p { color: var(--text-muted); font-size: 12px; margin-top: 4px; }
.page-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.button-count { margin-left: 8px; font-size: 11px; opacity: .8; padding-left: 8px; border-left: 1px solid currentColor; }
.batch-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.toolbar-title { display: flex; align-items: center; gap: 6px; color: var(--text-h); font-size: 13px; font-weight: 600; white-space: nowrap; }
.toolbar-title .el-icon { color: var(--brand); font-size: 16px; }
.batch-details { display: contents; }
.batch-details > summary { display: none; }
.toolbar-fields { display: flex; flex: 1; align-items: center; flex-wrap: wrap; gap: 10px; min-width: 0; }
.toolbar-field { display: flex; align-items: center; gap: 8px; min-width: 0; }
.toolbar-field > span { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
.toolbar-field .el-select { width: 82px; }
.model-field .el-select { width: 190px; }
.clear-menu { margin-left: auto; }
.clear-menu :deep(.el-button) { border-color: transparent; color: var(--text-muted); }
.workspace-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 40px; color: var(--text-muted); font-size: 12px; }
.status-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
.status-summary strong { color: var(--text-h); font-weight: 600; }
.meta-divider { color: #c9cdd8; margin: 0 5px; }
.running-count { color: var(--brand); }
.task-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
.task-grid > * { min-width: 0; }
.storage-warning { margin-bottom: 12px; }
.add-tasks { display: flex; gap: 8px; justify-content: center; align-items: center; margin: 14px 0 0; }
.add-tasks :deep(.el-button) { color: var(--text-muted); }
.add-tasks :deep(.el-button:hover) { color: var(--brand); }
.footer-divider { width: 1px; height: 12px; background: var(--border); }
@container workspace (min-width: 1020px) { .task-grid:not(.single) { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container workspace (min-width: 1600px) { .task-grid:not(.single) { grid-template-columns: repeat(var(--task-columns), minmax(0, 1fr)); } }
@container workspace (max-width: 849px) {
  .generation-page { padding: 16px; }
  .page-header { align-items: flex-start; flex-wrap: wrap; gap: 12px; }
  .toolbar-title { width: 100%; }
  .toolbar-fields { flex-basis: 100%; }
  .clear-menu { margin-left: 0; }
}
@container workspace (max-width: 499px) {
  .generation-page { padding: 12px; }
  .page-title h1 { font-size: 19px; }
  .page-actions { display: grid; grid-template-columns: auto auto; gap: 8px; width: 100%; }
  .page-actions > :last-child { grid-column: 1 / -1; }
  .batch-toolbar { position: relative; display: block; padding: 12px; }
  .toolbar-title { display: none; }
  .batch-details { display: block; }
  .batch-details > summary { display: flex; align-items: center; gap: 12px; min-height: 28px; padding-right: 30px; cursor: pointer; font-size: 12px; font-weight: 600; color: var(--text); }
  .batch-details > summary::before { content: ''; width: 6px; height: 6px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(-45deg); }
  .batch-details[open] > summary::before { transform: rotate(45deg); }
  .batch-details > summary span { font-size: 11px; color: var(--text-muted); font-weight: 400; }
  .batch-details[open] .toolbar-fields { margin-top: 12px; }
  .toolbar-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .toolbar-field { flex-direction: column; align-items: stretch; gap: 4px; }
  .model-field { grid-column: 1 / -1; }
  .toolbar-field .el-select { width: 100%; }
  .apply-button { grid-column: 1 / -1; }
  .clear-menu { position: absolute; top: 12px; right: 10px; }
  .clear-menu :deep(.el-button) { width: 28px; min-height: 28px; height: 28px; padding: 0; font-size: 0; }
  .clear-menu :deep(.el-button .el-icon) { font-size: 16px; }
  .clear-menu :deep(.el-button .el-icon + span) { display: none; }
  .workspace-hint { display: none; }
  .workspace-meta { min-height: 36px; }
}
</style>

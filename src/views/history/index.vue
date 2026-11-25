<template>
  <section class="history-page">
    <header class="page-header">
      <div><h1>历史记录</h1><p>查看生成图片，下载作品或复用创作参数</p></div>
      <div class="header-actions">
        <el-button :icon="Refresh" :loading="history.loading" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="router.push({ name: 'ImageGeneration' })">去创作</el-button>
      </div>
    </header>
    <div class="history-toolbar">
      <el-input v-model="search" class="search-input" clearable :prefix-icon="Search" placeholder="搜索提示词或模型" aria-label="搜索历史记录" />
      <el-select v-model="model" class="model-filter" placeholder="全部模型" aria-label="筛选历史模型">
        <el-option label="全部模型" value="" />
        <el-option v-for="value in history.models" :key="value" :label="modelLabel(value)" :value="value || '__unknown__'" />
      </el-select>
      <el-select v-model="sort" class="sort-filter" aria-label="历史记录排序">
        <el-option label="最新生成优先" value="newest" /><el-option label="最早生成优先" value="oldest" />
      </el-select>
      <el-button v-if="search || model" @click="resetFilters">重置筛选</el-button>
    </div>
    <div class="history-summary"><p role="status" aria-live="polite">共 <strong>{{ history.total }}</strong> 条{{ search || model ? '匹配' : '生成' }}记录</p><span v-if="history.storageLocation === 'browser'"><el-icon><InfoFilled /></el-icon>记录保存在当前浏览器，请及时下载重要图片</span></div>
    <el-alert v-if="history.writeError" :title="history.writeError" type="warning" :closable="false" show-icon class="history-warning"><el-button type="primary" link @click="retrySave">重试保存</el-button></el-alert>
    <div v-if="history.loadError" class="history-empty" role="alert"><el-empty :description="history.loadError" :image-size="88"><el-button type="primary" @click="load">重新加载</el-button></el-empty></div>
    <div v-else class="history-table-panel">
      <p class="table-scroll-hint">左右滑动表格可查看完整信息与操作</p>
      <el-table ref="tableRef" height="100%" v-loading="history.loading" :data="history.items" row-key="id" class="history-table" :empty-text="search || model ? '没有找到匹配的记录，请调整筛选条件' : '还没有生成记录，完成图片生成后会自动归档'" aria-label="生成图片历史记录">
        <el-table-column label="图片" width="96"><template #default="{ row }">
          <button class="thumbnail-button" type="button" :aria-label="`查看图片详情：${row.prompt.slice(0, 35) || '无提示词'}`" @click="openDetails(row)">
            <el-image :src="imageSource(row)" fit="contain" loading="lazy" :alt="row.prompt.slice(0, 80) || '历史生成图片'"><template #error><div class="image-error thumbnail-error"><el-icon><Picture /></el-icon><span>加载失败</span></div></template></el-image>
          </button>
        </template></el-table-column>
        <el-table-column label="提示词" min-width="235"><template #default="{ row }"><p class="table-prompt">{{ promptSummary(row.prompt) }}</p></template></el-table-column>
        <el-table-column label="模型" min-width="165"><template #default="{ row }"><span class="model-tag">{{ row.modelName || modelLabel(row.settings?.modelName || '') }}</span></template></el-table-column>
        <el-table-column label="比例" width="78"><template #default="{ row }">{{ row.settings?.imageRatio || '未记录' }}</template></el-table-column>
        <el-table-column label="分辨率" width="82"><template #default="{ row }">{{ row.settings?.imageSize || '未记录' }}</template></el-table-column>
        <el-table-column label="生成时间" width="152"><template #default="{ row }"><time :datetime="row.createdAt">{{ formatDate(row.createdAt, true) }}</time></template></el-table-column>
        <el-table-column label="操作" width="210" :fixed="compactTable ? false : 'right'"><template #default="{ row }"><div class="row-actions">
          <el-button type="primary" link @click="openDetails(row)">详情</el-button>
          <el-button type="primary" link v-if="hasPermission('image:asset:download')" :loading="downloading.has(row.id)" :disabled="downloading.has(row.id)" @click="download(row)">下载</el-button>
          <el-button type="primary" plain :icon="RefreshRight" @click="reuse(row)">复用配置</el-button>
        </div></template></el-table-column>
      </el-table>
      <footer class="history-pagination">
        <div class="pagination-summary"><span>共 {{ history.total }} 条</span><el-select v-model="pageSize" aria-label="每页记录数" @change="changePageSize"><el-option v-for="size in [10, 20, 50, 100]" :key="size" :value="size" :label="`${size} 条/页`" /></el-select></div>
        <el-pagination background :current-page="page" :page-size="pageSize" :total="history.total" :pager-count="5" layout="prev, pager, next" @current-change="changePage" />
      </footer>
    </div>
    <el-drawer v-model="detailsOpen" class="history-detail-drawer" size="min(560px, 100vw)" append-to-body>
      <template #header><div class="detail-heading"><h2>生成详情</h2><p v-if="selected">{{ formatDate(selected.createdAt, true) }}</p></div></template>
      <template v-if="selected">
        <div class="detail-preview"><el-image :src="imageSource(selected)" fit="contain" alt="历史生成图片"><template #error><div class="image-error"><el-icon><Picture /></el-icon><span>图片暂时无法加载，可尝试打开原图</span></div></template></el-image></div>
        <div class="preview-actions"><el-button :icon="ZoomIn" text @click="previewOpen = true">放大图片</el-button><a v-if="/^https?:\/\//i.test(selected.url)" :href="selected.url" target="_blank" rel="noopener noreferrer">打开原图<el-icon><TopRight /></el-icon></a></div>
        <dl class="detail-settings"><div><dt>生成模型</dt><dd>{{ selected.modelName || modelLabel(selected.settings?.modelName || '') }}</dd></div><div><dt>图片比例</dt><dd>{{ selected.settings?.imageRatio || '未记录' }}</dd></div><div><dt>分辨率</dt><dd>{{ selected.settings?.imageSize || '未记录' }}</dd></div></dl>
        <div class="detail-prompt-heading"><h3>完整提示词</h3><span>{{ Array.from(selected.prompt).length.toLocaleString() }} 字符</span></div>
        <p class="detail-prompt" tabindex="0">{{ selected.prompt || '此记录没有保存提示词' }}</p>
        <p class="reuse-hint">复用配置会新建任务，参考图需要重新添加。</p>
      </template>
      <template #footer><div v-if="selected" class="detail-footer"><el-button v-if="hasPermission('image:asset:download')" :icon="Download" :loading="downloading.has(selected.id)" :disabled="downloading.has(selected.id)" @click="download(selected)">下载图片</el-button><el-button type="primary" :icon="RefreshRight" @click="reuse(selected)">复用配置</el-button></div></template>
    </el-drawer>
    <el-image-viewer teleported v-if="previewOpen && selected" :url-list="[imageSource(selected)]" @close="previewOpen = false" />
  </section>
</template>

<script setup lang="ts">
import { nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type TableInstance } from 'element-plus'
import { Download, RefreshRight, Search, Plus, Refresh, Picture, ZoomIn, TopRight, InfoFilled } from '@element-plus/icons-vue'
import { useImageHistoryStore } from '../../stores/imageHistoryStore.ts'
import type { ImageHistoryRecord } from '../../repositories/imageHistory.ts'
import { hasPermission } from '../../account/iam'
import { downloadImage } from '../../utils/download'
import { modelOptions } from '../jimeng/js/config'

const history = useImageHistoryStore()
const router = useRouter()
const search = ref(''), model = ref(''), sort = ref<'newest' | 'oldest'>('newest'), page = ref(1)
const pageSize = ref(20)
const tableRef = ref<TableInstance>()
const compactQuery = window.matchMedia('(max-width: 900px)')
const compactTable = ref(compactQuery.matches)
function syncCompact() { compactTable.value = compactQuery.matches }
onMounted(() => compactQuery.addEventListener('change', syncCompact))
onUnmounted(() => compactQuery.removeEventListener('change', syncCompact))
const detailsOpen = ref(false), previewOpen = ref(false)
const selected = ref<ImageHistoryRecord | null>(null)
const downloading = ref(new Set<string>())
let active = false
let timer: ReturnType<typeof setTimeout> | undefined
function promptSummary(value: string) { const characters = Array.from(value); return characters.length > 120 ? `${characters.slice(0, 120).join('')}…` : value || '此记录没有保存提示词' }
function modelLabel(value: string) { return modelOptions.find(item => item.value === value)?.label || value || '模型未记录' }
function formatDate(value?: string, full = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return '时间未记录'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', ...(full ? { hour: '2-digit', minute: '2-digit' } as const : {}) }).format(new Date(value))
}
function imageSource(record: ImageHistoryRecord) {
  if (/^(https?:|data:image\/|blob:|\/)/i.test(record.url)) return record.url
  return /^image\/(png|jpeg|webp|gif)$/i.test(record.code) ? `data:${record.code};base64,${record.url}` : ''
}
async function load() {
  clearTimeout(timer)
  await history.load({ search: search.value, model: model.value, sort: sort.value, page: page.value, pageSize: pageSize.value })
  if (!history.loadError && page.value > Math.max(1, Math.ceil(history.total / pageSize.value))) { page.value = Math.max(1, Math.ceil(history.total / pageSize.value)); await load(); return }
  await nextTick()
  tableRef.value?.setScrollTop(0)
  tableRef.value?.setScrollLeft(0)
}
watch([search, model, sort], () => { page.value = 1; clearTimeout(timer); if (active) timer = setTimeout(() => { void load() }, 180) })
watch(() => history.revision, () => { if (active) void load() })
onActivated(() => { active = true; void load() })
onDeactivated(() => { active = false; clearTimeout(timer); detailsOpen.value = false; previewOpen.value = false })
onUnmounted(() => clearTimeout(timer))
function resetFilters() { search.value = ''; model.value = '' }
function changePageSize() { page.value = 1; void load() }
function changePage(value: number) { page.value = value; void load() }
function openDetails(record: ImageHistoryRecord) { selected.value = record; detailsOpen.value = true }
async function download(record: ImageHistoryRecord) {
  if (downloading.value.has(record.id)) return
  downloading.value.add(record.id)
  try {
    await downloadImage(imageSource(record), `image-${record.id.replace(/[^a-z0-9-]/gi, '-').slice(-40)}.png`)
    ElMessage.success('已发起下载，请查看浏览器下载列表')
  } catch { ElMessage.error('图片下载失败，请重试或在详情中打开原图另存') }
  finally { downloading.value.delete(record.id) }
}
async function reuse(record: ImageHistoryRecord) {
  history.prepareReuse(record)
  try { await router.push({ name: 'ImageGeneration' }); detailsOpen.value = false }
  catch { ElMessage.error('暂时无法打开创作页面，请重试') }
}
async function retrySave() { if (await history.ensureSaved()) { ElMessage.success('历史记录已保存'); await load() } }
</script>

<style scoped>
.history-page { display: flex; flex-direction: column; height: 100%; min-height: 600px; padding: 18px 20px; background: var(--canvas); }
.page-header, .history-toolbar, .history-summary, .history-warning { flex-shrink: 0; }
.page-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
h1 { font-size: 21px; line-height: 1.4; letter-spacing: -.3px; }
.page-header p { color: var(--text-muted); font-size: 12px; margin-top: 4px; }
.header-actions { display: flex; gap: 8px; flex-shrink: 0; }
.history-toolbar { display: flex; gap: 10px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.search-input { max-width: 420px; flex: 1; }
.model-filter { width: 210px; }
.sort-filter { width: 150px; margin-left: auto; }
.history-summary { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--text-muted); font-size: 12px; }
.history-summary strong { color: var(--text-h); }
.history-summary > span { display: flex; align-items: center; gap: 5px; font-size: 11px; }
.history-table-panel { display: flex; flex-direction: column; flex: 1; min-height: 320px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); overflow: hidden; }
.history-table { flex: 1; min-height: 0; width: 100%; --el-table-header-bg-color: #f9f9fd; --el-table-row-hover-bg-color: #f7f6ff; --el-table-border-color: var(--border); font-size: 12px; }
.history-table :deep(th.el-table__cell) { height: 44px; color: var(--text-muted); font-size: 12px; font-weight: 500; }
.history-table :deep(td.el-table__cell) { padding: 10px 0; }
.history-table :deep(.cell) { padding: 0 12px; }
.history-table :deep(.el-table__empty-block) { min-height: 240px; }
.history-table :deep(.el-table__empty-text) { width: auto; max-width: 320px; line-height: 1.7; padding: 30px; }
.thumbnail-button { display: block; width: 70px; height: 62px; padding: 0; border: 1px solid var(--border); background: var(--canvas); border-radius: 6px; cursor: pointer; overflow: hidden; }
.thumbnail-button .el-image { width: 100%; height: 100%; }
.table-prompt { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; white-space: pre-wrap; line-height: 1.7; color: var(--text); }
.model-tag { display: inline-block; max-width: 100%; color: var(--brand); background: var(--brand-soft); padding: 3px 6px; border-radius: 4px; font-size: 11px; overflow-wrap: anywhere; }
.row-actions { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
.row-actions :deep(.el-button) { height: 28px; min-height: 28px; font-size: 12px; }
.row-actions :deep(.el-button.is-plain) { padding: 6px 8px; }
.history-pagination { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 14px; }
.pagination-summary { display: flex; align-items: center; gap: 12px; color: var(--text-muted); font-size: 12px; }
.pagination-summary .el-select { width: 110px; }
.history-warning { margin-bottom: 12px; }
.history-empty { padding: 28px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.table-scroll-hint { flex-shrink: 0; display: none; padding: 10px 12px; color: var(--text-muted); font-size: 11px; border-bottom: 1px solid var(--border); }
.image-error { width: 100%; height: 100%; min-height: 100px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; font-size: 12px; color: var(--text-muted); background: var(--canvas); }
.thumbnail-error { min-height: 0 !important; font-size: 10px !important; gap: 3px !important; }
.thumbnail-error .el-icon { font-size: 18px !important; }
.image-error .el-icon { font-size: 30px; color: #aaa7d0; }
.detail-heading h2 { font-size: 17px; line-height: 1.5; }
.detail-heading p { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.detail-preview { height: 270px; border: 1px solid var(--border); background: var(--canvas); border-radius: 8px; overflow: hidden; }
.detail-preview .el-image { width: 100%; height: 100%; }
.preview-actions { display: flex; justify-content: space-between; align-items: center; margin: 8px 0 16px; }
.preview-actions a { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; text-decoration: none; }
.detail-settings { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 12px; margin: 0 0 22px; padding: 14px; background: var(--canvas); border-radius: 8px; }
.detail-settings > div { min-width: 0; }
.detail-settings dt { color: var(--text-muted); font-size: 11px; margin-bottom: 6px; }
.detail-settings dd { font-size: 12px; color: var(--text); margin: 0; overflow-wrap: anywhere; }
.detail-prompt-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.detail-prompt-heading h3 { font-size: 13px; }
.detail-prompt-heading span { color: var(--text-muted); font-size: 11px; }
.detail-prompt { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 32vh; overflow-y: auto; padding: 14px; border: 1px solid var(--border); border-radius: 7px; font-size: 13px; line-height: 1.8; }
.reuse-hint { color: var(--text-muted); font-size: 12px; margin-top: 14px; }
.detail-footer { display: flex; gap: 8px; }
.detail-footer > .el-button { flex: 1; }
@container workspace (max-width: 849px) { .table-scroll-hint { display: block; } .history-toolbar { flex-wrap: wrap; } .search-input { max-width: none; flex-basis: 100%; } .model-filter { flex: 1; } .sort-filter { width: 150px; } .history-summary { align-items: flex-start; flex-direction: column; gap: 4px; padding: 10px 0; } }
@container workspace (max-width: 499px) { .history-page { padding: 12px; } .page-header { align-items: flex-start; flex-direction: column; gap: 12px; } .history-toolbar { padding: 12px; } .model-filter, .sort-filter { flex: 1; min-width: 0; width: 100%; } .history-pagination { justify-content: center; } .history-summary > span { line-height: 1.6; } }
</style>
<style>
.history-detail-drawer .el-drawer__header { margin: 0; padding: 20px; border-bottom: 1px solid var(--border); }
.history-detail-drawer .el-drawer__body { padding: 18px 20px; }
.history-detail-drawer .el-drawer__footer { padding: 14px 20px; border-top: 1px solid var(--border); }
@media (max-width: 600px) { .history-detail-drawer .el-drawer__header, .history-detail-drawer .el-drawer__body { padding: 16px; } .history-detail-drawer .el-drawer__footer { padding: 12px 16px max(12px, env(safe-area-inset-bottom)); } }
</style>

<script setup lang="ts">
import { computed, onActivated, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { hasPermission } from '../../account/iam'
import { adapters, createModel, models, providers, updateModel, type Adapter, type AuditEntity, type MediaKind, type Model, type Provider } from '../../api/modelAdmin'
import ChangeHistory from './ChangeHistory.vue'
import { ratioOptions } from '../jimeng/js/config'
import './admin.css'

const route = useRoute()
const canWrite = computed(() => hasPermission('model:config:read') && hasPermission('model:config:write'))
const rows = ref<Model[]>([])
const providerList = ref<Provider[]>([])
const protocols = ref<Adapter[]>([])
const providerFilter = ref('')
const kindFilter = ref('')
const stateFilter = ref('')
const loading = ref(false)
const failed = ref(false)
const saving = ref(false)
const open = ref(false)
const editing = ref<Model>()
const stateModel = ref<Model>()
const stateOpen = ref(false)
const replacementId = ref('')
const auditOpen = ref(false)
const auditId = ref('')
const auditEntity = ref<AuditEntity>('model')
const form = reactive({
  providerId: '', upstreamModelId: '', name: '', kind: 'image' as MediaKind,
  sizes: [] as string[], imageRatios: [] as string[], videoRatios: '', resolutions: '', maxReferenceImages: 0, minDuration: 5,
  maxDuration: 15, maxMaterials: 0, sortOrder: 0,
})
watch(() => route.query.provider, value => { providerFilter.value = typeof value === 'string' ? value : '' }, { immediate: true })
const filtered = computed(() => rows.value.filter(row =>
  (!providerFilter.value || row.providerId === providerFilter.value) &&
  (!kindFilter.value || row.kind === kindFilter.value) &&
  (!stateFilter.value || row.enabled === (stateFilter.value === 'enabled')),
))
const availableProviders = computed(() => providerList.value.filter(provider =>
  protocols.value.some(item => item.id === provider.protocol && item.kind === form.kind),
))
const replacements = computed(() => rows.value.filter(row =>
  row.kind === stateModel.value?.kind && row.id !== stateModel.value?.id && row.enabled,
))
const providerName = (id: string) => providerList.value.find(item => item.id === id)?.name ?? id
const kindName = (kind: MediaKind) => ({ image: '图片', video: '视频', text: '文本' })[kind]
const imageRatioOptions = computed(() => [...new Set([
  ...ratioOptions.map(option => option.value), ...form.imageRatios,
])])
const imageSizeOptions = computed(() => [...new Set(['1K', '2K', '3K', '4K', ...form.sizes])])
const split = (value: string) => value.split(/[,，\s]+/).filter(Boolean)

async function load() {
  loading.value = true
  failed.value = false
  try {
    const [list, associated, choices] = await Promise.all([models(), providers(), adapters()])
    rows.value = list
    providerList.value = associated
    protocols.value = choices
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
onActivated(load)

function edit(row?: Model) {
  editing.value = row
  const cap = row?.capabilities
  const selected = providerList.value.find(item => item.id === providerFilter.value)
  const selectedKind = protocols.value.find(item => item.id === selected?.protocol)?.kind
  Object.assign(form, {
    providerId: row?.providerId ?? selected?.id ?? '',
    upstreamModelId: row?.upstreamModelId ?? '',
    name: row?.name ?? '', kind: row?.kind ?? selectedKind ?? (kindFilter.value === 'video' || kindFilter.value === 'text' ? kindFilter.value : 'image'),
    sizes: [...(cap?.sizes ?? [])],
    imageRatios: row?.kind === 'image' ? [...(row.capabilities.ratios ?? [])] : [],
    videoRatios: row?.kind === 'video' ? (row.capabilities.ratios ?? []).join(', ') : '',
    resolutions: cap?.resolutions?.join(', ') ?? '', maxReferenceImages: cap?.maxReferenceImages ?? 0,
    minDuration: cap?.minDuration ?? 5, maxDuration: cap?.maxDuration ?? 15,
    maxMaterials: cap?.maxMaterials ?? 0, sortOrder: row?.sortOrder ?? 0,
  })
  open.value = true
}

async function apply(action: () => Promise<unknown>, close?: () => void) {
  if (saving.value) return
  saving.value = true
  try {
    await action()
    close?.()
    ElMessage.success('模型配置已保存')
    await load()
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 409) await load()
  } finally {
    saving.value = false
  }
}

function save() {
  const ratios = form.kind === 'image' ? form.imageRatios : split(form.videoRatios)
  if (form.kind === 'image' && (!ratios.length || !form.sizes.length)) {
    ElMessage.warning('请至少选择一个图片比例和一个尺寸')
    return
  }
  const capabilities = form.kind === 'image'
    ? { ratios, sizes: form.sizes, maxReferenceImages: form.maxReferenceImages }
    : form.kind === 'video' ? { ratios, resolutions: split(form.resolutions), minDuration: form.minDuration, maxDuration: form.maxDuration, maxMaterials: form.maxMaterials } : {}
  const data = { name: form.name, sortOrder: form.sortOrder, capabilities }
  const row = editing.value
  return apply(() => row ? updateModel(row.id, { ...data, version: row.version }) : createModel({
    ...data, providerId: form.providerId, upstreamModelId: form.upstreamModelId, kind: form.kind,
  }), () => { open.value = false })
}

function changeState(row: Model) {
  stateModel.value = row
  replacementId.value = ''
  stateOpen.value = true
}

function saveState() {
  const row = stateModel.value
  if (!row) return
  return apply(() => updateModel(row.id, {
    version: row.version, enabled: !row.enabled, replacementId: replacementId.value || undefined,
  }), () => { stateOpen.value = false })
}

function showAudit(entity: AuditEntity, id: string) {
  auditEntity.value = entity
  auditId.value = id
  auditOpen.value = true
}
</script>

<template>
  <section class="model-admin">
    <header class="admin-header">
      <h1>模型管理</h1>
      <el-button v-if="canWrite" type="primary" :disabled="loading || failed || !providerList.length" @click="edit()">新增模型</el-button>
    </header>
    <el-alert class="admin-notice" title="配置将在生成接入后生效" type="info" :closable="false" />
    <el-alert v-if="failed" class="admin-notice" title="读取模型失败" type="error" :closable="false">
      <el-button text @click="load">重试</el-button>
    </el-alert>
    <p v-else-if="canWrite && !loading && !providerList.length">
      请先 <router-link :to="{ name: 'ProviderAdmin' }">新增提供商</router-link>。
    </p>
    <div class="admin-filters">
      <el-select v-model="kindFilter" aria-label="模型类型" placeholder="全部类型" clearable>
        <el-option label="图片" value="image" /><el-option label="视频" value="video" /><el-option label="文本" value="text" />
      </el-select>
      <el-select v-model="providerFilter" aria-label="提供商" placeholder="全部提供商" clearable>
        <el-option v-for="item in providerList" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-select v-model="stateFilter" aria-label="启停状态" placeholder="全部状态" clearable>
        <el-option label="已启用" value="enabled" /><el-option label="已停用" value="disabled" />
      </el-select>
      <el-button text @click="showAudit('default', 'image')">图片默认变更</el-button>
      <el-button text @click="showAudit('default', 'video')">视频默认变更</el-button>
      <el-button text @click="showAudit('default', 'text')">文本默认变更</el-button>
    </div>
    <el-table class="admin-table" v-loading="loading" :data="filtered" empty-text="暂无匹配模型">
      <el-table-column prop="name" label="模型名称" min-width="155" />
      <el-table-column prop="upstreamModelId" label="模型 ID" min-width="170" show-overflow-tooltip />
      <el-table-column label="提供商" min-width="115"><template #default="{ row }">{{ providerName(row.providerId) }}</template></el-table-column>
      <el-table-column label="类型" width="75"><template #default="{ row }">{{ kindName(row.kind) }}</template></el-table-column>
      <el-table-column label="能力" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ (row.capabilities.sizes ?? row.capabilities.resolutions ?? []).join(' / ') }}</template>
      </el-table-column>
      <el-table-column label="状态" width="140">
        <template #default="{ row }">{{ row.enabled ? '已启用' : '已停用' }} <el-tag v-if="row.isDefault" size="small">默认</el-tag></template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="75" />
      <el-table-column label="操作" :width="canWrite ? 265 : 95">
        <template #default="{ row }">
          <el-button v-if="canWrite" link type="primary" @click="edit(row)">编辑</el-button>
          <el-button v-if="canWrite" link type="primary" @click="changeState(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
          <el-button v-if="canWrite && row.enabled && !row.isDefault" link type="primary" :disabled="saving"
            @click="apply(() => updateModel(row.id, { version: row.version, setDefault: true }))">设为默认</el-button>
          <el-button link type="primary" @click="showAudit('model', row.id)">变更记录</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-drawer v-model="open" :title="editing ? '编辑模型' : '新增模型'" size="min(520px, 100vw)"
      :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
      <el-form label-position="top" :disabled="saving" @submit.prevent="save">
        <el-form-item label="类型" required>
          <el-select v-model="form.kind" :disabled="Boolean(editing)" @change="form.providerId = ''">
            <el-option label="图片" value="image" /><el-option label="视频" value="video" /><el-option label="文本" value="text" />
          </el-select>
        </el-form-item>
        <el-form-item label="提供商" required>
          <el-select v-model="form.providerId" :disabled="Boolean(editing)">
            <el-option v-for="item in availableProviders" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="上游模型 ID" required><el-input v-model="form.upstreamModelId" :disabled="Boolean(editing)" maxlength="255" /></el-form-item>
        <el-form-item label="显示名称" required><el-input v-model="form.name" maxlength="150" /></el-form-item>
        <template v-if="form.kind === 'image'">
          <el-form-item label="比例" required>
            <el-select v-model="form.imageRatios" multiple filterable allow-create default-first-option :multiple-limit="30"
              placeholder="选择比例，或输入 5:4 后按回车">
              <el-option v-for="option in imageRatioOptions" :key="option" :label="option" :value="option" />
            </el-select>
          </el-form-item>
          <el-form-item label="尺寸" required>
            <el-select v-model="form.sizes" multiple filterable allow-create default-first-option :multiple-limit="30"
              placeholder="选择尺寸，或输入 1024x768 后按回车">
              <el-option v-for="option in imageSizeOptions" :key="option" :label="option" :value="option" />
            </el-select>
          </el-form-item>
          <el-form-item label="参考图上限"><el-input-number v-model="form.maxReferenceImages" :min="0" :max="100" /></el-form-item>
        </template>
        <template v-else-if="form.kind === 'video'">
          <el-form-item label="比例（逗号分隔）" required><el-input v-model="form.videoRatios" placeholder="1:1, 16:9" /></el-form-item>
          <el-form-item label="分辨率（逗号分隔）" required><el-input v-model="form.resolutions" placeholder="720p, 1080p" /></el-form-item>
          <el-form-item label="最短时长（秒）"><el-input-number v-model="form.minDuration" :min="1" :max="3600" /></el-form-item>
          <el-form-item label="最长时长（秒）"><el-input-number v-model="form.maxDuration" :min="1" :max="3600" /></el-form-item>
          <el-form-item label="素材数量上限"><el-input-number v-model="form.maxMaterials" :min="0" :max="100" /></el-form-item>
        </template>
        <el-form-item label="排序"><el-input-number v-model="form.sortOrder" /></el-form-item>
        <el-button type="primary" native-type="submit" :loading="saving">保存</el-button>
        <el-button :disabled="saving" @click="open = false">取消</el-button>
      </el-form>
    </el-drawer>
    <el-dialog v-model="stateOpen" :title="stateModel?.enabled ? '停用模型' : '启用模型'" width="min(460px, calc(100vw - 24px))"
      :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
      <p>{{ stateModel?.name }}</p>
      <template v-if="stateModel?.enabled && stateModel.isDefault">
        <el-form-item v-if="replacements.length" label="替代默认模型">
          <el-select v-model="replacementId">
            <el-option v-for="item in replacements" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <p v-else>没有其他已启用的同类型模型，停用后将清空默认项。</p>
      </template>
      <template #footer>
        <el-button :disabled="saving" @click="stateOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving"
          :disabled="Boolean(stateModel?.isDefault && replacements.length && !replacementId)" @click="saveState">确认</el-button>
      </template>
    </el-dialog>
    <ChangeHistory v-model="auditOpen" :entity="auditEntity" :id="auditId" />
  </section>
</template>

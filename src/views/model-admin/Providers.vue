<script setup lang="ts">
import { computed, onActivated, onDeactivated, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { hasPermission } from '../../account/iam'
import { adapters, providers, saveProvider, type Adapter, type Provider } from '../../api/modelAdmin'
import ChangeHistory from './ChangeHistory.vue'
import './admin.css'

const canWrite = computed(() => hasPermission('model:config:read') && hasPermission('model:config:write'))
const rows = ref<Provider[]>([])
const protocols = ref<Adapter[]>([])
const loading = ref(false)
const failed = ref(false)
const saving = ref(false)
const open = ref(false)
const editing = ref<Provider>()
const auditId = ref('')
const auditOpen = ref(false)
const form = reactive({ name: '', apiUrl: '', protocol: '', apiKey: '' })

async function load() {
  loading.value = true
  failed.value = false
  try {
    const [list, choices] = await Promise.all([providers(), adapters()])
    rows.value = list
    protocols.value = choices
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
onActivated(load)
onDeactivated(() => { open.value = false; form.apiKey = '' })

function edit(row?: Provider) {
  editing.value = row
  Object.assign(form, { name: row?.name ?? '', apiUrl: row?.apiUrl ?? '', protocol: row?.protocol ?? '', apiKey: '' })
  open.value = true
}

async function save() {
  if (saving.value) return
  if (!form.name.trim() || !form.apiUrl.trim() || !form.protocol || (!editing.value && !form.apiKey.trim())) {
    ElMessage.warning('请填写所有必填项')
    return
  }
  saving.value = true
  try {
    await saveProvider({ ...form, version: editing.value?.version }, editing.value?.id)
    form.apiKey = ''
    open.value = false
    ElMessage.success('提供商已保存')
    await load()
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 409) await load()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="model-admin">
    <header class="admin-header">
      <h1>提供商管理</h1>
      <el-button v-if="canWrite" type="primary" :disabled="loading || failed" @click="edit()">新增提供商</el-button>
    </header>
    <el-alert class="admin-notice" title="配置将在生成接入后生效" type="info" :closable="false" />
    <el-alert v-if="failed" class="admin-notice" title="读取提供商失败" type="error" :closable="false">
      <el-button text @click="load">重试</el-button>
    </el-alert>
    <el-table class="admin-table" v-loading="loading" :data="rows" empty-text="暂无提供商">
      <el-table-column prop="name" label="提供商" min-width="150" />
      <el-table-column prop="apiUrl" label="API 地址" min-width="220" show-overflow-tooltip />
      <el-table-column label="接口协议" min-width="100">
        <template #default="{ row }">{{ protocols.find(item => item.id === row.protocol)?.label ?? row.protocol }}</template>
      </el-table-column>
      <el-table-column label="API Key" width="100">
        <template #default="{ row }">{{ row.keyConfigured ? '已配置' : '未配置' }}</template>
      </el-table-column>
      <el-table-column label="关联模型" width="100">
        <template #default="{ row }">
          <el-link :href="$router.resolve({ name: 'ModelAdmin', query: { provider: row.id } }).href">{{ row.modelCount }} 个</el-link>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="168">
        <template #default="{ row }">
          <el-button v-if="canWrite" link type="primary" @click="edit(row)">编辑</el-button>
          <el-button link type="primary" @click="auditId = row.id; auditOpen = true">变更记录</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-drawer v-model="open" :title="editing ? '编辑提供商' : '新增提供商'" size="min(520px, 100vw)"
      :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" @closed="form.apiKey = ''">
      <el-form label-position="top" :disabled="saving" @submit.prevent="save">
        <el-form-item label="提供商名称" required><el-input v-model="form.name" maxlength="150" /></el-form-item>
        <el-form-item label="API 地址" required><el-input v-model="form.apiUrl" placeholder="https://" maxlength="2048" /></el-form-item>
        <el-form-item label="接口协议" required>
          <el-select v-model="form.protocol" :disabled="Boolean(editing?.modelCount)">
            <el-option v-for="item in protocols" :key="item.id" :label="item.label" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="API Key" :required="!editing">
          <el-input v-model="form.apiKey" type="password" autocomplete="new-password" :placeholder="editing ? '留空保留当前 API Key' : '输入 API Key'" />
        </el-form-item>
        <p v-if="editing?.modelCount">更新连接配置会影响此提供商关联的 {{ editing.modelCount }} 个模型。</p>
        <el-button type="primary" native-type="submit" :loading="saving">保存</el-button>
        <el-button :disabled="saving" @click="open = false">取消</el-button>
      </el-form>
    </el-drawer>
    <ChangeHistory v-model="auditOpen" entity="provider" :id="auditId" />
  </section>
</template>

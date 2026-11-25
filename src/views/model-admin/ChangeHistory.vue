<script setup lang="ts">
import { ref, watch } from 'vue'
import { changes, type AuditEntity } from '../../api/modelAdmin'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ entity: AuditEntity; id: string }>()
const page = ref(1)
const result = ref<Awaited<ReturnType<typeof changes>>>()
const loading = ref(false)
const failed = ref(false)
let sequence = 0

async function load() {
  const current = ++sequence
  loading.value = true
  failed.value = false
  try {
    const data = await changes(props.entity, props.id, page.value)
    if (current === sequence) result.value = data
  } catch {
    if (current === sequence) failed.value = true
  } finally {
    if (current === sequence) loading.value = false
  }
}

watch(() => [open.value, props.entity, props.id], () => {
  sequence++
  if (open.value) {
    page.value = 1
    result.value = undefined
    void load()
  }
})
</script>

<template>
  <el-drawer v-model="open" title="变更记录" size="min(620px, 100vw)">
    <div v-loading="loading">
      <el-alert v-if="failed" title="读取变更记录失败" type="error" :closable="false">
        <el-button text @click="load">重试</el-button>
      </el-alert>
      <template v-else-if="result">
        <el-empty v-if="!result.items.length" description="暂无变更记录" />
        <el-collapse v-else>
          <el-collapse-item v-for="item in result.items" :key="item.id" :name="item.id">
            <template #title>
              {{ new Date(item.createdAt).toLocaleString() }} · {{ item.action === 'create' ? '新增' : '更新' }} · {{ item.actorId }}
            </template>
            <pre>{{ JSON.stringify(item.details, null, 2) }}</pre>
          </el-collapse-item>
        </el-collapse>
        <el-button :disabled="page === 1 || loading" @click="page--; load()">上一页</el-button>
        <el-button :disabled="!result.hasNext || loading" @click="page++; load()">下一页</el-button>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped>
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>

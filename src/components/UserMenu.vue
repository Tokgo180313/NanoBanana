<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, User, SwitchButton } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { accountAvailable, AccountError, errorMessage } from '../account/service.ts'
import { useAccountStore } from '../stores/accountStore'
const emit = defineEmits<{ changePassword: [] }>()
const account = useAccountStore()
const router = useRouter()
const pending = ref(false)
const label = computed(() => account.user?.displayName || account.user?.nickname || account.user?.username || (accountAvailable() ? '当前账号' : '预览模式'))
async function command(value: string) {
  if (value === 'profile') { await router.push({ name: 'UserProfile' }); return }
  if (value === 'password') { emit('changePassword'); return }
  if (pending.value) return
  pending.value = true
  try { const result=await account.logout(); if(!result?.redirected)await router.replace({ name: 'Login' }) }
  catch (cause) {
    ElMessage.error(errorMessage(cause))
    if (cause instanceof AccountError && cause.code === 'expired') {
      try { await account.expire() } catch { ElMessage.warning('会话清理失败，请重新登录。') } finally { await router.replace({ name: 'Login' }) }
    }
  } finally { pending.value = false }
}
</script>
<template>
  <el-dropdown trigger="click" placement="bottom-end" @command="command">
    <button class="user-menu-trigger" type="button" aria-label="打开用户菜单" :disabled="pending"><span class="avatar"><el-icon><User /></el-icon></span><span class="user-label">{{ label }}</span><el-icon><ArrowDown /></el-icon></button>
    <template #dropdown><el-dropdown-menu class="account-dropdown">
      <div class="menu-identity"><strong>{{ label }}</strong><span>{{ account.user?.username || '--' }}</span></div>
      <el-dropdown-item command="profile" :icon="User">个人信息</el-dropdown-item>
      
      <el-dropdown-item command="logout" divided :icon="SwitchButton" :disabled="pending">{{ accountAvailable() ? '退出登录' : '返回登录页' }}</el-dropdown-item>
    </el-dropdown-menu></template>
  </el-dropdown>
</template>
<style scoped>
.user-menu-trigger { border: 0; background: transparent; display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 5px 10px; color: var(--text); border-radius: 8px; cursor: pointer; }.user-menu-trigger:hover { background: var(--brand-soft); }.avatar { height: 30px; width: 30px; background: var(--brand-soft); color: var(--brand); border-radius: 50%; display: grid; place-items: center; }.user-label { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }.menu-identity { display: flex; flex-direction: column; gap: 4px; padding: 10px 16px 14px; max-width: 240px; overflow-wrap: anywhere; border-bottom: 1px solid var(--border); margin-bottom: 5px; }.menu-identity strong { font-size: 13px; }.menu-identity span { font-size: 12px; color: var(--text-muted); }
</style>

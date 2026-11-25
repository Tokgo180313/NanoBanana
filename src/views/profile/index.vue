<script setup lang="ts">
import { computed } from 'vue'
import { User, Refresh } from '@element-plus/icons-vue'
import { useAccountStore } from '../../stores/accountStore'
import { accountAvailable } from '../../account/service.ts'

const account = useAccountStore()

const optionalFields = computed(() => [
  { label: '姓名 / 昵称', value: account.user?.displayName || account.user?.nickname },
  { label: '所属租户', value: account.user?.tenantName },
  { label: '所属部门 / 组织', value: account.user?.departmentName },
  { label: '邮箱', value: account.user?.maskedEmail },
  { label: '手机号', value: account.user?.maskedPhone },
].filter(field => field.value))
</script>
<template>
  <section class="profile-page" aria-labelledby="profile-title">
    <header><div><h1 id="profile-title">个人信息</h1><p>查看你的账号信息与安全设置</p></div><span class="external-password">密码由企业身份服务管理</span></header>
    <el-alert v-if="account.error" :title="account.error" :type="accountAvailable() ? 'error' : 'info'" :closable="false" show-icon />
    <div v-loading="account.loading" class="profile-card" :aria-busy="account.loading">
      <div class="profile-card-heading"><span class="profile-avatar"><el-icon><User /></el-icon></span><div><h2>{{ account.user?.displayName || account.user?.nickname || '账号资料' }}</h2><p>账号信息由统一认证服务管理</p></div><el-button v-if="accountAvailable()" :icon="Refresh" :loading="account.loading" @click="account.load()">刷新</el-button></div>
      <dl><div><dt>登录账号</dt><dd>{{ account.user?.username || '--' }}</dd></div><div v-for="field in optionalFields" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div><div v-if="account.user?.roles?.length"><dt>当前角色</dt><dd class="roles"><el-tag v-for="role in account.user.roles" :key="role" effect="plain">{{ role }}</el-tag></dd></div></dl>
      <p class="profile-note">个人资料暂不支持编辑。如需调整组织或角色，请联系管理员。</p>
    </div>
  </section>
</template>
<style scoped>
.profile-page { padding: 24px; max-width: 1060px; margin: 0 auto; }.profile-page header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }h1 { font-size: 21px; }header p,.profile-card-heading p { font-size: 12px; color: var(--text-muted); margin-top: 5px; }.profile-card { border: 1px solid var(--border); background: var(--surface); border-radius: 12px; margin-top: 20px; padding: 28px; }.profile-card-heading { display: flex; align-items: center; gap: 14px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }.profile-card-heading h2 { font-size: 16px; }.profile-card-heading > .el-button { margin-left: auto; }.profile-avatar { width: 48px; height: 48px; background: var(--brand-soft); border-radius: 14px; display: grid; place-items: center; color: var(--brand); font-size: 23px; }dl { margin: 8px 0 0; }dl > div { display: grid; grid-template-columns: 150px minmax(0,1fr); gap: 12px; padding: 20px 0; border-bottom: 1px solid var(--border); font-size: 13px; }dt { color: var(--text-muted); }dd { margin: 0; overflow-wrap: anywhere; }.roles { display: flex; flex-wrap: wrap; gap: 8px; }.profile-note { margin-top: 24px; color: var(--text-muted); font-size: 12px; line-height: 1.8; }header .el-button { min-height: 40px; }
@media (max-width: 600px) { .profile-page { padding: 20px 16px; }.profile-card { padding: 20px; }dl > div { grid-template-columns: 100px minmax(0,1fr); }.profile-card-heading { flex-wrap: wrap; } }
</style>

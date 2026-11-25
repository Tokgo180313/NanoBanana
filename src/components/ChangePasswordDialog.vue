<script setup lang="ts">
import { nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { AccountError, accountAvailable, accountService, createPasswordSubmission, emptyPasswords, errorMessage, validatePasswords, type PasswordPolicy } from '../account/service.ts'
import { useAccountStore } from '../stores/accountStore'
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const router = useRouter()
const account = useAccountStore()
const fields = reactive(emptyPasswords())
const errors = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pending = ref(false)
const policyLoading = ref(false)
const policy = ref<PasswordPolicy>()
const feedback = ref('')
const submitOnce = createPasswordSubmission()
let revision = 0
const inputs = [
  { key: 'oldPassword', label: '当前密码', autocomplete: 'current-password' },
  { key: 'newPassword', label: '新密码', autocomplete: 'new-password' },
  { key: 'confirmPassword', label: '确认密码', autocomplete: 'new-password' },
] as const
function clear() {
  Object.assign(fields, emptyPasswords())
  errors.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  feedback.value = ''
  policy.value = undefined
  policyLoading.value = false
}
onBeforeUnmount(() => { revision++; clear() })
function close() { if (!pending.value) { revision++; clear(); emit('update:modelValue', false) } }
watch(() => props.modelValue, async open => {
  const current = ++revision
  clear()
  if (!open) return
  if (!accountAvailable()) { feedback.value = '账号服务暂未接入，暂时无法修改密码。'; return }
  policyLoading.value = true
  try {
    const result = await accountService.getPasswordPolicy()
    if (revision === current) policy.value = result
  } catch (cause) {
    if (revision !== current) return
    feedback.value = errorMessage(cause)
    if (cause instanceof AccountError && cause.code === 'expired') await expire()
  } finally { if (revision === current) policyLoading.value = false }
})
async function expire() {
  try { await account.expire() }
  catch { ElMessage.warning('会话清理失败，请重新登录。') }
  finally { clear(); emit('update:modelValue', false); await router.replace({ name: 'Login' }); ElMessage.warning('登录已过期，请重新登录') }
}
async function submit() {
  if (pending.value) return
  errors.value = validatePasswords(fields, policy.value)
  const first = inputs.find(input => errors.value[input.key])
  if (first) { await nextTick(); document.getElementById(`change-${first.key}`)?.focus(); return }
  if (!accountAvailable() || !policy.value) { feedback.value = '账号服务或密码策略尚未就绪，请稍后重试。'; return }
  pending.value = true
  feedback.value = ''
  try {
    const result = await submitOnce(fields, accountService.changePassword, async result => {
      // 密码已更改后立即销毁输入，即使会话清理失败也不保留密码。
      Object.assign(fields, emptyPasswords())
      if (result.session === 'reauthenticate') {
        try { await account.expire() }
        catch { ElMessage.warning('密码已修改，但会话清理失败，请重新登录。'); throw new AccountError('expired') }
        finally { await router.replace({ name: 'Login' }) }
      }
    })
    if (!result) return
    ElMessage.success(result.session === 'reauthenticate' ? '密码已修改，请重新登录' : result.otherSessionsRevoked === true ? '密码修改成功，其他设备需要重新登录' : '密码修改成功')
    clear(); emit('update:modelValue', false)
  } catch (cause) {
    feedback.value = errorMessage(cause)
    if (cause instanceof AccountError && cause.code === 'oldPassword') { fields.oldPassword = ''; errors.value.oldPassword = feedback.value }
    if (cause instanceof AccountError && cause.code === 'expired') await expire()
  } finally { pending.value = false }
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="修改密码" width="440px" class="password-dialog" destroy-on-close :close-on-click-modal="false" :close-on-press-escape="!pending" :show-close="!pending" :before-close="close" @update:model-value="(value: boolean) => { if (!value) close() }">
    <p class="password-description">为保护账号安全，请先输入当前密码。</p>
    <el-alert v-if="feedback" :title="feedback" :type="accountAvailable() ? 'error' : 'info'" :closable="false" show-icon role="status" />
    <form novalidate @submit.prevent="submit">
      <div v-for="input in inputs" :key="input.key" class="password-field">
        <label :for="`change-${input.key}`">{{ input.label }} <span aria-hidden="true">*</span></label>
        <el-input :id="`change-${input.key}`" v-model="fields[input.key]" type="password" show-password :autocomplete="input.autocomplete" :disabled="pending" :placeholder="`请输入${input.label}`" :aria-invalid="!!errors[input.key]" :aria-describedby="errors[input.key] ? `error-${input.key}` : input.key === 'newPassword' ? 'password-policy' : undefined" @input="errors[input.key] = ''" />
        <p v-if="errors[input.key]" :id="`error-${input.key}`" class="field-error">{{ errors[input.key] }}</p>
        <p v-if="input.key === 'newPassword'" id="password-policy" class="policy">{{ policyLoading ? '正在获取密码策略…' : policy?.description || '密码规则由账号服务统一提供，当前尚未获取。' }}</p>
      </div>
      <div class="dialog-actions"><el-button :disabled="pending" @click="close">取消</el-button><el-button type="primary" native-type="submit" :loading="pending" :disabled="policyLoading">确认修改</el-button></div>
    </form>
  </el-dialog>
</template>
<style scoped>
.password-description { font-size: 13px; color: var(--text-muted); margin: -6px 0 20px; }
.password-field { margin-top: 20px; }.password-field label { display: block; font-size: 13px; color: var(--text-h); margin-bottom: 8px; }.password-field label span,.field-error { color: #b42335; }.field-error,.policy { font-size: 12px; margin-top: 6px; }.policy { color: var(--text-muted); line-height: 1.6; }.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 28px; }.password-field :deep(.el-input__wrapper) { min-height: 42px; }.dialog-actions .el-button { min-height: 40px; }
</style>
<style>
.password-dialog.el-dialog { max-width: calc(100vw - 32px); border-radius: 12px; padding: 24px; }
</style>

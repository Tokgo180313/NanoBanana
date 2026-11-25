import { ref } from 'vue'
import { defineStore } from 'pinia'
import { AccountError, accountAvailable, accountService, errorMessage, type AccountUser } from '../account/service.ts'

export const useAccountStore = defineStore('account', () => {
  const user = ref<AccountUser | null>(null)
  const loading = ref(false)
  const error = ref('')
  const sessionExpired = ref(false)
  let loadPromise: Promise<void> | undefined
  let generation = 0
  async function load() {
    if (loadPromise) return loadPromise
    if (!accountAvailable()) { error.value = '账号服务暂未接入，当前为预览模式。'; return }
    const current = generation
    loading.value = true
    error.value = ''
    loadPromise = (async () => {
      try {
        const result = await accountService.getMe()
        if (generation === current) { user.value = result ?? null; sessionExpired.value = false }
      } catch (cause) {
        if (generation !== current) return
        error.value = errorMessage(cause)
        if (cause instanceof AccountError && cause.code === 'expired') {
          try { await expire() } catch { error.value = '登录已过期，会话清理失败，请重新登录。' }
        }
      } finally { loading.value = false; loadPromise = undefined }
    })()
    return loadPromise
  }
  async function expire() {
    sessionExpired.value = true
    generation++
    user.value = null
    if (accountAvailable()) await accountService.clearSession()
  }
  async function logout() {
    // 先完成真实登出，失败时保留界面并允许重试。
    const result=accountAvailable()?await accountService.logout():undefined
    generation++
    user.value = null
    error.value = ''
    return result
  }
  return { user, loading, error, sessionExpired, load, expire, logout }
})

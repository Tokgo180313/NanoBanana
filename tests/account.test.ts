import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { AccountError, accountService, createPasswordSubmission, emptyPasswords, errorMessage, installAccountAdapter, validatePasswords, type AccountAdapter, type PasswordResult } from '../src/account/service.ts'
import { useAccountStore } from '../src/stores/accountStore.ts'

const valid = { oldPassword: 'old-value', newPassword: 'new-value', confirmPassword: 'new-value' }
const hasErrors = (fields: ReturnType<typeof emptyPasswords>) => Object.values(validatePasswords(fields)).some(Boolean)
const ok = async () => {}
function adapter(overrides: Partial<AccountAdapter> = {}): AccountAdapter {
  return { getMe: async () => ({ username: 'test-user' }), getPasswordPolicy: async () => ({ description: '测试服务策略' }), changePassword: async () => ({ session: 'keep' }), logout: ok, clearSession: ok, ...overrides }
}
test('默认服务不可用，不产生假成功', async () => {
  assert.throws(() => accountService.getMe(), (e: unknown) => e instanceof AccountError && e.code === 'unavailable')
  assert.throws(() => accountService.changePassword(valid), AccountError)
})
test('三个字段分别必填，不 trim 密码', () => {
  for (const key of ['oldPassword', 'newPassword', 'confirmPassword'] as const) assert.ok(hasErrors({ ...valid, [key]: '' }))
  assert.equal(hasErrors(valid), false)
  assert.equal(hasErrors({ oldPassword: ' a ', newPassword: ' a', confirmPassword: ' a' }), false)
})
test('新旧相同、确认不一致不能通过', () => {
  assert.ok(validatePasswords({ ...valid, newPassword: valid.oldPassword }).newPassword)
  assert.ok(validatePasswords({ ...valid, confirmPassword: 'different' }).confirmPassword)
})
test('只按服务端长度策略验证，不擅自加字符组合规则', () => {
  assert.ok(validatePasswords(valid, { description: '12 位', minLength: 12 }).newPassword)
  assert.ok(validatePasswords(valid, { description: '5 位', maxLength: 5 }).newPassword)
  assert.equal(validatePasswords({ ...valid, newPassword: 'abcdefghijkl', confirmPassword: 'abcdefghijkl' }, { description: '12 位', minLength: 12 }).newPassword, '')
})
test('关闭重开所用的空表单为独立对象，无密码残留', () => {
  const first = emptyPasswords(); Object.assign(first, valid)
  assert.deepEqual(emptyPasswords(), { oldPassword: '', newPassword: '', confirmPassword: '' })
})
test('请求 payload 严格白名单，排除 confirmPassword 和 userId', async () => {
  let received: unknown
  installAccountAdapter(adapter({ changePassword: async payload => { received = payload; return { session: 'keep' } } }))
  await accountService.changePassword({ ...valid, userId: 'forbidden' } as typeof valid)
  assert.deepEqual(received, { oldPassword: valid.oldPassword, newPassword: valid.newPassword })
})
test('并行重复提交只产生一次请求，包含会话处理期间', async () => {
  const submit = createPasswordSubmission()
  let calls = 0
  let finish!: () => void
  const wait = new Promise<void>(resolve => { finish = resolve })
  const change = async (): Promise<PasswordResult> => { calls++; return { session: 'keep' } }
  const first = submit(valid, change, () => wait)
  await Promise.resolve()
  assert.equal(await submit(valid, change, ok), undefined)
  assert.equal(calls, 1)
  finish(); await first
})
test('成功时按认证策略处理当前会话，缺少策略不宣告成功', async () => {
  for (const session of ['keep', 'reauthenticate'] as const) {
    let applied: unknown
    const result = await createPasswordSubmission()(valid, async () => ({ session }), async result => { applied = result.session })
    assert.equal(result?.session, session); assert.equal(applied, session)
  }
  await assert.rejects(createPasswordSubmission()(valid, async () => ({} as PasswordResult), ok), AccountError)
})
test('密码错误、策略、401、429、5xx 和网络异常后均可安全重试', async () => {
  for (const code of ['oldPassword', 'policy', 'expired', 'rateLimited', 'server', 'network', 'reused'] as const) {
    const submit = createPasswordSubmission()
    const error = new AccountError(code)
    await assert.rejects(submit(valid, async () => { throw error }, ok), AccountError)
    assert.ok(errorMessage(error))
    assert.equal((await submit(valid, async () => ({ session: 'keep' }), ok))?.session, 'keep')
  }
  assert.equal(errorMessage(new Error('sensitive-input')), '操作失败，请稍后重试')
})
test('账号可为空或仅有部分字段，退出完成后清空内存用户', async () => {
  setActivePinia(createPinia())
  installAccountAdapter(adapter({ getMe: async () => ({}) }))
  const store = useAccountStore(); await store.load(); assert.deepEqual(store.user, {})
  installAccountAdapter(adapter()); await store.load(); assert.equal(store.user?.username, 'test-user')
  let loggedOut = false
  installAccountAdapter(adapter({ logout: async () => { loggedOut = true } }))
  await store.logout(); assert.ok(loggedOut); assert.equal(store.user, null)
})
test('退出失败保留账号允许重试；401 清理状态；登出后过期请求不会恢复账号', async () => {
  setActivePinia(createPinia())
  const store = useAccountStore()
  installAccountAdapter(adapter()); await store.load()
  installAccountAdapter(adapter({ logout: async () => { throw new AccountError('network') } }))
  await assert.rejects(store.logout()); assert.equal(store.user?.username, 'test-user')
  let cleared = 0
  installAccountAdapter(adapter({ getMe: async () => { throw new AccountError('expired') }, clearSession: async () => { cleared++ } }))
  await store.load(); assert.equal(store.user, null); assert.equal(cleared, 1)
  let finish!: (value: { username: string }) => void
  installAccountAdapter(adapter({ getMe: () => new Promise(resolve => { finish = resolve }) }))
  const loading = store.load(); await store.logout(); finish({ username: 'stale' }); await loading
  assert.equal(store.user, null)
})

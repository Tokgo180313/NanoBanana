/** 统一认证接入点。生产环境仅在真实协议确认后安装 adapter；默认不发出请求。 */
export interface AccountUser {
  id?: string
  username?: string
  displayName?: string
  nickname?: string
  tenantName?: string
  departmentName?: string
  roles?: string[]
  /** 由适配层按认证中心隐私规则脱敏后返回。 */
  maskedEmail?: string
  maskedPhone?: string
}
export interface PasswordPolicy {
  description: string
  minLength?: number
  maxLength?: number
}
export interface PasswordPayload { oldPassword: string; newPassword: string }
export interface PasswordResult {
  /** 适配层须根据已确认的服务契约明确返回，不能猜测缺省值。 */
  session: 'keep' | 'reauthenticate'
  otherSessionsRevoked?: boolean
}
export type AccountErrorCode = 'forbidden' | 'unavailable' | 'oldPassword' | 'policy' | 'reused' | 'expired' | 'rateLimited' | 'network' | 'server'
export class AccountError extends Error {
  code: AccountErrorCode
  constructor(code: AccountErrorCode) { super(code); this.code = code; this.name = 'AccountError' }
}
export function errorMessage(error: unknown): string {
  const code = error instanceof AccountError ? error.code : 'server'
  return {
    forbidden: '当前账号未获准访问图片工作台，请联系管理员。',
    unavailable: '账号服务暂未接入，请联系管理员。',
    oldPassword: '当前密码不正确，请重新输入',
    policy: '新密码不符合安全要求，请参照密码策略调整',
    reused: '新密码不能与当前或近期使用过的密码相同',
    expired: '登录已过期，请重新登录',
    rateLimited: '操作过于频繁，请稍后再试',
    network: '网络连接异常，请稍后重试',
    server: '操作失败，请稍后重试',
  }[code]
}
export interface AccountAdapter {
  getMe(): Promise<AccountUser>
  getPasswordPolicy(): Promise<PasswordPolicy>
  changePassword(payload: PasswordPayload): Promise<PasswordResult>
  /** 必须完成服务端登出及现有客户端认证状态清理。 */
  logout(): Promise<void | { redirected: true }>
  /** 用于 401 / 全部会话失效；不再次请求需要认证的 logout。 */
  clearSession(): Promise<void>
}
let adapter: AccountAdapter | undefined
export function installAccountAdapter(value: AccountAdapter) { adapter = value }
export function accountAvailable() { return !!adapter }
function requireAdapter() {
  if (!adapter) throw new AccountError('unavailable')
  return adapter
}
export const accountService = {
  getMe: () => requireAdapter().getMe(),
  getPasswordPolicy: () => requireAdapter().getPasswordPolicy(),
  // 白名单组装，禁止确认密码或目标 userId 进入接口。
  changePassword: (payload: PasswordPayload) => requireAdapter().changePassword({ oldPassword: payload.oldPassword, newPassword: payload.newPassword }),
  logout: () => requireAdapter().logout(),
  clearSession: () => requireAdapter().clearSession(),
}
export interface PasswordFields extends PasswordPayload { confirmPassword: string }
export function emptyPasswords(): PasswordFields { return { oldPassword: '', newPassword: '', confirmPassword: '' } }
export function validatePasswords(fields: PasswordFields, policy?: PasswordPolicy) {
  const errors = { oldPassword: '', newPassword: '', confirmPassword: '' }
  if (!fields.oldPassword) errors.oldPassword = '请输入当前密码'
  if (!fields.newPassword) errors.newPassword = '请输入新密码'
  else if (fields.newPassword === fields.oldPassword) errors.newPassword = '新密码不能与当前密码相同'
  else if (policy?.minLength !== undefined && fields.newPassword.length < policy.minLength) errors.newPassword = `新密码至少需要 ${policy.minLength} 位`
  else if (policy?.maxLength !== undefined && fields.newPassword.length > policy.maxLength) errors.newPassword = `新密码不能超过 ${policy.maxLength} 位`
  if (!fields.confirmPassword) errors.confirmPassword = '请再次输入新密码'
  else if (fields.confirmPassword !== fields.newPassword) errors.confirmPassword = '两次输入的新密码不一致'
  return errors
}
export function createPasswordSubmission() {
  let pending = false
  return async (payload: PasswordPayload, change: (payload: PasswordPayload) => Promise<PasswordResult>, applySession: (result: PasswordResult) => Promise<void>) => {
    if (pending) return undefined
    pending = true
    try {
      const result = await change({ oldPassword: payload.oldPassword, newPassword: payload.newPassword })
      if (result.session !== 'keep' && result.session !== 'reauthenticate') throw new AccountError('server')
      await applySession(result)
      return result
    } finally { pending = false }
  }
}

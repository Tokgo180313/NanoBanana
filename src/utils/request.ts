import { iamUser,loadIdentity } from '../account/iam'
import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'

type RequestConfig = AxiosRequestConfig & { silentError?: boolean }

const instance = axios.create({
  // 使用相对路径，让浏览器请求走同域，再由 Vite `server.proxy` 转发到后端，
  // 从而避免跨域问题。
  baseURL: '',
  timeout: 180000,
  withCredentials: true,
})

instance.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    if(!iamUser.value)await loadIdentity()
    config.headers.set('X-CSRF-Token',iamUser.value!.csrfToken)
    return config
  },
  (error) => Promise.reject(error),
)

instance.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError) => {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      return Promise.reject(error)
    }

    if(error.response?.status===403 && (error.response.data as any)?.message==='APPLICATION_ACCESS_DENIED'){iamUser.value=null;window.location.replace('/#/login?access=denied')}
    if(error.response?.status===401){iamUser.value=null;window.location.replace('/#/login')}
    const msg =
      (error.response?.data as any)?.message ||
      error.response?.statusText ||
      error.message ||
      '请求失败'
    if (!(error.config as RequestConfig | undefined)?.silentError) ElMessage.error(msg)
    return Promise.reject(error)
  },
)

export function request<T>(config: RequestConfig): Promise<T> {
  return instance.request<T, T>(config)
}


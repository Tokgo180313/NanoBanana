import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'

const instance = axios.create({
  // 使用相对路径，让浏览器请求走同域，再由 Vite `server.proxy` 转发到后端，
  // 从而避免跨域问题。
  baseURL: '',
  timeout: 60000,
})

instance.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
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

    const msg =
      (error.response?.data as any)?.message ||
      error.response?.statusText ||
      error.message ||
      '请求失败'
    ElMessage.error(msg)
    return Promise.reject(error)
  },
)

export function request<T>(config: AxiosRequestConfig): Promise<T> {
  return instance.request<T, T>(config)
}


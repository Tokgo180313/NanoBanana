import type { AxiosRequestConfig } from 'axios'
import { request } from '../utils/request'

export interface GenerateImageResponse {
  image?: string
  imageUrl?: string
  url?: string
  result?: string
  data?: unknown
}

export async function generateImageApi(
  formData: FormData,
  signal?: AbortSignal,
) {
  const config: AxiosRequestConfig<FormData> = {
    url: '/api/images/generate',
    method: 'post',
    data: formData,
    signal,
  }
  return request<GenerateImageResponse>(config)
}

export interface GenerateImagesByPromptPayload {
  prompt: string
  size: string
  n: number
  extra?: {
    return_url?: boolean
  }
}

export interface GenerateImagesByPromptResponse {
  code: number
  message: string
  request_id?: string
  data?: {
    images?: string[]
    b64_images?: string[]
  }
}

export async function generateImagesByPromptApi(
  payload: GenerateImagesByPromptPayload,
  signal?: AbortSignal,
) {
  const config: AxiosRequestConfig<GenerateImagesByPromptPayload> = {
    url: '/api/images/generate',
    method: 'post',
    data: payload,
    signal,
  }
  return request<GenerateImagesByPromptResponse>(config)
}

export interface FuseImagesPayload {
  /** 多张图片 URL */
  imageUrls?: string[]
  /** 多张图片 Base64（不含 data: 前缀或含均可，需与即梦文档一致） */
  imageBase64List?: string[]
  prompt?: string
  reqKey?: string
  region?: string
  extra?: Record<string, unknown>
}

export interface FuseImagesResponse {
  code: number
  message: string
  request_id?: string
  data?: {
    images?: string[]
    b64_images?: string[]
    [key: string]: unknown
  }
}

export async function fuseImagesApi(
  payload: FuseImagesPayload,
  signal?: AbortSignal,
) {
  const config: AxiosRequestConfig<FuseImagesPayload> = {
    url: '/api/images/fuse',
    method: 'post',
    data: payload,
    signal,
  }
  return request<FuseImagesResponse>(config)
}


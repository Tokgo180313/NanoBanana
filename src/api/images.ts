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

export async function generateImageV2Api(
  formData: FormData,
  signal?: AbortSignal,
) {
  const config: AxiosRequestConfig<FormData> = {
    url: '/api/image/generate2',
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
  task_id?: string
  data?: {
    task_id?: string
    images?: string[]
    b64_images?: string[]
  }
}

export interface GenerateImagesByPromptV2Response {
  model?: string
  created?: number
  data?: Array<{
    url?: string
    size?: string
  }>
  usage?: {
    generated_images?: number
    output_tokens?: number
    total_tokens?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface GenerateImagesByPromptV2Payload {
  model?: string
  prompt?: string
  image?: string | string[]
  sequentialImageGeneration?: 'enabled' | 'disabled'
  responseFormat?: 'url' | 'b64_json'
  size?: string
  stream?: boolean
  watermark?: boolean
  apiKey?: string
  endpoint?: string
  extra?: Record<string, unknown>
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

export async function generateImagesByPromptV2Api(
  payload: GenerateImagesByPromptV2Payload,
  signal?: AbortSignal,
) {
  const config: AxiosRequestConfig<GenerateImagesByPromptV2Payload> = {
    url: '/api/image/generate2',
    method: 'post',
    data: payload,
    signal,
  }
  return request<GenerateImagesByPromptV2Response>(config)
}

export interface FuseImagesPayload {
  imageUrls?: string[]
  imageBase64List?: string[]
  prompt?: string
  size?: string
  width?: number
  height?: number
  reqKey?: string
  region?: string
  extra?: Record<string, unknown>
}

export interface FuseImagesResponse {
  code: number
  message: string
  request_id?: string
  task_id?: string
  data?: {
    task_id?: string
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

export interface ImageTaskResultPayload {
  taskId: string
  reqKey?: string
}

export interface ImageTaskResultResponse {
  code: number
  message: string
  request_id?: string
  data?: {
    images?: string[]
    b64_images?: string[]
    [key: string]: unknown
  }
}

export async function getImageTaskResultApi(
  payload: ImageTaskResultPayload,
  signal?: AbortSignal,
) {
  const config: AxiosRequestConfig<ImageTaskResultPayload> = {
    url: '/api/images/task-result',
    method: 'post',
    data: payload,
    signal,
  }
  return request<ImageTaskResultResponse>(config)
}


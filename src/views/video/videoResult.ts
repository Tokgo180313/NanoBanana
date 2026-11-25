import { ElMessage, ElMessageBox } from 'element-plus'
import type { VideoStatus, VideoTask } from '../../api/videos'

export const statusLabels: Record<VideoStatus, string> = {
  submitting: '提交中',
  submission_unknown: '提交结果待确认',
  queued: '排队中',
  running: '生成中',
  succeeded: '已生成',
  failed: '生成失败',
  cancelled: '已取消',
  expired: '任务已超时',
}
export const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })

export function ratioLabel(task: VideoTask) {
  return task.ratio === 'adaptive' ? '自适应' : task.ratio
}

export function linkExpired(task: VideoTask, now: number) {
  return !!task.expiresAt && Date.parse(task.expiresAt) <= now
}

export function playableUrl(task: VideoTask, now: number) {
  return task.status === 'succeeded' && !linkExpired(task, now) ? task.videoUrl : undefined
}

export function taskSpecs(task: VideoTask) {
  return [task.model, task.duration + ' 秒', task.resolution.toUpperCase(),
    ratioLabel(task), task.sound ? '有声' : '无声'].join(' · ')
}

export async function copyTaskId(id: string) {
  try {
    await navigator.clipboard.writeText(id)
    ElMessage.success('已复制任务 ID')
  } catch {
    void ElMessageBox.alert(id, '请手动复制任务 ID', { confirmButtonText: '关闭' }).catch(() => {})
  }
}


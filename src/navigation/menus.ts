import { hasPermission } from '../account/iam'
import { Picture, VideoCamera, Clock, Connection, Collection } from '@element-plus/icons-vue'

export const routePermissions: Record<string, string> = {
  ImageGeneration: 'image:task:create',
  ImageHistory: 'image:task:list',
  VideoGeneration: 'video:task:create',
  ProviderAdmin: 'model:config:read',
  ModelAdmin: 'model:config:read',
}

export const menus: { label: string; routeName: string; icon: typeof Picture; keywords: string[]; group?: string }[] = [
  { label: '图片生成', routeName: 'ImageGeneration', icon: Picture, keywords: ['image'] },
  { label: '历史记录', routeName: 'ImageHistory', icon: Clock, keywords: ['history', '记录'] },
  { label: '视频生成', routeName: 'VideoGeneration', icon: VideoCamera, keywords: ['video'] },
  { label: '提供商管理', routeName: 'ProviderAdmin', icon: Connection, keywords: ['provider', '模型接入'], group: '模型接入' },
  { label: '模型管理', routeName: 'ModelAdmin', icon: Collection, keywords: ['model', '模型接入'], group: '模型接入' },
]

export function filterMenus(query: string) {
  const keyword = query.trim().toLowerCase()
  return menus.filter(menu=>hasPermission(routePermissions[menu.routeName]||'')).filter((menu) => [menu.label, ...menu.keywords].some((text) => text.toLowerCase().includes(keyword)))
}

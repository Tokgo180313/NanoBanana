export const ai147ModelIds = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'] as const

export function isAi147Model(model: string) {
  return ai147ModelIds.some(value => value === model)
}

export function imageSizesForModel(model: string): string[] {
  if (model === 'gemini-2.5-flash-image') return ['1K']
  if (model === 'gemini-3-pro-image-preview') return ['1K', '2K', '4K']
  return ['2K', '4K']
}

export function normalizeModelSettings<T extends { modelName: string; imageSize: string }>(settings: T): T {
  const sizes = imageSizesForModel(settings.modelName)
  return { ...settings, imageSize: sizes.includes(settings.imageSize) ? settings.imageSize : sizes.includes('2K') ? '2K' : sizes[0]! }
}

import { BadRequestException } from '@nestjs/common';

export type MediaKind = 'image' | 'video' | 'text';

export const protocols = [
  { id: 'linkfox', label: 'Linkfox', kind: 'image' },
  { id: 'ai147', label: '147AI', kind: 'image' },
  { id: 'ark', label: '火山方舟', kind: 'video' },
  { id: 'openai-chat', label: 'OpenAI Chat Completions 兼容', kind: 'text' },
] as const;

export function fields(value: unknown, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('请输入有效配置');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key)))
    throw new BadRequestException('包含不支持修改的字段');
  return result;
}

export function required(value: unknown, max: number, label: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new BadRequestException(`${label}不能为空且最多 ${max} 个字符`);
  return value.trim();
}

export function integer(
  value: unknown,
  min: number,
  max: number,
  label: string,
) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new BadRequestException(`${label}须为 ${min} 至 ${max} 的整数`);
  return value;
}

export function mediaKind(value: unknown): MediaKind {
  if (value !== 'image' && value !== 'video' && value !== 'text')
    throw new BadRequestException('请选择图片、视频或文本');
  return value;
}

export function apiUrl(value: unknown) {
  const raw = required(value, 2048, 'API 地址');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('请输入有效的 HTTPS API 地址');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new BadRequestException(
      'API 地址须使用 HTTPS，且不能包含凭据、查询参数或片段',
    );
  return required(url.href, 2048, 'API 地址');
}

function options(value: unknown, label: string, pattern: RegExp) {
  if (!Array.isArray(value) || !value.length || value.length > 30)
    throw new BadRequestException(`请填写 1 至 30 项${label}`);
  return [
    ...new Set(
      value.map((item) => {
        const text = required(item, 32, label);
        if (!pattern.test(text))
          throw new BadRequestException(`${label}格式无效`);
        return text;
      }),
    ),
  ];
}

export type ImageCapabilities = {
  ratios: string[];
  sizes: string[];
  maxReferenceImages: number;
};
export type VideoCapabilities = {
  ratios: string[];
  resolutions: string[];
  minDuration: number;
  maxDuration: number;
  maxMaterials: number;
};

export function capabilities(
  kind: 'image' | 'video',
  value: unknown,
): ImageCapabilities | VideoCapabilities;
export function capabilities(
  kind: MediaKind,
  value: unknown,
): ImageCapabilities | VideoCapabilities | Record<string, never>;
export function capabilities(
  kind: MediaKind,
  value: unknown,
): ImageCapabilities | VideoCapabilities | Record<string, never> {
  if (kind === 'text') {
    fields(value, []);
    return {};
  }
  const image = kind === 'image';
  const data = fields(
    value,
    image
      ? ['sizes', 'ratios', 'maxReferenceImages']
      : ['resolutions', 'ratios', 'minDuration', 'maxDuration', 'maxMaterials'],
  );
  const ratios = options(
    data.ratios,
    '比例',
    /^(?:[1-9][0-9]*:[1-9][0-9]*|adaptive)$/,
  );
  if (image)
    return {
      ratios,
      sizes: options(
        data.sizes,
        '尺寸',
        /^(?:[1-9][0-9]*K|[1-9][0-9]*x[1-9][0-9]*)$/,
      ),
      maxReferenceImages: integer(
        data.maxReferenceImages,
        0,
        100,
        '参考图上限',
      ),
    };
  const minDuration = integer(data.minDuration, 1, 3600, '最短时长');
  return {
    ratios,
    minDuration,
    resolutions: options(
      data.resolutions,
      '分辨率',
      /^(?:[1-9][0-9]*p|[1-9][0-9]*K|[1-9][0-9]*x[1-9][0-9]*)$/,
    ),
    maxDuration: integer(data.maxDuration, minDuration, 3600, '最长时长'),
    maxMaterials: integer(data.maxMaterials, 0, 100, '素材上限'),
  };
}

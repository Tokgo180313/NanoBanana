import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GenerateImageRequest = {
  prompt?: string;
  reqKey?: string;
  region?: string;
  extra?: Record<string, unknown>;
  size?: string;
  height?: number;
  width?: number;
};

export type GenerateImageByImageRequest = {
  prompt?: string;
  imageUrl?: string;
  imageBase64?: string;
  reqKey?: string;
  region?: string;
  extra?: Record<string, unknown>;
  size?: string;
  height?: number;
  width?: number;
};

/** 多图融合：输入多张图片，输出一张合成图 */
export type FuseImagesRequest = {
  /** 多张图片 URL */
  imageUrls?: string[];
  /** 多张图片 Base64（不含 data: 前缀或含均可，需与即梦文档一致） */
  imageBase64List?: string[];
  prompt?: string;
  reqKey?: string;
  region?: string;
  extra?: Record<string, unknown>;
  size?: string;
  height?: number;
  width?: number;
};

function normalizeImagePayload(payload: any): {
  images: string[];
  b64_images: string[];
  request_id?: string;
} {
  const images: string[] = [];
  const b64_images: string[] = [];

  const pickArrayStrings = (arr: unknown): string[] => {
    return Array.isArray(arr)
      ? arr.filter((x) => typeof x === 'string' && x.trim()) as string[]
      : [];
  };

  const request_id =
    payload?.request_id ??
    payload?.requestId ??
    payload?.ResponseMetadata?.RequestId;

  const data = payload?.data ?? payload;

  // Variant A: data is array of items
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === 'object') {
        if (typeof (item as any).url === 'string') {
          images.push((item as any).url);
        }
        if (typeof (item as any).b64_json === 'string') {
          b64_images.push((item as any).b64_json);
        }
      }
    }
  }

  // Variant B: image_urls / urls array
  const urlListCandidates = [
    pickArrayStrings(data?.image_urls),
    pickArrayStrings(data?.urls),
    pickArrayStrings(payload?.image_urls),
    pickArrayStrings(payload?.urls),
  ];
  const urlList = urlListCandidates.find((x) => x.length > 0) ?? [];
  images.push(...urlList);

  // Variant C: single url
  if (typeof data?.url === 'string') images.push(data.url);
  if (typeof payload?.url === 'string') images.push(payload.url);

  // Variant D: base64
  if (typeof data?.b64_json === 'string') b64_images.push(data.b64_json);
  if (typeof payload?.b64_json === 'string') {
    b64_images.push(payload.b64_json);
  }

  return {
    images: Array.from(new Set(images.filter((x) => typeof x === 'string'))),
    b64_images: Array.from(
      new Set(b64_images.filter((x) => typeof x === 'string')),
    ),
    request_id,
  };
}

function sanitizeBase64Input(v: string): string {
  const trimmed = v.trim();
  // Support both:
  // - raw base64: "AAAA..."
  // - data url: "data:image/png;base64,AAAA..."
  const withoutPrefix = trimmed.replace(/^data:.*?;base64,/i, '');
  // Base64 may include line breaks or spaces depending on copy source (esp. Windows).
  return withoutPrefix.replace(/\s+/g, '');
}

function summarizeFuseInput(input: Record<string, unknown>) {
  const summary: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') {
      if (k.toLowerCase().includes('base64') || k.toLowerCase().includes('binary')) {
        summary[k] = `string(len=${v.length})`;
      } else {
        summary[k] = v.length > 80 ? `string(len=${v.length},truncated)` : v;
      }
    } else if (Array.isArray(v)) {
      summary[k] = `array(len=${v.length})`;
    } else {
      summary[k] = typeof v;
    }
  }
  return summary;
}

@Injectable()
export class JimengService {
  constructor(private readonly configService: ConfigService) {}

  private async callJimengCvProcess(
    input: Record<string, unknown>,
    region?: string,
  ) {
    const accessKeyId = this.configService.get('VOLCSTACK_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get(
      'VOLCSTACK_SECRET_ACCESS_KEY',
    );
    if (!accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        'Missing VOLCSTACK_ACCESS_KEY_ID or VOLCSTACK_SECRET_ACCESS_KEY in environment variables',
      );
    }

    const resolvedRegion =
      region ?? this.configService.get('VOLC_REGION') ?? 'cn-north-1';
    const host =
      this.configService.get('VOLC_VISUAL_HOST') ??
      'visual.volcengineapi.com';

    try {
      // Use dynamic import to avoid Jest parsing ESM dependencies at load time.
      const sdkCore = await import('@volcengine/sdk-core');
      const { Client, Command, buildRequestConfigFromMetaPath } = sdkCore;

      class CvProcessCommand extends Command<
        Record<string, unknown>,
        unknown,
        never
      > {
        constructor(input: Record<string, unknown>) {
          super(input);
          this.requestConfig = buildRequestConfigFromMetaPath(
            '/CVProcess/2022-08-31/cv/post/json/',
          );
        }
      }

      const client = new Client({
        accessKeyId,
        secretAccessKey,
        region: resolvedRegion,
        host,
      });

      const payload = await client.send(new CvProcessCommand(input));

      const normalized = normalizeImagePayload(payload);

      return {
        code: 0,
        message: 'ok',
        request_id: normalized.request_id,
        data: {
          images: normalized.images,
          b64_images: normalized.b64_images,
        },
      };
    } catch (error) {
      console.error(error);
      if (error instanceof BadRequestException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      const err = error as any;
      const status =
        err?.statusCode ??
        err?.status ??
        err?.response?.status ??
        err?.response?.statusCode ??
        err?.$response?.status;

      const looksUnauthorized =
        status === 401 ||
        message.includes('HTTP 401') ||
        message.includes('Unauthorized') ||
        message.includes('401');

      if (looksUnauthorized) {
        const reqKey = typeof input?.req_key === 'string' ? input.req_key : undefined;
        throw new UnauthorizedException({
          code: 401,
          message:
            'Volcengine unauthorized (401). Check req_key permission/AKSK/region/host.',
          request: {
            req_key: reqKey
              ? `${String(reqKey).slice(0, 6)}...${String(reqKey).slice(-4)}`
              : undefined,
            region: resolvedRegion,
            host,
          },
          error: message,
        });
      }

      if (status === 400) {
        const reqKey = typeof input?.req_key === 'string' ? input.req_key : undefined;
        throw new BadRequestException({
          code: 400,
          message:
            'Volcengine bad request (400). Please check req_key ability and request fields for image fusion.',
          request: {
            req_key: reqKey
              ? `${String(reqKey).slice(0, 6)}...${String(reqKey).slice(-4)}`
              : undefined,
            region: resolvedRegion,
            host,
          },
          error: message,
          input_debug: input ? summarizeFuseInput(input) : undefined,
        });
      }

      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException({
        code: 500,
        message: 'Failed to call Volcengine image generation API with AK/SK',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async generateImage(body: GenerateImageRequest) {
    const prompt = body?.prompt?.trim();
    if (!prompt) {
      throw new BadRequestException('`prompt` is required');
    }

    const reqKey = body.reqKey ?? this.configService.get('VOLC_IMAGE_REQ_KEY');
    if (!reqKey) {
      throw new BadRequestException(
        '`reqKey` is required (or set VOLC_IMAGE_REQ_KEY)',
      );
    }

    return this.callJimengCvProcess(
      {
        req_key: reqKey,
        prompt,
        size: body.size,
        height: body.height,
        width: body.width,
        ...(body.extra ?? {}),
      },
      body.region,
    );
  }

  // 图生图：基于输入图片生成新图片
  async generateImageByImage(body: GenerateImageByImageRequest) {
    const reqKey =
      body.reqKey ?? this.configService.get('VOLC_IMAGE2IMAGE_REQ_KEY');
    if (!reqKey) {
      throw new BadRequestException(
        '`reqKey` is required (or set VOLC_IMAGE2IMAGE_REQ_KEY)',
      );
    }

    const imageUrl = body.imageUrl?.trim();
    const imageBase64 = body.imageBase64 ? sanitizeBase64Input(body.imageBase64) : undefined;
    if (!imageUrl && !imageBase64) {
      throw new BadRequestException(
        '`imageUrl` or `imageBase64` is required',
      );
    }

    const prompt = body.prompt?.trim();
    const baseInput: Record<string, unknown> = {
      req_key: reqKey,
      ...(prompt ? { prompt } : {}),
      size: body.size,
      height: body.height,
      width: body.width,
      ...(body.extra ?? {}),
    };

    // 兼容不同图生图模型字段命名，默认写入常见字段
    if (imageUrl) {
      baseInput.image_url = imageUrl;
      baseInput.image_urls = [imageUrl];
    }
    if (imageBase64) {
      baseInput.image_base64 = imageBase64;
      baseInput.image = imageBase64;
    }

    return this.callJimengCvProcess(baseInput, body.region);
  }

  /**
   * 图片融合：多张输入 → 单张输出（具体 req_key 以即梦控制台文档为准）
   */
  async fuseImages(body: FuseImagesRequest) {
    const reqKey =
      body.reqKey ?? this.configService.get('VOLC_IMAGE_FUSION_REQ_KEY');
    if (!reqKey) {
      throw new BadRequestException(
        '`reqKey` is required (or set VOLC_IMAGE_FUSION_REQ_KEY)',
      );
    }
    const text2imageReqKey = this.configService.get('VOLC_IMAGE_REQ_KEY');
    const trimmedReqKey = typeof reqKey === 'string' ? reqKey.trim() : String(reqKey);
    const trimmedText2ImageReqKey =
      typeof text2imageReqKey === 'string'
        ? text2imageReqKey.trim()
        : text2imageReqKey;
    if (
      trimmedText2ImageReqKey &&
      typeof trimmedText2ImageReqKey === 'string' &&
      trimmedReqKey === trimmedText2ImageReqKey
    ) {
      throw new BadRequestException(
        'Fusion requires a dedicated req_key. Current req_key equals VOLC_IMAGE_REQ_KEY (text2image). Please configure VOLC_IMAGE_FUSION_REQ_KEY.',
      );
    }

    const urls = (body.imageUrls ?? [])
      .map((u) => (typeof u === 'string' ? u.trim() : ''))
      .filter(Boolean);
    const b64s = (body.imageBase64List ?? [])
      .map((b) => (typeof b === 'string' ? sanitizeBase64Input(b) : ''))
      .filter(Boolean);

    const total = urls.length + b64s.length;
    if (total < 2) {
      throw new BadRequestException(
        'At least 2 images are required: use `imageUrls` and/or `imageBase64List`',
      );
    }

    if (urls.length > 0 && b64s.length > 0) {
      throw new BadRequestException(
        'Please use only one input type for fusion: `imageUrls` OR `imageBase64List`.',
      );
    }

    const prompt = body.prompt?.trim();
    const baseInput: Record<string, unknown> = {
      req_key: reqKey,
      ...(prompt ? { prompt } : {}),
      ...(body.extra ?? {}),
    };

    // For fusion, `size` might be interpreted by the backend as another numeric field.
    // If user provides `size` in `WxH` form (e.g. `910x4096`), convert it to width/height integers.
    let width: number | undefined = body.width;
    let height: number | undefined = body.height;
    if (typeof body.size === 'string') {
      const m = body.size.match(/^(\d+)\s*x\s*(\d+)$/i);
      if (m) {
        width = Number(m[1]);
        height = Number(m[2]);
      }
    }

    // Only pass optional fields when they are valid numbers.
    if (Number.isFinite(width)) baseInput.width = width;
    if (Number.isFinite(height)) baseInput.height = height;

    // Important: keep input fields minimal to avoid "Error when parsing request".
    // If user already provided a field via `extra`, do not override it.
    if (urls.length > 0) {
      if (!('image_urls' in baseInput)) baseInput.image_urls = urls;
    }
    if (b64s.length > 0) {
      if (!('image_base64_list' in baseInput)) {
        baseInput.image_base64_list = b64s;
      }
    }

    return this.callJimengCvProcess(baseInput, body.region);
  }
}


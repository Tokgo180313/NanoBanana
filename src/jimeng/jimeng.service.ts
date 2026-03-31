import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
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

export type QueryTaskResultRequest = {
  taskId?: string;
  reqKey?: string;
  region?: string;
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
    pickArrayStrings(data?.video_urls),
    pickArrayStrings(payload?.image_urls),
    pickArrayStrings(payload?.urls),
    pickArrayStrings(payload?.video_urls),
  ];
  const urlList = urlListCandidates.find((x) => x.length > 0) ?? [];
  images.push(...urlList);

  // Variant C: single url
  if (typeof data?.url === 'string') images.push(data.url);
  if (typeof payload?.url === 'string') images.push(payload.url);
  if (typeof data?.image_url === 'string') images.push(data.image_url);
  if (typeof payload?.image_url === 'string') images.push(payload.image_url);
  if (typeof data?.result_url === 'string') images.push(data.result_url);
  if (typeof payload?.result_url === 'string') images.push(payload.result_url);
  if (typeof data?.video_url === 'string') images.push(data.video_url);
  if (typeof payload?.video_url === 'string') images.push(payload.video_url);

  // Variant C.2: nested result structures (common in visual APIs)
  const resultData = data?.Result ?? data?.result ?? payload?.Result ?? payload?.result;
  const respData = data?.resp_data ?? payload?.resp_data;
  if (typeof resultData?.url === 'string') images.push(resultData.url);
  if (typeof resultData?.image_url === 'string') images.push(resultData.image_url);
  if (typeof resultData?.result_url === 'string') images.push(resultData.result_url);
  const nestedUrlArrays = [
    pickArrayStrings(resultData?.image_urls),
    pickArrayStrings(resultData?.urls),
    pickArrayStrings(resultData?.result_urls),
    pickArrayStrings(respData?.image_urls),
    pickArrayStrings(respData?.urls),
    pickArrayStrings(respData?.video_urls),
  ];
  const nestedUrls = nestedUrlArrays.find((x) => x.length > 0) ?? [];
  images.push(...nestedUrls);
  if (typeof respData?.url === 'string') images.push(respData.url);
  if (typeof respData?.image_url === 'string') images.push(respData.image_url);
  if (typeof respData?.video_url === 'string') images.push(respData.video_url);

  // Variant D: base64
  if (typeof data?.b64_json === 'string') b64_images.push(data.b64_json);
  if (typeof payload?.b64_json === 'string') {
    b64_images.push(payload.b64_json);
  }
  if (typeof data?.image_base64 === 'string') b64_images.push(data.image_base64);
  if (typeof payload?.image_base64 === 'string') b64_images.push(payload.image_base64);
  if (typeof data?.binary_data_base64 === 'string') b64_images.push(data.binary_data_base64);
  if (typeof payload?.binary_data_base64 === 'string') b64_images.push(payload.binary_data_base64);
  if (typeof resultData?.b64_json === 'string') b64_images.push(resultData.b64_json);
  if (typeof resultData?.image_base64 === 'string') b64_images.push(resultData.image_base64);
  if (typeof resultData?.binary_data_base64 === 'string') {
    b64_images.push(resultData.binary_data_base64);
  }
  if (typeof respData?.b64_json === 'string') b64_images.push(respData.b64_json);
  if (typeof respData?.image_base64 === 'string') b64_images.push(respData.image_base64);
  if (typeof respData?.binary_data_base64 === 'string') {
    b64_images.push(respData.binary_data_base64);
  }
  const nestedB64Arrays = [
    pickArrayStrings(data?.image_base64_list),
    pickArrayStrings(data?.binary_data_base64),
    pickArrayStrings(payload?.image_base64_list),
    pickArrayStrings(payload?.binary_data_base64),
    pickArrayStrings(resultData?.image_base64_list),
    pickArrayStrings(resultData?.binary_data_base64),
    pickArrayStrings(respData?.image_base64_list),
    pickArrayStrings(respData?.binary_data_base64),
  ];
  const nestedB64 = nestedB64Arrays.find((x) => x.length > 0) ?? [];
  b64_images.push(...nestedB64);

  return {
    images: Array.from(
      new Set(
        images
          .filter((x) => typeof x === 'string')
          .map((x) => x.trim())
          .filter((x) => x.length > 0),
      ),
    ),
    b64_images: Array.from(
      new Set(
        b64_images
          .filter((x) => typeof x === 'string')
          .map((x) => x.trim())
          .filter((x) => x.length > 0),
      ),
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
  private readonly logger = new Logger(JimengService.name);
  constructor(private readonly configService: ConfigService) {}

  private getBase64ByteSize(base64: string): number {
    const clean = sanitizeBase64Input(base64);
    const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
    return Math.floor((clean.length * 3) / 4) - padding;
  }

  private formatBytesToMb(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

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
            '/CVSync2AsyncSubmitTask/2022-08-31/cv/post/json/',
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
      const payloadAny: any = payload;

      const normalized = normalizeImagePayload(payload);

      return {
        code: 0,
        message: 'ok',
        request_id: normalized.request_id,
        data: {
          taskId: payloadAny?.data?.task_id,
          images: normalized.images,
          b64_images: normalized.b64_images,
        },
        raw: normalized.images.length === 0 && normalized.b64_images.length === 0
          ? {
              // keep small, avoid returning huge payloads
              response_keys:
                payloadAny && typeof payloadAny === 'object'
                  ? Object.keys(payloadAny).slice(0, 30)
                  : [],
              data_keys:
                payloadAny?.data && typeof payloadAny.data === 'object'
                  ? Object.keys(payloadAny.data).slice(0, 30)
                  : [],
              result_keys:
                (payloadAny?.data?.result && typeof payloadAny.data.result === 'object'
                  ? Object.keys(payloadAny.data.result).slice(0, 30)
                  : payloadAny?.result && typeof payloadAny.result === 'object'
                    ? Object.keys(payloadAny.result).slice(0, 30)
                    : []),
            }
          : undefined,
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
        const rawData =
          err?.response?.data ??
          err?.response?.data?.error ??
          err?.response?.data?.message ??
          err?.$response?.data;
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
          raw: rawData,
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

  async queryTaskResult(body: QueryTaskResultRequest) {
    const taskId = body.taskId?.trim();
    if (!taskId) {
      throw new BadRequestException('`taskId` is required');
    }

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
      body.region ?? this.configService.get('VOLC_REGION') ?? 'cn-north-1';
    const host =
      this.configService.get('VOLC_VISUAL_HOST') ??
      'visual.volcengineapi.com';
    const reqKey = body.reqKey?.trim();

    try {
      const sdkCore = await import('@volcengine/sdk-core');
      const { Client, Command, buildRequestConfigFromMetaPath } = sdkCore;

      class CvSync2AsyncGetResultCommand extends Command<
        Record<string, unknown>,
        unknown,
        never
      > {
        constructor(input: Record<string, unknown>) {
          super(input);
          this.requestConfig = buildRequestConfigFromMetaPath(
            '/CVSync2AsyncGetResult/2022-08-31/cv/post/json/',
          );
        }
      }

      class CvGetResultCommand extends Command<
        Record<string, unknown>,
        unknown,
        never
      > {
        constructor(input: Record<string, unknown>) {
          super(input);
          this.requestConfig = buildRequestConfigFromMetaPath(
            '/CVGetResult/2022-08-31/cv/post/json/',
          );
        }
      }

      const client = new Client({
        accessKeyId,
        secretAccessKey,
        region: resolvedRegion,
        host,
      });

      const candidateReqKeys = [
        reqKey,
        this.configService.get('VOLC_IMAGE_FUSION_REQ_KEY'),
        this.configService.get('VOLC_IMAGE2IMAGE_REQ_KEY'),
        this.configService.get('VOLC_IMAGE_REQ_KEY'),
      ]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim());

      const tryInputs: Array<{
        command: 'CVSync2AsyncGetResult' | 'CVGetResult';
        input: Record<string, unknown>;
      }> = [
        { command: 'CVSync2AsyncGetResult', input: { task_id: taskId } },
        ...candidateReqKeys.map((k) => ({
          command: 'CVSync2AsyncGetResult' as const,
          input: { task_id: taskId, req_key: k ,req_json:JSON.stringify({return_url: true})},
        })),
        ...candidateReqKeys.map((k) => ({
          command: 'CVGetResult' as const,
          input: { task_id: taskId, req_key: k ,req_json:JSON.stringify({return_url: true})},
        })),
      ];

      let payload: unknown;
      let notFoundPayload: unknown;
      let lastError: any;
      for (const attempt of tryInputs) {
        try {
          const currentPayload =
            attempt.command === 'CVSync2AsyncGetResult'
              ? await client.send(new CvSync2AsyncGetResultCommand(attempt.input))
              : await client.send(new CvGetResultCommand(attempt.input));
          const p: any = currentPayload as any;
          const status = String(p?.data?.status ?? p?.status ?? '').toLowerCase();
          if (status === 'not_found') {
            notFoundPayload = currentPayload;
            continue;
          }
          payload = currentPayload;
          lastError = undefined;
          break;
        } catch (e) {
          lastError = e;
        }
      }

      if (!payload && notFoundPayload) {
        payload = notFoundPayload;
      }

      if (!payload && lastError) {
        throw lastError;
      }

      const payloadAny: any = payload;
      const normalized = normalizeImagePayload(payloadAny);

      return {
        code: 0,
        message: 'ok',
        request_id: normalized.request_id,
        data: {
          taskId,
          status: payloadAny?.data?.status ?? payloadAny?.status,
          images: normalized.images,
          b64_images: normalized.b64_images,
        },
        raw:
          normalized.images.length === 0 && normalized.b64_images.length === 0
            ? {
                response_keys:
                  payloadAny && typeof payloadAny === 'object'
                    ? Object.keys(payloadAny).slice(0, 30)
                    : [],
                data_keys:
                  payloadAny?.data && typeof payloadAny.data === 'object'
                    ? Object.keys(payloadAny.data).slice(0, 30)
                    : [],
              }
            : undefined,
      };
    } catch (error) {
      const err = error as any;
      const status =
        err?.statusCode ??
        err?.status ??
        err?.response?.status ??
        err?.response?.statusCode ??
        err?.$response?.status;
      const message = error instanceof Error ? error.message : String(error);

      if (status === 400) {
        throw new BadRequestException({
          code: 400,
          message:
            'Volcengine task-result bad request (400). Please check taskId (and ensure it comes from submit response).',
          request: {
            taskId,
            region: resolvedRegion,
            host,
            reqKeyPassed: Boolean(reqKey),
          },
          error: message,
          raw:
            err?.response?.data ??
            err?.response?.data?.error ??
            err?.response?.data?.message ??
            err?.$response?.data,
        });
      }

      throw new InternalServerErrorException({
        code: 500,
        message: 'Failed to query async task result from Volcengine',
        error: message,
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
        return_url: true,
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
      return_url: true,
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
      const sizeBytes = this.getBase64ByteSize(imageBase64);
      this.logger.log(
        `generateImageByImage input base64 size: ${this.formatBytesToMb(sizeBytes)}`,
      );
      baseInput.image_base64 = imageBase64;
      baseInput.image = imageBase64;
    }
    if (imageUrl) {
      this.logger.log(
        `generateImageByImage input url length: ${imageUrl.length} chars`,
      );
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

    if (urls.length > 0) {
      this.logger.log(
        `fuseImages input urls: count=${urls.length}, lengths=[${urls
          .map((u) => u.length)
          .join(',')}]`,
      );
    }
    if (b64s.length > 0) {
      const sizesMb = b64s.map((b64) =>
        this.formatBytesToMb(this.getBase64ByteSize(b64)),
      );
      this.logger.log(
        `fuseImages input base64 images: count=${b64s.length}, sizes(MB)=[${sizesMb.join(', ')}]`,
      );
    }

    const total = urls.length + b64s.length;
    if (total < 1) {
      throw new BadRequestException(
        'At least 1 image is required: use `imageUrls` and/or `imageBase64List`',
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
      return_url: true,
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


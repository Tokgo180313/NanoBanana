import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type LinkfoxGenerateRequest = {
  imageList?: string[];
  prompt?: string;
  provider?: string;
  outputNum?: number;
  resolution?: string;
  apiKey?: string;
  endpoint?: string;
  aspectRatio?: string;
};

export type LinkfoxGetImageRequest = {
  id?: string;
  apiKey?: string;
  endpoint?: string;
};

export type LinkfoxUploadByBase64Request = {
  fileName?: string;
  base64?: string;
  apiKey?: string;
  endpoint?: string;
};

@Injectable()
export class LinkfoxService {
  private readonly logger = new Logger(LinkfoxService.name);
  constructor(private readonly configService: ConfigService) {}

  getStatus() {
    return {
      name: 'linkfox',
      status: 'ok',
      timestamp: Date.now(),
    };
  }

  async generate(body: LinkfoxGenerateRequest) {
    const imageList = (body.imageList ?? [])
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((v) => v.length > 0);
    if (imageList.length === 0) {
      throw new BadRequestException('`imageList` is required');
    }

    const prompt = body.prompt?.trim();
    if (!prompt) {
      throw new BadRequestException('`prompt` is required');
    }

    const apiKey =
      body.apiKey?.trim() ?? this.configService.get<string>('LINKFOX_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'Missing LINKFOX_API_KEY in environment variables',
      );
    }

    const endpoint =
      body.endpoint?.trim() ??
      this.configService.get<string>('LINKFOX_IMAGE_ENDPOINT');
    if (!endpoint) {
      throw new InternalServerErrorException(
        'Missing LINKFOX_IMAGE_ENDPOINT in environment variables',
      );
    }

    const payload: Record<string, unknown> = {
      imageList,
      prompt,
      provider: body.provider ?? 'BANANA_2',
      outputNum: body.outputNum ?? 1,
      resolution: body.resolution ?? '4K',
      aspectRatio: body.aspectRatio ?? '1:1',
    };

    let response: Response;
    console.log(endpoint, apiKey);
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(
        `linkfox generate fetch failed: endpoint=${endpoint}, message=${message}`,
        stack,
      );
      throw error;
    }
    const rawText = await response.text();
    console.log(rawText);
    let parsed: unknown = rawText;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      // Keep non-JSON raw text for debug.
    }

    if (!response.ok) {
      const upstreamMessage =
        typeof (parsed as any)?.msg === 'string'
          ? (parsed as any).msg
          : typeof (parsed as any)?.message === 'string'
            ? (parsed as any).message
            : `Linkfox request failed with status ${response.status}`;

      if (response.status === 401) {
        throw new UnauthorizedException({
          code: 401,
          message: 'Linkfox unauthorized (401). Check LINKFOX_API_KEY.',
          error: upstreamMessage,
          raw: parsed,
        });
      }

      throw new BadRequestException({
        code: response.status,
        message: upstreamMessage,
        raw: parsed,
      });
    }

    return parsed;
  }

  async getImage(body: LinkfoxGetImageRequest) {
    const id = body.id?.trim();
    if (!id) {
      throw new BadRequestException('`id` is required');
    }

    const apiKey =
      body.apiKey?.trim() ?? this.configService.get<string>('LINKFOX_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'Missing LINKFOX_API_KEY in environment variables',
      );
    }

    const endpoint =
      body.endpoint?.trim() ??
      this.configService.get<string>('LINKFOX_IMAGE_INFO_ENDPOINT') ??
      'https://sbappstoreapi.ziniao.com/openapi-router/linkfox-ai/image/v2/make/info';

    const payload: Record<string, unknown> = { id };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `linkfox getImage fetch failed: endpoint=${endpoint}, message=${message}`,
        stack,
      );
      throw error;
    }

    const rawText = await response.text();
    let parsed: unknown = rawText;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      // Keep non-JSON raw text for debug.
    }

    if (!response.ok) {
      const upstreamMessage =
        typeof (parsed as any)?.msg === 'string'
          ? (parsed as any).msg
          : typeof (parsed as any)?.sub_msg === 'string'
            ? (parsed as any).sub_msg
            : typeof (parsed as any)?.message === 'string'
              ? (parsed as any).message
              : `Linkfox request failed with status ${response.status}`;

      if (response.status === 401) {
        throw new UnauthorizedException({
          code: 401,
          message: 'Linkfox unauthorized (401). Check LINKFOX_API_KEY.',
          error: upstreamMessage,
          raw: parsed,
        });
      }

      throw new BadRequestException({
        code: response.status,
        message: upstreamMessage,
        raw: parsed,
      });
    }

    return parsed;
  }

  async uploadByBase64(body: LinkfoxUploadByBase64Request) {
    const fileName = body.fileName?.trim();
    if (!fileName) {
      throw new BadRequestException('`fileName` is required');
    }
    const base64 = body.base64?.trim();
    if (!base64) {
      throw new BadRequestException('`base64` is required');
    }

    const apiKey =
      body.apiKey?.trim() ?? this.configService.get<string>('LINKFOX_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'Missing LINKFOX_API_KEY in environment variables',
      );
    }

    const endpoint =
      body.endpoint?.trim() ??
      this.configService.get<string>('LINKFOX_IMAGE_UPLOAD_ENDPOINT') ??
      'https://sbappstoreapi.ziniao.com/openapi-router/linkfox-ai/image/v2/uploadByBase64';

    const payload: Record<string, unknown> = {
      fileName,
      base64,
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `linkfox uploadByBase64 fetch failed: endpoint=${endpoint}, message=${message}`,
        stack,
      );
      throw error;
    }
    console.log(response);
    const rawText = await response.text();
    let parsed: unknown = rawText;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      // Keep non-JSON raw text for debug.
    }

    if (!response.ok) {
      const upstreamMessage =
        typeof (parsed as any)?.msg === 'string'
          ? (parsed as any).msg
          : typeof (parsed as any)?.sub_msg === 'string'
            ? (parsed as any).sub_msg
            : typeof (parsed as any)?.message === 'string'
              ? (parsed as any).message
              : `Linkfox request failed with status ${response.status}`;

      if (response.status === 401) {
        throw new UnauthorizedException({
          code: 401,
          message: 'Linkfox unauthorized (401). Check LINKFOX_API_KEY.',
          error: upstreamMessage,
          raw: parsed,
        });
      }

      throw new BadRequestException({
        code: response.status,
        message: upstreamMessage,
        raw: parsed,
      });
    }

    return parsed;
  }
}

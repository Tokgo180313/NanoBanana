import {
  imageConnection,
  type ProviderConnection,
} from '../model-admin/generation-models.service';
import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import sharp from 'sharp';
import { readPrivateImage } from '../iam/private-image';

export interface Ai147GenerateRequest {
  model?: string;
  prompt?: string;
  imageList?: string[];
  aspectRatio?: string;
  resolution?: string;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

@Injectable()
export class Ai147Service {
  private async reference(source: unknown) {
    if (typeof source !== 'string' || !source.startsWith('data:image/'))
      throw new BadRequestException('AI147_REFERENCE_DATA_URL_REQUIRED');
    const bytes = await readPrivateImage(source, []);
    let format: string | undefined;
    try {
      const image = sharp(bytes, { limitInputPixels: 80000000 });
      format = (await image.metadata()).format;
      if (!['png', 'jpeg', 'webp'].includes(format || '')) throw new Error();
      await image.stats();
    } catch {
      throw new BadRequestException('AI147_INVALID_REFERENCE_IMAGE');
    }
    return {
      inlineData: {
        mimeType: `image/${format}`,
        data: bytes.toString('base64'),
      },
    };
  }

  private async responseBody(response: Response): Promise<unknown> {
    if (!response.body) throw new BadGatewayException('AI147_INVALID_RESPONSE');
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32 * 1024 * 1024) {
          await reader.cancel();
          throw new BadGatewayException('AI147_RESPONSE_TOO_LARGE');
        }
        chunks.push(Buffer.from(value));
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('AI147_INVALID_RESPONSE');
    } finally {
      reader.releaseLock();
    }
  }

  async generate(
    body: Ai147GenerateRequest & { [imageConnection]?: ProviderConnection },
    signal?: AbortSignal,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('AI147_INVALID_REQUEST');
    if (['apiKey', 'endpoint', 'baseUrl'].some((key) => key in body))
      throw new BadRequestException('PROVIDER_CREDENTIAL_OVERRIDE_FORBIDDEN');
    const { model } = body;
    const connection = body[imageConnection];
    if (!connection)
      throw new ServiceUnavailableException('MODEL_PROVIDER_UNAVAILABLE');
    if (
      typeof model !== 'string' ||
      !/^[A-Za-z0-9_.-]+$/.test(model) ||
      model === '.' ||
      model === '..'
    )
      throw new BadRequestException('AI147_UNSUPPORTED_MODEL');
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 20000)
      throw new BadRequestException('AI147_PROMPT_REQUIRED_OR_TOO_LONG');
    const aspectRatio = body.aspectRatio;
    const flash = model === 'gemini-2.5-flash-image';
    const resolution = body.resolution;
    const images = body.imageList ?? [];
    if (!Array.isArray(images))
      throw new BadRequestException('AI147_INVALID_REQUEST');
    const { apiKey: key, apiUrl } = connection;
    const endpoint = new URL(
      '/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      apiUrl,
    ).href;
    const parts = [
      ...(await Promise.all(images.map((source) => this.reference(source)))),
      { text: prompt },
    ];
    const payload = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio,
          ...(!flash ? { imageSize: resolution } : {}),
        },
      },
    };
    const timeout = AbortSignal.timeout(600000);
    let result: unknown;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        // Match this platform's documented Authorization header (server-only key).
        headers: { 'Content-Type': 'application/json', Authorization: key },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) {
        await response.body?.cancel();
        // Never relay upstream bodies, signed requests, prompts, or credentials.
        throw new BadGatewayException(`AI147_UPSTREAM_HTTP_${response.status}`);
      }
      result = await this.responseBody(response);
    } catch (error) {
      if (timeout.aborted)
        throw new GatewayTimeoutException('AI147_GENERATION_TIMEOUT');
      if (signal?.aborted)
        throw new BadGatewayException('AI147_REQUEST_CANCELLED');
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('AI147_REQUEST_FAILED');
    }
    const root = record(result);
    if (record(root.promptFeedback).blockReason)
      throw new BadGatewayException('AI147_IMAGE_BLOCKED');
    const candidates = Array.isArray(root.candidates) ? root.candidates : [];
    // Ignore intermediate thought images. Return only a final image from a
    // successfully completed candidate; the gateway persists it in private OSS.
    for (const candidateValue of candidates) {
      const candidate = record(candidateValue);
      if (candidate.finishReason && candidate.finishReason !== 'STOP') continue;
      const parts = record(candidate.content).parts;
      if (!Array.isArray(parts)) continue;
      for (const value of parts) {
        const part = record(value);
        if (part.thought === true) continue;
        const inline = record(part.inlineData ?? part.inline_data);
        const mime = inline.mimeType ?? inline.mime_type;
        const data = inline.data;
        if (typeof data !== 'string' || typeof mime !== 'string') continue;
        if (
          !['image/png', 'image/jpeg', 'image/webp'].includes(mime) ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(data) ||
          data.length > Math.ceil((20 * 1024 * 1024) / 3) * 4
        )
          throw new BadGatewayException('AI147_INVALID_IMAGE_RESPONSE');
        return { model, data: [{ url: `data:${mime};base64,${data}` }] };
      }
    }
    throw new BadGatewayException('AI147_NO_FINAL_IMAGE');
  }
}

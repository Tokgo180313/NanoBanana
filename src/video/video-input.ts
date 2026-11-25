import { rejectProviderOverrides } from '../model-admin/generation-models.service';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { Request } from 'express';
import type { Readable } from 'node:stream';

export const MAX_UPLOAD_BYTES = 47_000_000;
export const MAX_IMAGE_BYTES = 29_999_999;
const MAX_AUDIO_BYTES = 15_000_000;
type Upload = { buffer: Buffer };
export type VideoFiles = Partial<
  Record<'images' | 'audio' | 'firstFrame' | 'lastFrame', Upload[]>
>;
type ImageRole = 'reference_image' | 'first_frame' | 'last_frame';
type VideoContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string }; role: ImageRole }
  | { type: 'audio_url'; audio_url: { url: string }; role: 'reference_audio' };

const receivedBytes = Symbol('videoUploadBytes');
type UploadRequest = Request & { [receivedBytes]?: number };

// Limit the entire upload as files arrive, including requests with no Content-Length.
export const videoUploadStorage = {
  _handleFile(
    request: UploadRequest,
    file: { stream: Readable },
    done: (error: unknown, upload?: Upload) => void,
  ) {
    const chunks: Buffer[] = [];
    let tooLarge = false;
    file.stream.on('data', (chunk: Buffer) => {
      request[receivedBytes] = (request[receivedBytes] ?? 0) + chunk.length;
      if (request[receivedBytes] > MAX_UPLOAD_BYTES) {
        tooLarge = true;
        chunks.length = 0;
      } else {
        chunks.push(chunk);
      }
    });
    file.stream.once('end', () => {
      if (tooLarge)
        done(new PayloadTooLargeException('素材总大小不能超过 47 MB。'));
      else done(null, { buffer: Buffer.concat(chunks) });
    });
  },
  _removeFile(_request: Request, file: Partial<Upload>, done: () => void) {
    delete file.buffer;
    done();
  },
};

function imageFormat(buffer: Buffer) {
  const prefix = buffer.subarray(0, 12).toString('latin1');
  if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'jpeg';
  if (prefix.startsWith('\x89PNG\r\n\x1a\n')) return 'png';
  if (prefix.startsWith('RIFF') && prefix.endsWith('WEBP')) return 'webp';
  if (prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a')) return 'gif';
  if (prefix.startsWith('BM')) return 'bmp';
  if (prefix.startsWith('II*\0') || prefix.startsWith('MM\0*')) return 'tiff';
  if (prefix.slice(4, 8) === 'ftyp') {
    if (['heic', 'heix', 'hevc', 'hevx'].includes(prefix.slice(8)))
      return 'heic';
    if (
      ['mif1', 'msf1'].includes(prefix.slice(8)) &&
      /heic|heix|hevc|hevx/.test(buffer.subarray(16, 64).toString('latin1'))
    )
      return 'heif';
  }
  throw new BadRequestException('请上传方舟支持的图片格式。');
}

function audioFormat(buffer: Buffer) {
  const prefix = buffer.subarray(0, 12).toString('latin1');
  if (prefix.startsWith('RIFF') && prefix.endsWith('WAVE')) return 'wav';
  if (
    prefix.startsWith('ID3') ||
    (buffer[0] === 255 &&
      buffer[1] !== undefined &&
      (buffer[1] & 0xe0) === 0xe0 &&
      (buffer[1] & 0x06) === 0x02)
  )
    return 'mp3';
  throw new BadRequestException('参考音频仅支持 WAV 或 MP3。');
}

function imageContent({ buffer }: Upload, role: ImageRole): VideoContent {
  return {
    type: 'image_url',
    role,
    image_url: {
      url: `data:image/${imageFormat(buffer)};base64,${buffer.toString('base64')}`,
    },
  };
}

function audioContent({ buffer }: Upload): VideoContent {
  return {
    type: 'audio_url',
    role: 'reference_audio',
    audio_url: {
      url: `data:audio/${audioFormat(buffer)};base64,${buffer.toString('base64')}`,
    },
  };
}

export function parseVideoInput(
  body: Record<string, unknown> = {},
  files: VideoFiles = {},
) {
  rejectProviderOverrides(body);
  const { images = [], audio = [], firstFrame = [], lastFrame = [] } = files;
  const duration =
    typeof body.duration === 'string' && /^\d+$/.test(body.duration)
      ? Number(body.duration)
      : 0;
  const resolution =
    typeof body.resolution === 'string' &&
    /^(?:[1-9][0-9]*p|[1-9][0-9]*K|[1-9][0-9]*x[1-9][0-9]*)$/.test(
      body.resolution,
    )
      ? body.resolution
      : undefined;
  const ratio =
    typeof body.ratio === 'string' &&
    /^(?:[1-9][0-9]*:[1-9][0-9]*|adaptive)$/.test(body.ratio)
      ? body.ratio
      : undefined;
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const sound = body.sound;
  if (
    duration < 1 ||
    duration > 3600 ||
    !resolution ||
    !ratio ||
    (sound !== 'true' && sound !== 'false') ||
    (body.prompt !== undefined && typeof body.prompt !== 'string') ||
    prompt.length > 4000
  ) {
    throw new BadRequestException('请检查视频时长、分辨率、比例、声音和描述。');
  }
  if (
    images.length > 9 ||
    audio.length > 3 ||
    firstFrame.length > 1 ||
    lastFrame.length > 1 ||
    (lastFrame.length && !firstFrame.length) ||
    (firstFrame.length && (images.length || audio.length))
  ) {
    throw new BadRequestException(
      '请检查素材数量，尾帧需要搭配首帧，首尾帧不能与参考素材混用。',
    );
  }
  if (!prompt && !images.length && !audio.length && !firstFrame.length) {
    throw new BadRequestException('请输入视频描述或添加素材。');
  }

  const allFiles = [...images, ...audio, ...firstFrame, ...lastFrame];
  if (
    allFiles.reduce((sum, item) => sum + item.buffer.length, 0) >
      MAX_UPLOAD_BYTES ||
    [...images, ...firstFrame, ...lastFrame].some(
      (item) => item.buffer.length > MAX_IMAGE_BYTES,
    ) ||
    audio.some((item) => item.buffer.length > MAX_AUDIO_BYTES)
  ) {
    throw new PayloadTooLargeException(
      '素材总大小不能超过 47 MB，单张图片须小于 30 MB，单段音频不能超过 15 MB。',
    );
  }

  const content: VideoContent[] = [];
  if (prompt) content.push({ type: 'text', text: prompt });
  for (const file of images)
    content.push(imageContent(file, 'reference_image'));
  for (const file of audio) content.push(audioContent(file));
  for (const file of firstFrame)
    content.push(imageContent(file, 'first_frame'));
  for (const file of lastFrame) content.push(imageContent(file, 'last_frame'));

  return {
    modelId: body.modelId,
    prompt,
    duration,
    resolution,
    ratio: firstFrame.length ? 'adaptive' : ratio,
    generate_audio: sound === 'true',
    content,
  };
}

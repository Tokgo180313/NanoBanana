import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { readPrivateImage } from './private-image';
import { OssImageStore } from './oss-image-store';

export interface StoredImage {
  storageProvider: 'local' | 'oss';
  storageKey: string;
  storageUrl: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  contentHash: string;
}
/** Callers use authenticated application URLs for both storage providers. */
export interface ImageStorageAdapter {
  save(
    tenant: number,
    taskId: string,
    assetId: string,
    source: string,
  ): Promise<StoredImage>;
  read(image: StoredImage): Promise<Buffer>;
  delete(image: StoredImage): Promise<void>;
}

@Injectable()
export class ImageStorage implements ImageStorageAdapter, OnModuleInit {
  private ossStore?: OssImageStore;
  constructor(private readonly config: ConfigService) {}
  onModuleInit() {
    // Reject incomplete OSS configuration before serving requests.
    if (this.provider() === 'oss') this.oss();
  }
  private provider(
    value = this.config.get<string>('NB_IMAGE_STORAGE', 'local'),
  ) {
    if (value !== 'local' && value !== 'oss')
      throw new ServiceUnavailableException('IMAGE_STORAGE_NOT_CONFIGURED');
    return value;
  }
  private oss() {
    return (this.ossStore ??= new OssImageStore(this.config));
  }
  private path(key: string) {
    const root = resolve(this.config.get('NB_IMAGE_ROOT', './data/images'));
    const path = resolve(root, key);
    if (!key || path === root || !path.startsWith(root + sep))
      throw new BadRequestException('INVALID_STORAGE_KEY');
    return path;
  }
  async save(
    tenant: number,
    taskId: string,
    assetId: string,
    source: string,
  ): Promise<StoredImage> {
    const storageProvider = this.provider();
    const oss = storageProvider === 'oss' ? this.oss() : undefined;
    const hosts = this.config
      .get<string>('NB_IMAGE_HOST_ALLOWLIST', '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    const bytes = await readPrivateImage(source, hosts);
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(bytes, { limitInputPixels: 80000000 }).metadata();
      if (!['png', 'jpeg', 'webp', 'gif'].includes(metadata.format || ''))
        throw new Error();
      // Decode the complete file as well as its header before persisting it.
      await sharp(bytes, { limitInputPixels: 80000000 }).stats();
    } catch {
      throw new BadRequestException('INVALID_IMAGE_BYTES');
    }
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const safe = (v: string) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(v))
        throw new BadRequestException('INVALID_STORAGE_ID');
      return v;
    };
    const relativeKey = `${safe(String(tenant))}/${safe(taskId)}/${safe(assetId)}-${contentHash}.${metadata.format}`;
    const storageKey = oss ? `${oss.prefix}/${relativeKey}` : relativeKey;
    const mimeType = 'image/' + metadata.format;
    if (oss) {
      await oss.put(storageKey, bytes, mimeType, contentHash);
    } else {
      const path = this.path(storageKey);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const temp = path + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
        await rename(temp, path);
      } finally {
        await unlink(temp).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== 'ENOENT') throw e;
        });
      }
    }
    return {
      storageProvider,
      storageKey,
      storageUrl: `/api/workbench/assets/${assetId}/preview`,
      mimeType,
      size: bytes.length,
      width: metadata.width || 0,
      height: metadata.height || 0,
      contentHash,
    };
  }
  async read(image: StoredImage) {
    const provider = this.provider(image.storageProvider);
    try {
      const bytes =
        provider === 'oss'
          ? await this.oss().read(image.storageKey)
          : await readFile(this.path(image.storageKey));
      if (
        createHash('sha256').update(bytes).digest('hex') !== image.contentHash
      )
        throw new Error('IMAGE_CHECKSUM_MISMATCH');
      return bytes;
    } catch {
      throw new ServiceUnavailableException('IMAGE_FILE_UNAVAILABLE');
    }
  }
  async delete(image: StoredImage) {
    if (this.provider(image.storageProvider) === 'oss') {
      await this.oss().delete(image.storageKey);
      return;
    }
    await unlink(this.path(image.storageKey)).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code !== 'ENOENT') throw e;
      },
    );
  }
}

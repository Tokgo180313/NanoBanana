import { ConfigService } from '@nestjs/config';
import Credential from '@alicloud/credentials';
import OSS from 'ali-oss';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ImageStorage } from './image-storage.service';

jest.mock('ali-oss');
jest.mock('@alicloud/credentials', () => ({
  __esModule: true,
  default: jest.fn(),
  Config: jest.fn((value: Record<string, unknown>) => value),
}));

describe('private image storage', () => {
  let config: ConfigService, storage: ImageStorage, root: string;
  let originalEnv: NodeJS.ProcessEnv;
  let bytes: Buffer, source: string;
  const put = jest.fn(),
    get = jest.fn(),
    remove = jest.fn();
  const getCredential = jest.fn();

  beforeAll(async () => {
    bytes = await sharp({
      create: { width: 2, height: 3, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    source = 'data:image/png;base64,' + bytes.toString('base64');
  });
  beforeEach(async () => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    put
      .mockReset()
      .mockResolvedValue({ url: 'https://unused/signed?token=secret' });
    get.mockReset().mockResolvedValue({ content: bytes });
    remove.mockReset().mockResolvedValue({});
    getCredential.mockReset().mockResolvedValue({
      accessKeyId: 'test-id',
      accessKeySecret: 'test-secret',
      securityToken: 'test-sts',
    });
    jest
      .mocked(Credential)
      .mockImplementation(() => ({ getCredential }) as unknown as Credential);
    jest
      .mocked(OSS)
      .mockImplementation(
        () => ({ put, get, delete: remove }) as unknown as OSS,
      );
    root = await mkdtemp(join(tmpdir(), 'nb-oss-unit-'));
    config = new ConfigService({
      NB_IMAGE_STORAGE: 'oss',
      NB_IMAGE_ROOT: root,
      NB_OSS_BUCKET: 'test-bucket',
      NB_OSS_REGION: 'cn-hangzhou',
      NB_OSS_AUTH_MODE: 'access_key',
      ALIBABA_CLOUD_ACCESS_KEY_ID: 'test-id',
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'test-secret',
    });
    config.skipProcessEnv = true;
    storage = new ImageStorage(config);
  });
  afterEach(async () => {
    process.env = originalEnv;
    await rm(root, { recursive: true, force: true });
  });

  it('uploads validated bytes privately and keeps an authenticated preview URL', async () => {
    const image = await storage.save(1, 'task', 'asset', source);
    const hash = createHash('sha256').update(bytes).digest('hex');
    expect(image).toEqual({
      storageProvider: 'oss',
      storageKey: `nanobanana/images/1/task/asset-${hash}.png`,
      storageUrl: '/api/workbench/assets/asset/preview',
      mimeType: 'image/png',
      size: bytes.length,
      width: 2,
      height: 3,
      contentHash: hash,
    });
    expect(put).toHaveBeenCalledWith(image.storageKey, bytes, {
      mime: 'image/png',
      headers: {
        'x-oss-object-acl': 'private',
        'x-oss-meta-sha256': hash,
        'Content-MD5': createHash('md5').update(bytes).digest('base64'),
      },
    });
    expect(OSS).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'test-bucket',
        region: 'oss-cn-hangzhou',
        authorizationV4: true,
        secure: true,
        stsToken: 'test-sts',
      }),
    );
    await expect(storage.read(image)).resolves.toEqual(bytes);
    await storage.delete(image);
    expect(remove).toHaveBeenCalledWith(image.storageKey);
  });

  it('routes historical local and OSS records by provider across configuration changes', async () => {
    config.set('NB_IMAGE_STORAGE', 'local');
    const local = await storage.save(1, 'task', 'old', source);
    config.set('NB_IMAGE_STORAGE', 'oss');
    const remote = await storage.save(1, 'task', 'new', source);
    await expect(storage.read(local)).resolves.toEqual(bytes);
    await storage.delete(local);
    expect(remove).not.toHaveBeenCalled();
    await expect(storage.read(local)).rejects.toThrow('IMAGE_FILE_UNAVAILABLE');
    config.set('NB_IMAGE_STORAGE', 'local');
    await expect(storage.read(remote)).resolves.toEqual(bytes);
    await storage.delete(remote);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('re-resolves provider credentials for each operation', async () => {
    config.set('NB_OSS_AUTH_MODE', 'default');
    const image = await storage.save(1, 'task', 'asset', source);
    getCredential.mockResolvedValueOnce({
      accessKeyId: 'rotated-id',
      accessKeySecret: 'rotated-secret',
      securityToken: 'rotated-sts',
    });
    await storage.read(image);
    expect(Credential).toHaveBeenCalledWith();
    expect(OSS).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accessKeyId: 'rotated-id',
        stsToken: 'rotated-sts',
      }),
    );
  });

  it('does not publish metadata or fall back to local storage when upload fails', async () => {
    put.mockRejectedValueOnce(new Error('sensitive credential or endpoint'));
    await expect(storage.save(1, 'task', 'asset', source)).rejects.toThrow(
      'OSS_IMAGE_WRITE_FAILED',
    );
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects corrupt or missing remote objects', async () => {
    const image = await storage.save(1, 'task', 'asset', source);
    get.mockResolvedValueOnce({ content: Buffer.from('corrupt') });
    await expect(storage.read(image)).rejects.toThrow('IMAGE_FILE_UNAVAILABLE');
    get.mockRejectedValueOnce(new Error('NoSuchKey'));
    await expect(storage.read(image)).rejects.toThrow('IMAGE_FILE_UNAVAILABLE');
  });

  it('retains local checksum and traversal protection', async () => {
    config.set('NB_IMAGE_STORAGE', 'local');
    const image = await storage.save(1, 'task', 'asset', source);
    await writeFile(join(root, image.storageKey), 'corrupt');
    await expect(storage.read(image)).rejects.toThrow('IMAGE_FILE_UNAVAILABLE');
    await expect(
      storage.read({ ...image, storageKey: '../outside' }),
    ).rejects.toThrow();
  });

  it('rejects invalid source bytes and identifiers before uploading', async () => {
    await expect(
      storage.save(1, 'task', 'asset', 'data:image/png;base64,YmFk'),
    ).rejects.toThrow('INVALID_IMAGE_BYTES');
    await expect(storage.save(1, '../task', 'asset', source)).rejects.toThrow(
      'INVALID_STORAGE_ID',
    );
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects remote key traversal before calling OSS', async () => {
    const image = await storage.save(1, 'task', 'asset', source);
    await expect(
      storage.read({ ...image, storageKey: '../outside' }),
    ).rejects.toThrow();
    await expect(
      storage.delete({ ...image, storageKey: '../outside' }),
    ).rejects.toThrow('INVALID_OSS_STORAGE_KEY');
    expect(get).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    ['NB_OSS_BUCKET', '', 'NB_OSS_BUCKET_REQUIRED_OR_INVALID'],
    ['NB_OSS_REGION', '', 'NB_OSS_REGION_REQUIRED_OR_INVALID'],
    [
      'NB_OSS_ENDPOINT',
      'http://oss-cn-hangzhou.aliyuncs.com',
      'NB_OSS_ENDPOINT_INVALID',
    ],
    ['NB_OSS_ENDPOINT', 'https://attacker.example', 'NB_OSS_ENDPOINT_INVALID'],
    ['NB_OSS_PREFIX', '../outside', 'INVALID_OSS_STORAGE_KEY'],
    ['NB_OSS_AUTH_MODE', 'other', 'NB_OSS_AUTH_MODE_INVALID'],
    ['ALIBABA_CLOUD_ACCESS_KEY_SECRET', '', 'OSS_CREDENTIALS_REQUIRED'],
    ['NB_IMAGE_STORAGE', 'other', 'IMAGE_STORAGE_NOT_CONFIGURED'],
  ])('rejects invalid %s at initialization', (key, value, error) => {
    config.set(key, value);
    expect(() => storage.onModuleInit()).toThrow(error);
    expect(put).not.toHaveBeenCalled();
  });

  it('supports an HTTPS internal endpoint and normalized custom prefix', async () => {
    config.set(
      'NB_OSS_ENDPOINT',
      'https://oss-cn-hangzhou-internal.aliyuncs.com',
    );
    config.set('NB_OSS_REGION', 'oss-cn-hangzhou');
    config.set('NB_OSS_PREFIX', '/custom/images/');
    const image = await storage.save(1, 'task', 'asset', source);
    expect(image.storageKey).toMatch(/^custom\/images\//);
    expect(OSS).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://oss-cn-hangzhou-internal.aliyuncs.com',
      }),
    );
  });

  it('redacts credential and deletion errors', async () => {
    getCredential.mockRejectedValueOnce(
      new Error('sensitive credential details'),
    );
    await expect(storage.save(1, 'task', 'asset', source)).rejects.toThrow(
      'OSS_IMAGE_WRITE_FAILED',
    );
    const image = await storage.save(1, 'task', 'asset', source);
    remove.mockRejectedValueOnce(new Error('sensitive credential details'));
    await expect(storage.delete(image)).rejects.toThrow(
      'OSS_IMAGE_DELETE_FAILED',
    );
  });
});

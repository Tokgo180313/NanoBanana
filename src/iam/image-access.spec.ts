import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ImageAccess } from './image-access.service';
import { ImageGateway } from './image-gateway.interceptor';
import { IamClient } from './iam-client.service';
import { IamAuth } from './iam-auth.service';
import { of } from 'rxjs';
import { readPrivateImage } from './private-image';
const ctx: any = {
  tenant: 1,
  user: 3,
  token: 'test-only',
  subject: 'member',
  permissions: ['image:task:create'],
  csrf: 'csrf',
};
describe('IAM business access boundaries', () => {
  let db: any, iam: any, auth: any, storage: any, access: ImageAccess;
  beforeEach(() => {
    db = {
      insertOne: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn(),
      collection: jest.fn().mockReturnThis(),
    };
    iam = {
      require: jest.fn().mockResolvedValue({ allowed: true }),
      register: jest.fn().mockResolvedValue({ id: 1 }),
      batch: jest.fn(),
    };
    auth = { seal: jest.fn((v) => v), open: jest.fn((v) => v) };
    storage = { save: jest.fn(), read: jest.fn() };
    access = new ImageAccess(db, iam, storage);
  });
  it('binds task tenant and owner to verified context, ignores browser IDs', async () => {
    await access.begin(ctx, 'ark', {
      prompt: 'test',
      tenant_id: 99,
      owner_user_id: 999,
    });
    expect(db.insertOne.mock.calls[0][0]).toMatchObject({
      tenant_id: 1,
      owner_user_id: 3,
    });
    expect(iam.require).toHaveBeenCalledWith(ctx, 'IMAGE_TASK', null, 'create');
  });
  it('does not run a provider when task lookup fails', async () => {
    const gateway = new ImageGateway(access, {} as never);
    const next = { handle: jest.fn(() => of({})) };
    await expect(
      gateway.run(
        {
          path: '/api/images/task-result',
          body: { taskId: 'guessed-upstream-id' },
          iam: ctx,
        },
        next,
      ),
    ).rejects.toThrow();
    expect(next.handle).not.toHaveBeenCalled();
    expect(db.findOne.mock.calls[0][0]).toEqual({
      tenant_id: 1,
      id: 'guessed-upstream-id',
    });
  });
  it('uses an authorized Linkfox upload only with the same provider version', async () => {
    db.findOne
      .mockResolvedValueOnce({ task_id: 'upload' })
      .mockResolvedValueOnce({
        provider_id: 'provider',
        provider_version: 3,
        upload_asset_id: 'ref',
        upload_source: 'https://example.test/ref.png',
      })
      .mockResolvedValueOnce({ task_id: 'upload' })
      .mockResolvedValueOnce({
        provider_id: 'provider',
        provider_version: 4,
        upload_asset_id: 'ref',
      });
    const input = { imageList: ['/api/workbench/assets/ref/preview'] };
    const route = { providerId: 'provider', providerVersion: 3 };
    await expect(access.prepareInput(ctx, input, '', route)).resolves.toEqual({
      imageList: ['https://example.test/ref.png'],
    });
    await expect(access.prepareInput(ctx, input, '', route)).rejects.toThrow(
      'MODEL_PARAMETERS_CHANGED',
    );
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('cannot smuggle a second upstream identifier into polling', async () => {
    db.findOne.mockResolvedValue({
      provider: 'linkfox',
      upstream_id: 'owned-upstream',
    });
    jest.spyOn(access, 'finish').mockResolvedValue({});
    const gateway = new ImageGateway(access, {} as never),
      req: any = {
        path: '/api/linkfox/getImage',
        body: { id: 'owned-local', taskId: 'foreign-upstream' },
        iam: ctx,
      };
    const next = {
      handle: jest.fn(() => {
        expect(req.body.id).toBe('owned-upstream');
        expect(req.body.taskId).toBeUndefined();
        return of({});
      }),
    };
    await gateway.run(req, next);
    expect(db.findOne.mock.calls[0][0]).toEqual({
      tenant_id: 1,
      id: 'owned-local',
    });
  });
  it.each(['/api/image/generate2', '/api/ai147/generate'])(
    'does not run %s while IAM is unavailable',
    async (path) => {
      iam.require.mockRejectedValue(new ServiceUnavailableException());
      const gateway = new ImageGateway(access, {} as never),
        next = { handle: jest.fn(() => of({})) };
      await expect(
        gateway.run({ path, body: { prompt: 'test' }, iam: ctx }, next),
      ).rejects.toThrow();
      expect(next.handle).not.toHaveBeenCalled();
    },
  );
  it('does not lose URL results when an empty base64 list is present', async () => {
    jest
      .spyOn(access, 'storeAsset')
      .mockResolvedValue('/api/workbench/assets/test/preview');
    expect(
      await access.normalize(ctx, 'task', {
        images: ['https://allowed.test/a.png'],
        b64_images: [],
        raw: { url: 'https://secret.test/a' },
      }),
    ).toEqual({ images: ['/api/workbench/assets/test/preview'] });
  });
  it('maps base64 output into a protected URL field', async () => {
    jest
      .spyOn(access, 'storeAsset')
      .mockResolvedValue('/api/workbench/assets/test/preview');
    expect(
      await access.normalize(ctx, 'task', { binary_data_base64: ['AAAA'] }),
    ).toEqual({ image_urls: ['/api/workbench/assets/test/preview'] });
  });
  it('persists Gemini native results through the shared authenticated asset path', async () => {
    jest
      .spyOn(access, 'storeAsset')
      .mockResolvedValue('/api/workbench/assets/gemini/preview');
    const result = await access.normalize(ctx, 'task', {
      model: 'gemini-3-pro-image-preview',
      data: [{ url: 'data:image/jpeg;base64,AAAA' }],
    });
    expect(access.storeAsset).toHaveBeenCalledWith(
      ctx,
      'task',
      'data:image/jpeg;base64,AAAA',
    );
    expect(result).toEqual({
      model: 'gemini-3-pro-image-preview',
      data: [{ url: '/api/workbench/assets/gemini/preview' }],
    });
  });
  it('rejects client endpoint and API-key overrides', async () => {
    await expect(
      access.prepareInput(ctx, { endpoint: 'http://localhost/private' }),
    ).rejects.toThrow();
    await expect(
      access.prepareInput(ctx, { extra: { apiKey: 'fake' } }),
    ).rejects.toThrow();
  });
  it('denied object permission stops preview before reading content', async () => {
    db.findOne.mockResolvedValue({ id: 'asset', source_cipher: 'private' });
    iam.require.mockRejectedValue(new ForbiddenException());
    await expect(access.bytes(ctx, 'asset', 'download')).rejects.toThrow();
    expect(storage.read).not.toHaveBeenCalled();
  });
  it('checks tenant predicates before delete', async () => {
    db.findOne.mockResolvedValue(undefined);
    await expect(access.remove(ctx, 'foreign-asset')).rejects.toThrow();
    expect(db.findOne.mock.calls[0][0]).toMatchObject({
      tenant_id: 1,
      id: 'foreign-asset',
    });
    expect(db.updateOne).not.toHaveBeenCalled();
  });
  it('requires an active task-list capability before enumerating assets', async () => {
    await expect(access.list(ctx, 'assets', {})).rejects.toThrow();
    expect(db.find).not.toHaveBeenCalled();
  });
  it('keeps legacy provider errors from exposing raw output', async () => {
    const gateway = new ImageGateway(access, {} as never),
      next = {
        handle: jest.fn(() => {
          throw new Error('private URL or credential');
        }),
      };
    await expect(
      gateway.run(
        { path: '/api/image/generate2', body: { prompt: 'test' }, iam: ctx },
        next,
      ),
    ).rejects.toThrow('图片服务请求失败');
  });
});
describe('private content proxy', () => {
  it('rejects non-allowlisted hosts without fetching them', async () => {
    await expect(
      readPrivateImage('https://example.test/a.png', []),
    ).rejects.toThrow('IMAGE_HOST_NOT_ALLOWED');
  });
  it('rejects HTTP and embedded credentials', async () => {
    await expect(
      readPrivateImage('http://localhost/a.png', ['localhost']),
    ).rejects.toThrow();
    await expect(
      readPrivateImage('https://user:password@example.test/a.png', [
        'example.test',
      ]),
    ).rejects.toThrow();
  });
  it('rejects private DNS addresses even if allowlisted', async () => {
    await expect(
      readPrivateImage('https://localhost/a.png', ['localhost']),
    ).rejects.toThrow('PRIVATE_IMAGE_HOST_REJECTED');
  });
  it('rejects SVG data payloads', async () => {
    await expect(
      readPrivateImage('data:image/svg+xml;base64,AAAA', []),
    ).rejects.toThrow('UNSUPPORTED_IMAGE');
  });
});
describe('encrypted session payloads', () => {
  it('uses authenticated encryption and rejects modified ciphertext', () => {
    const service = new IamAuth(
      new ConfigService({
        IAM_SESSION_KEY: Buffer.alloc(32, 7).toString('base64'),
      }),
      {} as any,
      {} as any,
    );
    const sealed = service.seal('private-token');
    expect(service.open(sealed)).toBe('private-token');
    const bytes = Buffer.from(sealed, 'base64');
    bytes[15] ^= 1;
    expect(() => service.open(bytes.toString('base64'))).toThrow();
  });
});
describe('IAM outage handling', () => {
  it('does not silently allow network failure', async () => {
    const original = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    try {
      await expect(
        new IamClient(new ConfigService()).require(
          ctx,
          'IMAGE_ASSET',
          'asset',
          'delete',
        ),
      ).rejects.toThrow('IAM_UNAVAILABLE');
    } finally {
      global.fetch = original;
    }
  });
});

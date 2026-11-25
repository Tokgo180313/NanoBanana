import { ServiceUnavailableException } from '@nestjs/common';
import type { GenerationModels } from '../model-admin/generation-models.service';
import { ConfigService } from '@nestjs/config';
import type { IamContext } from '../iam/iam-client.service';
import type { IamDb } from '../iam/iam-db.service';
import { parseVideoInput, type VideoFiles } from './video-input';
import { VideoService } from './video.service';

const owner: IamContext = {
  token: '',
  tenant: 1,
  user: 2,
  subject: 'owner',
  csrf: '',
  sessionHash: '',
  permissions: ['video:task:create'],
};
const form = {
  prompt: '面料细节',
  resolution: '720p',
  duration: '5',
  ratio: '16:9',
  sound: 'true',
};
const image = {
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO/0AAAAASUVORK5CYII=',
    'base64',
  ),
};
const audio = { buffer: Buffer.from('RIFF1234WAVE') };
const videoUrl =
  'https://example.tos-cn-beijing.volces.com/result.mp4?signature=test';

function fixture(key = 'test-key') {
  type Row = Record<string, unknown>;
  const rows: Row[] = [];
  function matches(row: Row, filter: Row) {
    return Object.entries(filter).every(([name, value]) =>
      name === 'upstream_updated_at' && typeof value === 'object'
        ? row[name] === undefined
        : row[name] === value,
    );
  }
  const collection = {
    insertOne: jest.fn(async (row: Row) => {
      rows.push({ ...row });
    }),
    findOne: jest.fn(
      async (filter: Row) => rows.find((row) => matches(row, filter)) ?? null,
    ),
    updateOne: jest.fn(async (filter: Row, update: { $set: Row }) => {
      const row = rows.find((row) => matches(row, filter));
      if (row) Object.assign(row, update.$set);
      return { matchedCount: row ? 1 : 0 };
    }),
    find: jest.fn((filter: Row) => ({
      sort: () => ({
        skip: (skip: number) => ({
          limit: (limit: number) => ({
            toArray: async () =>
              rows
                .filter((row) => matches(row, filter))
                .slice(skip, skip + limit),
          }),
        }),
      }),
    })),
  };
  const db = { collection: () => collection } as unknown as IamDb;
  const connection = {
    apiKey: key,
    apiUrl:
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
  };
  const models = {
    resolve: jest.fn(async () => {
      if (!key.trim())
        throw new ServiceUnavailableException('MODEL_PROVIDER_KEY_UNAVAILABLE');
      return {
        id: 'model-db',
        name: 'Seedance DB',
        protocol: 'ark',
        providerId: 'provider-db',
        providerVersion: 7,
        upstreamModelId: 'db-upstream-model',
        connection,
        capabilities: {
          resolutions: ['720p'],
          ratios: ['16:9', 'adaptive'],
          minDuration: 5,
          maxDuration: 15,
          maxMaterials: 12,
        },
      };
    }),
    connection: jest.fn().mockResolvedValue(connection),
  };
  return {
    models,
    service: new VideoService(
      db,
      new ConfigService(),
      models as unknown as GenerationModels,
    ),
    rows,
  };
}

describe('Seedance video tasks', () => {
  let fetchArk: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchArk = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    { files: {}, roles: [], duration: '5', ratio: '16:9' },
    {
      files: { images: [image], audio: [audio] },
      roles: ['reference_image', 'reference_audio'],
      duration: '15',
      ratio: '16:9',
    },
    {
      files: { firstFrame: [image] },
      roles: ['first_frame'],
      duration: '5',
      ratio: 'adaptive',
    },
    {
      files: { firstFrame: [image], lastFrame: [image] },
      roles: ['first_frame', 'last_frame'],
      duration: '5',
      ratio: 'adaptive',
    },
  ])(
    'sends the correct Ark payload for $roles',
    async ({ files, roles, duration, ratio }) => {
      const { service, rows } = fixture();
      fetchArk.mockResolvedValueOnce(Response.json({ id: 'ark-1' }));
      const task = await service.create(
        owner,
        parseVideoInput({ ...form, duration }, files as VideoFiles),
      );
      const [, request] = fetchArk.mock.calls[0];
      const payload = JSON.parse(String(request?.body));
      expect(request?.headers).toMatchObject({
        Authorization: 'Bearer test-key',
      });
      expect(payload).toMatchObject({
        model: 'db-upstream-model',
        duration: Number(duration),
        ratio,
        resolution: '720p',
        generate_audio: true,
      });
      expect(payload.content[0]).toEqual({ type: 'text', text: form.prompt });
      expect(payload.content.slice(1).map((item) => item.role)).toEqual(roles);
      for (const item of payload.content.slice(1)) {
        expect(item.image_url?.url ?? item.audio_url?.url).toMatch(
          /^data:(image\/png|audio\/wav);base64,/,
        );
      }
      expect(task.status).toBe('queued');
      expect(rows[0]).not.toHaveProperty('content');
    },
  );

  it.each(['4', '16'])(
    'rejects duration %s from model capabilities',
    async (duration) => {
      const { service, rows } = fixture();
      await expect(
        service.create(owner, parseVideoInput({ ...form, duration })),
      ).rejects.toThrow('MODEL_PARAMETERS_CHANGED');
      expect(fetchArk).not.toHaveBeenCalled();
      expect(rows).toHaveLength(0);
    },
  );

  it('rejects a fractional duration', () => {
    expect(() => parseVideoInput({ ...form, duration: '5.5' })).toThrow(
      '请检查视频时长',
    );
  });

  it('queries a submitted task using its saved connection version', async () => {
    const { service, models, rows } = fixture();
    fetchArk
      .mockResolvedValueOnce(Response.json({ id: 'ark-1' }))
      .mockResolvedValueOnce(Response.json({ id: 'ark-1', status: 'running' }));
    const task = await service.create(owner, parseVideoInput(form));
    expect(models.resolve).toHaveBeenCalledWith('video', undefined, {
      protocol: 'ark',
      model: '',
    });
    expect(rows[0]).toMatchObject({
      model_id: 'model-db',
      provider_version: 7,
    });
    expect(JSON.stringify(rows)).not.toContain('test-key');
    await service.detail(owner, task.id);
    expect(models.connection).toHaveBeenCalledWith('provider-db', 7, 'ark');
  });

  it('rejects tail-only input, invalid media, and oversized audio', () => {
    expect(() => parseVideoInput(form, { lastFrame: [image] })).toThrow(
      '尾帧需要搭配首帧',
    );
    expect(() => parseVideoInput(form, { images: [audio] })).toThrow(
      '图片格式',
    );
    expect(() =>
      parseVideoInput(form, { audio: [{ buffer: Buffer.alloc(15_000_001) }] }),
    ).toThrow('素材总大小');
  });

  it('reports missing API configuration without creating a task', async () => {
    const { service, rows } = fixture(' ');
    await expect(service.create(owner, parseVideoInput(form))).rejects.toThrow(
      'MODEL_PROVIDER_KEY_UNAVAILABLE',
    );
    expect(rows).toHaveLength(0);
    expect(fetchArk).not.toHaveBeenCalled();
  });

  it('preserves an uncertain submission without automatically re-submitting', async () => {
    const { service } = fixture();
    fetchArk.mockRejectedValueOnce(new Error('connection interrupted'));
    const task = await service.create(owner, parseVideoInput(form));
    expect(task.status).toBe('submission_unknown');
    await expect(service.detail(owner, task.id)).resolves.toMatchObject({
      status: 'submission_unknown',
    });
    expect(fetchArk).toHaveBeenCalledTimes(1);
  });

  it('preserves pending status on temporary failure and records a definitive Ark failure', async () => {
    const { service } = fixture();
    fetchArk
      .mockResolvedValueOnce(Response.json({ id: 'ark-1' }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          id: 'ark-1',
          status: 'failed',
          error: { code: 'InvalidParameter' },
        }),
      );
    const task = await service.create(owner, parseVideoInput(form));
    await expect(service.detail(owner, task.id)).rejects.toThrow(
      '暂时无法查询',
    );
    await expect(service.list(owner, 1)).resolves.toMatchObject({
      items: [{ status: 'queued' }],
    });
    await expect(service.detail(owner, task.id)).resolves.toMatchObject({
      status: 'failed',
      error: expect.stringContaining('InvalidParameter'),
    });
  });

  it('returns a playable result, then hides an expired URL and blocks download', async () => {
    const { service, rows } = fixture();
    const finished = Math.floor(Date.now() / 1000) - 60;
    fetchArk
      .mockResolvedValueOnce(Response.json({ id: 'ark-1' }))
      .mockResolvedValueOnce(
        Response.json({
          id: 'ark-1',
          status: 'succeeded',
          updated_at: finished,
          content: { video_url: videoUrl },
        }),
      )
      .mockResolvedValueOnce(
        new Response('video', { headers: { 'Content-Type': 'video/mp4' } }),
      );
    const task = await service.create(owner, parseVideoInput(form));
    const result = await service.detail(owner, task.id);
    expect(result).toMatchObject({ status: 'succeeded', videoUrl });
    expect(result.expiresAt?.getTime()).toBe((finished + 86_400) * 1000);
    await expect(
      service.download(owner, task.id, new AbortController().signal),
    ).resolves.toBeDefined();
    rows[0].video_expires_at = new Date(Date.now() - 1);
    expect((await service.detail(owner, task.id)).videoUrl).toBeUndefined();
    await expect(
      service.download(owner, task.id, new AbortController().signal),
    ).rejects.toThrow('已过期');
  });

  it('isolates tasks by owner, tenant, and permission before contacting Ark', async () => {
    const { service } = fixture();
    fetchArk.mockResolvedValueOnce(Response.json({ id: 'ark-1' }));
    const task = await service.create(owner, parseVideoInput(form));
    for (const visitor of [
      { ...owner, user: 3 },
      { ...owner, tenant: 2 },
    ]) {
      await expect(service.list(visitor, 1)).resolves.toEqual({
        items: [],
        hasMore: false,
      });
      await expect(service.detail(visitor, task.id)).rejects.toThrow(
        '视频任务不存在',
      );
      await expect(
        service.download(visitor, task.id, new AbortController().signal),
      ).rejects.toThrow('视频任务不存在');
    }
    await expect(
      service.list({ ...owner, permissions: [] }, 1),
    ).rejects.toThrow('没有视频生成权限');
    expect(fetchArk).toHaveBeenCalledTimes(1);
  });
});

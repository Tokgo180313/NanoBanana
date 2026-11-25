import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import {
  GenerationModels,
  generationProviderUrl,
} from '../model-admin/generation-models.service';
import { PromptOptimizer } from './prompt-optimizer.service';

describe('DeepSeek prompt optimization', () => {
  const resolve = jest.fn();
  const service = new PromptOptimizer({
    resolve,
  } as unknown as GenerationModels);
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    resolve
      .mockReset()
      .mockResolvedValueOnce({ capabilities: { ratios: ['16:9'] } })
      .mockResolvedValueOnce({
        upstreamModelId: 'deepseek-flash',
        connection: { apiUrl: 'https://api.deepseek.com', apiKey: 'test-key' },
      });
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['image', '构图'],
    ['video', '运镜'],
  ] as const)(
    'uses the %s template and forwards the original draft',
    async (kind, detail) => {
      fetchMock.mockResolvedValue(
        Response.json({
          choices: [
            { finish_reason: 'stop', message: { content: '保留品牌 ACME' } },
          ],
        }),
      );

      await expect(
        service.optimize(kind, 'target', '保留品牌 ACME', 4000),
      ).resolves.toEqual({ optimizedPrompt: '保留品牌 ACME' });
      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.deepseek.com/chat/completions');
      expect(request?.redirect).toBe('error');
      const body = JSON.parse(String(request?.body));
      expect(body.thinking).toEqual({ type: 'disabled' });
      expect(body.messages[0].content).toContain(detail);
      expect(body.messages[0].content).toContain('16:9');
      expect(body.messages[1].content).toBe('保留品牌 ACME');
    },
  );

  it.each([
    [402, 503],
    [429, 429],
    [401, 502],
  ])('maps upstream status %i to %i', async (upstream, status) => {
    fetchMock.mockResolvedValue(
      new Response('private upstream body', { status: upstream }),
    );
    await expect(
      service.optimize('image', 'target', 'draft', 4000),
    ).rejects.toMatchObject({ status });
  });

  it.each([
    ['length', 'partial'],
    ['stop', ''],
    ['stop', 'too long'],
  ])('rejects unusable output', async (finish_reason, content) => {
    fetchMock.mockResolvedValue(
      Response.json({
        choices: [{ finish_reason, message: { content } }],
      }),
    );
    await expect(
      service.optimize('video', 'target', 'draft', 5),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('maps an aborted upstream request to a timeout', async () => {
    const controller = new AbortController();
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw controller.signal.reason;
    });
    await expect(
      service.optimize('video', 'target', 'draft', 4000),
    ).rejects.toMatchObject({ status: 504 });
  });

  it('rejects an unavailable creation model before calling DeepSeek', async () => {
    const unavailable = new ConflictException('MODEL_UNAVAILABLE');
    resolve.mockReset().mockRejectedValueOnce(unavailable);
    await expect(
      service.optimize('image', 'target', 'draft', 4000),
    ).rejects.toBe(unavailable);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a default text model before calling DeepSeek', async () => {
    resolve
      .mockReset()
      .mockResolvedValueOnce({ capabilities: {} })
      .mockRejectedValueOnce(
        new ServiceUnavailableException('DEFAULT_TEXT_MODEL_MISSING'),
      );
    await expect(
      service.optimize('image', 'target', 'draft', 4000),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('未设置已启用的默认文本模型'),
    });
    expect(resolve).toHaveBeenLastCalledWith('text');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.com',
    'http://api.deepseek.com',
    'https://api.deepseek.com:8443',
  ])('rejects a non-DeepSeek endpoint', (url) =>
    expect(() => generationProviderUrl('openai-chat', url)).toThrow(),
  );
});

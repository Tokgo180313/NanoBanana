import { imageConnection } from '../model-admin/generation-models.service';
import sharp from 'sharp';
import { Ai147Service, type Ai147GenerateRequest } from './ai147.service';

describe('147AI Gemini native image adapter', () => {
  let service: Ai147Service, fetchMock: jest.SpiedFunction<typeof fetch>;
  let png: string, jpeg: string;
  const request: Ai147GenerateRequest & {
    [imageConnection]: { apiUrl: string; apiKey: string };
  } = {
    [imageConnection]: {
      apiUrl: 'https://nn.147ai.com',
      apiKey: 'test-only-secret',
    },
    model: 'gemini-3-pro-image-preview',
    prompt: 'Draw a blue cube',
    aspectRatio: '16:9',
    resolution: '4K',
    imageList: [],
  };
  const answer = (data: string, mimeType = 'image/png') => ({
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ inlineData: { mimeType, data } }] },
      },
    ],
  });
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  beforeAll(async () => {
    const input = {
      create: { width: 2, height: 2, channels: 3 as const, background: 'blue' },
    };
    png = (await sharp(input).png().toBuffer()).toString('base64');
    jpeg = (await sharp(input).jpeg().toBuffer()).toString('base64');
  });
  beforeEach(() => {
    service = new Ai147Service();
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(reply(answer(png)));
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses the documented native route, server-only key and explicit Pro image parameters', async () => {
    const result = await service.generate(request);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://nn.147ai.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'test-only-secret',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: { aspectRatio: '16:9', imageSize: '4K' },
          },
        }),
      }),
    );
    expect(result).toEqual({
      model: request.model,
      data: [{ url: `data:image/png;base64,${png}` }],
    });
  });

  it('omits unsupported imageSize for Flash and allows text-only generation', async () => {
    await service.generate({
      ...request,
      model: 'gemini-2.5-flash-image',
      resolution: '1K',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      generationConfig: { imageConfig: Record<string, unknown> };
    };
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: '16:9' });
  });

  it.each(['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'])(
    'supports multi-reference editing for %s and sends decoded MIME types',
    async (model) => {
      await service.generate({
        ...request,
        model,
        resolution: '1K',
        imageList: [
          `data:image/jpeg;base64,${png}`,
          `data:image/png;base64,${jpeg}`,
        ],
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        contents: Array<{ parts: unknown[] }>;
      };
      expect(body.contents[0].parts).toEqual([
        { inlineData: { mimeType: 'image/png', data: png } },
        { inlineData: { mimeType: 'image/jpeg', data: jpeg } },
        { text: request.prompt },
      ]);
    },
  );

  it('does not return interim thought images or raw upstream metadata', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({
        secretMetadata: 'never return this',
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  thought: true,
                  inlineData: { mimeType: 'image/jpeg', data: jpeg },
                },
                { text: 'internal explanation' },
                { inlineData: { mimeType: 'image/png', data: png } },
              ],
            },
          },
        ],
      }),
    );
    expect(await service.generate(request)).toEqual({
      model: request.model,
      data: [{ url: `data:image/png;base64,${png}` }],
    });
  });

  it('accepts snake-case Gemini image fields', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({
        candidates: [
          {
            content: {
              parts: [{ inline_data: { mime_type: 'image/jpeg', data: jpeg } }],
            },
          },
        ],
      }),
    );
    expect((await service.generate(request)).data[0].url).toBe(
      `data:image/jpeg;base64,${jpeg}`,
    );
  });

  it.each([
    [{ model: '../invalid' }, 'AI147_UNSUPPORTED_MODEL'],
    [{ prompt: '' }, 'AI147_PROMPT_REQUIRED_OR_TOO_LONG'],
    [
      { imageList: ['https://private.test/image.png'] },
      'AI147_REFERENCE_DATA_URL_REQUIRED',
    ],
    [
      { imageList: ['data:image/png;base64,YmFk'] },
      'AI147_INVALID_REFERENCE_IMAGE',
    ],
    [
      { endpoint: 'https://attacker.test' },
      'PROVIDER_CREDENTIAL_OVERRIDE_FORBIDDEN',
    ],
    [{ apiKey: 'client-key' }, 'PROVIDER_CREDENTIAL_OVERRIDE_FORBIDDEN'],
  ])(
    'rejects invalid requests before making a billed call (%s)',
    async (patch, error) => {
      await expect(service.generate({ ...request, ...patch })).rejects.toThrow(
        error,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403, 429, 500])(
    'redacts upstream error content for HTTP %s',
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        reply(
          { error: { message: 'secret token and private prompt' } },
          status,
        ),
      );
      await expect(service.generate(request)).rejects.toThrow(
        `AI147_UPSTREAM_HTTP_${status}`,
      );
    },
  );

  it('rejects blocked output and successful responses without a final image', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ promptFeedback: { blockReason: 'SAFETY' } }),
    );
    await expect(service.generate(request)).rejects.toThrow(
      'AI147_IMAGE_BLOCKED',
    );
    fetchMock.mockResolvedValueOnce(
      reply({
        candidates: [
          {
            finishReason: 'SAFETY',
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: png } }],
            },
          },
        ],
      }),
    );
    await expect(service.generate(request)).rejects.toThrow(
      'AI147_NO_FINAL_IMAGE',
    );
  });

  it('rejects malformed JSON and invalid image MIME/base64', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>upstream failure</html>'),
    );
    await expect(service.generate(request)).rejects.toThrow(
      'AI147_INVALID_RESPONSE',
    );
    fetchMock.mockResolvedValueOnce(reply(answer(png, 'image/svg+xml')));
    await expect(service.generate(request)).rejects.toThrow(
      'AI147_INVALID_IMAGE_RESPONSE',
    );
    fetchMock.mockResolvedValueOnce(reply(answer('%%%invalid%%%')));
    await expect(service.generate(request)).rejects.toThrow(
      'AI147_INVALID_IMAGE_RESPONSE',
    );
  });

  it('bounds upstream response memory', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array(32 * 1024 * 1024 + 1)),
    );
    await expect(service.generate(request)).rejects.toThrow(
      'AI147_RESPONSE_TOO_LARGE',
    );
  });

  it('rejects a missing resolved provider before calling upstream', async () => {
    await expect(
      service.generate({ ...request, [imageConnection]: undefined }),
    ).rejects.toThrow('MODEL_PROVIDER_UNAVAILABLE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a newly registered model identifier to the configured provider', async () => {
    await service.generate({ ...request, model: 'new-image-model' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://nn.147ai.com/v1beta/models/new-image-model:generateContent',
    );
  });

  it('passes cancellation through to the native fetch request', async () => {
    const abort = new AbortController();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener(
            'abort',
            () => reject(new Error('cancelled')),
            { once: true },
          );
          abort.abort();
        }),
    );
    await expect(service.generate(request, abort.signal)).rejects.toThrow(
      'AI147_REQUEST_CANCELLED',
    );
  });
});

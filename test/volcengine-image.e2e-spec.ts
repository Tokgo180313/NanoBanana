interface VolcengineImageGenerationResponse {
  created?: number;
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
}

describe('Volcengine image generation (e2e)', () => {
  const apiKey = process.env.VOLCENGINE_ARK_API_KEY;
  const baseUrl =
    process.env.VOLCENGINE_ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3';
  const model =
    process.env.VOLCENGINE_ARK_MODEL ?? 'doubao-seedream-3-0-t2i-250415';

  const runIfConfigured = apiKey ? it : it.skip;

  runIfConfigured(
    'should generate an image from prompt',
    async () => {
      const response = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: 'A cute banana astronaut floating in space, ultra detailed, 3d render',
          size: '512x512',
          n: 1,
          response_format: 'url',
        }),
      });

      expect(response.ok).toBe(true);

      const payload =
        (await response.json()) as VolcengineImageGenerationResponse;

      expect(Array.isArray(payload.data)).toBe(true);
      expect(payload.data!.length).toBeGreaterThan(0);

      const firstImage = payload.data![0];
      expect(
        typeof firstImage.url === 'string' ||
          typeof firstImage.b64_json === 'string',
      ).toBe(true);
    },
    60_000,
  );
});

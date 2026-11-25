/** Optional paid live probe; never saves credentials or publishes test assets. */
require('dotenv').config({ path: ['.env.iam', '.env'], quiet: true });
const { ConfigService } = require('@nestjs/config');
const { randomUUID } = require('node:crypto');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const {
  Ai147Service,
  AI147_MODELS,
} = require('../dist-iam/ai147/ai147.service');
const { ImageStorage } = require('../dist-iam/iam/image-storage.service');

async function main() {
  const config = new ConfigService();
  if (!config.get('AI147_API_KEY', '').trim())
    throw new Error('AI147_API_KEY_REQUIRED');
  if (!process.argv.includes('--live')) {
    console.log(
      '147AI 令牌已配置。加 --live 将执行两模型的文生图/参考图编辑共四次实际生成，并检查 OSS 存储。',
    );
    return;
  }
  if (config.get('NB_IMAGE_STORAGE') !== 'oss')
    throw new Error('AI147_CHECK_REQUIRES_OSS');
  const service = new Ai147Service(config);
  const storage = new ImageStorage(config);
  storage.onModuleInit();
  const reference = await sharp({
    create: { width: 128, height: 128, channels: 3, background: '#305ee8' },
  })
    .png()
    .toBuffer();
  const runId = 'ai147-check-' + randomUUID();
  const results = [];
  try {
    for (const model of AI147_MODELS) {
      for (const mode of ['text-to-image', 'reference-edit']) {
        console.log(JSON.stringify({ model, mode, status: 'starting' }));
        const started = Date.now();
        let image;
        try {
          const result = await service.generate({
            model,
            prompt:
              mode === 'text-to-image'
                ? 'Create a simple flat illustration of a single blue cube on a plain white background. No text, no people.'
                : 'Use the blue color from the reference image. Create a simple blue circle centered on a plain white background. No text, no people.',
            imageList:
              mode === 'reference-edit'
                ? ['data:image/png;base64,' + reference.toString('base64')]
                : [],
            aspectRatio: '1:1',
            resolution: '1K',
          });
          image = await storage.save(
            0,
            runId,
            `${model.replace(/[^a-zA-Z0-9_-]/g, '-')}-${mode}`,
            result.data[0].url,
          );
          await storage.read(image);
          const item = {
            model,
            mode,
            status: 'passed',
            width: image.width,
            height: image.height,
            size: image.size,
            storageProvider: image.storageProvider,
            checksumVerified: true,
            durationMs: Date.now() - started,
          };
          results.push(item);
          console.log(JSON.stringify(item));
        } finally {
          if (image) {
            try {
              await storage.delete(image);
              console.log(JSON.stringify({ model, mode, cleanup: 'done' }));
            } catch {
              console.error(
                JSON.stringify({
                  cleanup: 'failed',
                  storageKey: image.storageKey,
                }),
              );
              process.exitCode = 1;
            }
          }
        }
      }
    }
  } finally {
    const directory = path.resolve('data');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const report = path.join(directory, runId + '.json');
    await writeFile(report, JSON.stringify({ runId, results }, null, 2), {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({ report, passed: results.length, expected: 4 }),
    );
  }
}
main().catch((error) => {
  const message = String(error?.message || '');
  console.error(
    /^AI147_[A-Z0-9_]+$/.test(message) ? message : 'AI147_CHECK_FAILED',
  );
  process.exitCode = 1;
});

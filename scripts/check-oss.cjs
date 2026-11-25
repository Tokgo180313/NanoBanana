/** Run from banana_backend after build:iam. Only touches a unique probe object. */
require('dotenv').config({ path: ['.env.iam', '.env'], quiet: true });
const { ConfigService } = require('@nestjs/config');
const { randomUUID, createHash } = require('node:crypto');
const sharp = require('sharp');
const { ImageStorage } = require('../dist-iam/iam/image-storage.service');
const { OssImageStore } = require('../dist-iam/iam/oss-image-store');

async function main() {
  const config = new ConfigService();
  if (config.get('NB_IMAGE_STORAGE') !== 'oss')
    throw new Error('Set NB_IMAGE_STORAGE=oss before running the OSS check');
  const storage = new ImageStorage(config);
  storage.onModuleInit();
  const bytes = await sharp({
    create: { width: 1, height: 1, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const task = 'oss-check-' + randomUUID();
  const hash = createHash('sha256').update(bytes).digest('hex');
  // Compute the unique key before upload so a timed-out PUT can also be cleaned up.
  const probe = {
    storageProvider: 'oss',
    storageKey: `${new OssImageStore(config).prefix}/0/${task}/probe-${hash}.png`,
  };
  try {
    const image = await storage.save(
      0,
      task,
      'probe',
      'data:image/png;base64,' + bytes.toString('base64'),
    );
    const actual = await storage.read(image);
    if (!actual.equals(bytes)) throw new Error('OSS_CHECK_CONTENT_MISMATCH');
    console.log('OSS 上传、读取及 SHA-256 校验通过。');
  } finally {
    try {
      await storage.delete(probe);
      console.log('OSS 测试对象已清理。');
    } catch {
      console.error(
        `OSS 测试对象清理失败，请在控制台检查：${probe.storageKey}`,
      );
      process.exitCode = 1;
    }
  }
}
main().catch((error) => {
  // SDK exceptions can contain signed requests: emit only our fixed error codes.
  const message = String(error?.message || '');
  console.error(
    /^(?:NB_|OSS_|IMAGE_STORAGE_|INVALID_OSS_|Set NB_IMAGE_STORAGE=)/.test(
      message,
    )
      ? message
      : 'OSS 连通性检查失败，请检查网络、配置和 RAM 权限。',
  );
  process.exitCode = 1;
});

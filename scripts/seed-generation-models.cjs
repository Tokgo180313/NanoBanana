const { resolve } = require('node:path');
const { createCipheriv, randomBytes } = require('node:crypto');
const { config } = require('dotenv');
const { createConnection } = require('mysql2/promise');

config({
  path: [resolve(__dirname, '../.env.iam'), resolve(__dirname, '../.env')],
  quiet: true,
});

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error('Missing ' + name);
  return value;
}

const imageRatios = ['3:4', '1:1', '21:9', '16:9', '9:16', '4:3', '3:2', '2:3'];
const videoCaps = {
  resolutions: ['480p', '720p', '1080p'],
  ratios: ['adaptive', '9:16', '16:9', '1:1', '4:3', '3:4', '21:9'],
  minDuration: 5,
  maxDuration: 15,
  maxMaterials: 12,
};
const linkfoxOrigin = 'https://sbappstoreapi.ziniao.com';
const linkfoxPrefix = linkfoxOrigin + '/openapi-router/linkfox-ai/image/v2';

function seedProviders() {
  const requiredPaths = {
    LINKFOX_IMAGE_ENDPOINT: '/make/multiImageFusionV2',
    LINKFOX_IMAGE_INFO_ENDPOINT: '/make/info',
    LINKFOX_IMAGE_UPLOAD_ENDPOINT: '/uploadByBase64',
  };
  for (const [name, path] of Object.entries(requiredPaths)) {
    if (
      (process.env[name]?.trim() ?? linkfoxPrefix + path) !==
      linkfoxPrefix + path
    )
      throw new Error('Unsupported endpoint for ' + name);
  }
  const ai147Url = (
    process.env.AI147_BASE_URL?.trim() || 'https://nn.147ai.com'
  ).replace(/\/$/, '');
  if (ai147Url !== 'https://nn.147ai.com')
    throw new Error('Unsupported AI147_BASE_URL');
  return [
    {
      id: 'workbench-linkfox',
      name: 'Linkfox',
      protocol: 'linkfox',
      url: linkfoxPrefix,
      key: required('LINKFOX_API_KEY'),
    },
    {
      id: 'workbench-ai147',
      name: '147AI',
      protocol: 'ai147',
      url: ai147Url,
      key: required('AI147_API_KEY'),
    },
    {
      id: 'workbench-ark',
      name: '火山方舟',
      protocol: 'ark',
      url: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
      key: required('ARK_API_KEY'),
    },
  ];
}

async function seed() {
  const db = await createConnection({
    uri: required('NB_MYSQL_URI'),
    connectTimeout: 5000,
  });
  try {
    const [[{ name }]] = await db.query(
      "SELECT CONCAT('nb:m:', SHA2(DATABASE(), 224)) AS name",
    );
    const [[{ acquired }]] = await db.execute(
      'SELECT GET_LOCK(?, 10) AS acquired',
      [name],
    );
    if (acquired !== 1)
      throw new Error('Could not acquire model configuration lock');
    await db.beginTransaction();
    const [[done]] = await db.execute(
      'SELECT name FROM model_schema_migrations WHERE name = ?',
      ['seed-workbench-models-v1'],
    );
    if (done) {
      await db.rollback();
      console.log(
        'Workbench models already seeded. Existing settings were preserved.',
      );
      return;
    }

    const encoded = required('NB_MODEL_KEY_BASE64');
    const master = Buffer.from(encoded, 'base64');
    const version = process.env.NB_MODEL_KEY_VERSION ?? '1';
    if (
      master.length !== 32 ||
      master.toString('base64') !== encoded ||
      !/^[A-Za-z0-9_.-]{1,64}$/.test(version)
    )
      throw new Error('Invalid model encryption configuration');
    const providers = seedProviders();
    const [existing] = await db.query(
      "SELECT id FROM providers WHERE protocol IN ('linkfox','ai147','ark') FOR UPDATE",
    );
    if (existing.length)
      throw new Error(
        'Existing media providers conflict with seed. Reconcile existing records before seeding.',
      );
    for (const provider of providers) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', master, nonce);
      const ciphertext = Buffer.concat([
        cipher.update(provider.key, 'utf8'),
        cipher.final(),
      ]);
      await db.execute(
        'INSERT INTO providers (id, name, api_url, protocol, api_key_ciphertext, api_key_nonce, api_key_tag, api_key_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          provider.id,
          provider.name,
          provider.url,
          provider.protocol,
          ciphertext,
          nonce,
          cipher.getAuthTag(),
          version,
        ],
      );
    }
    const images = [
      ['BANANA_2', 'Banana 2 · Linkfox', 'linkfox', ['2K', '4K']],
      ['BANANA_PRO', 'Banana Pro · Linkfox', 'linkfox', ['2K', '4K']],
      ['GPT_2_IMAGE', 'Image 2 · Linkfox', 'linkfox', ['2K', '4K']],
      ['gemini-2.5-flash-image', 'Gemini 2.5 Flash · 147AI', 'ai147', ['1K']],
      [
        'gemini-3-pro-image-preview',
        'Gemini 3 Pro · 147AI',
        'ai147',
        ['1K', '2K', '4K'],
      ],
    ];
    const rows = images.map(([id, name, protocol, sizes]) => ({
      id,
      name,
      protocol,
      upstream: id,
      kind: 'image',
      alias: id,
      capabilities: {
        ratios:
          protocol === 'ai147' ? [...imageRatios, '4:5', '5:4'] : imageRatios,
        sizes,
        maxReferenceImages: 4,
      },
    }));
    rows.push({
      id: 'workbench-seedance',
      name: 'Seedance 2.5',
      protocol: 'ark',
      kind: 'video',
      alias: '',
      upstream:
        process.env.ARK_VIDEO_MODEL?.trim() || 'doubao-seedance-2-5-260628',
      capabilities: videoCaps,
    });
    for (const [order, row] of rows.entries()) {
      await db.execute(
        'INSERT INTO models (id, provider_id, upstream_model_id, name, kind, capabilities, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
        [
          row.id,
          'workbench-' + row.protocol,
          row.upstream,
          row.name,
          row.kind,
          JSON.stringify(row.capabilities),
          order,
        ],
      );
      await db.execute(
        'INSERT INTO generation_model_aliases (protocol, legacy_model, model_id) VALUES (?, ?, ?)',
        [row.protocol, row.alias, row.id],
      );
    }
    await db.execute(
      "INSERT INTO generation_model_aliases (protocol, legacy_model, model_id) VALUES ('linkfox', '', 'BANANA_2')",
    );
    await db.execute(
      "INSERT INTO model_defaults (kind, model_id) VALUES ('image', 'BANANA_2'), ('video', 'workbench-seedance')",
    );
    await db.execute('INSERT INTO model_schema_migrations (name) VALUES (?)', [
      'seed-workbench-models-v1',
    ]);
    await db.commit();
    console.log(
      'Seeded workbench providers, models, defaults and legacy aliases.',
    );
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

seed().catch((error) => {
  console.error('Workbench seed failed:', error.code ?? error.message);
  process.exitCode = 1;
});

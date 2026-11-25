/** Run from banana_backend, after build:iam. MySQL source is read-only. */
const { mkdir, writeFile, readFile } = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const { ConfigService } = require('@nestjs/config');
const { ensureIndexes } = require('../dist-iam/iam/iam-db.service');
const { ImageStorage } = require('../dist-iam/iam/image-storage.service');
const { IamAuth } = require('../dist-iam/iam/iam-auth.service');
require('dotenv').config({ path: ['.env.iam', '.env'], quiet: true });
const mappings = [
  ['nb_iam_sessions', 'iam_sessions', 'id_hash'],
  ['nb_iam_login_states', 'iam_login_states', 'state_hash'],
  ['nb_image_tasks', 'image_tasks', 'id'],
  ['nb_image_assets', 'image_assets', 'id'],
  ['nb_iam_outbox', 'iam_outbox', 'id'],
];
const hash = (v) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const isoDate = (v) =>
  new Date(v instanceof Date ? v : String(v).replace(' ', 'T') + 'Z');
function normalize(source) {
  const row = { ...source };
  for (const k of ['tenant_id', 'owner_user_id'])
    if (row[k] != null) {
      if (!Number.isSafeInteger(Number(row[k])))
        throw Error('UNSAFE_ID_PRECISION');
      row[k] = Number(row[k]);
    }
  for (const k of ['expires_at', 'created_at'])
    if (row[k]) {
      row[k] = isoDate(row[k]);
      if (!Number.isFinite(row[k].getTime())) throw Error('INVALID_DATE');
    }
  for (const k of ['settings', 'payload'])
    if (typeof row[k] === 'string') row[k] = JSON.parse(row[k]);
  if (row.upstream_id === null) delete row.upstream_id;
  return row;
}
async function run() {
  const apply = process.argv.includes('--apply');
  if (apply && process.env.NB_MIGRATION_MAINTENANCE !== '1')
    throw Error(
      'Stop business writes and set NB_MIGRATION_MAINTENANCE=1 first',
    );
  let source, client;
  try {
    source = await mysql.createConnection({
      host: process.env.NB_DB_HOST || '127.0.0.1',
      port: Number(process.env.NB_DB_PORT || 3306),
      user: process.env.NB_DB_USER,
      password: process.env.NB_DB_PASSWORD,
      database: process.env.NB_DB_NAME || 'nanobanana',
      timezone: 'Z',
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
    });
    await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const snapshot = {};
    for (const [table] of mappings)
      snapshot[table] = (
        await source.query('SELECT * FROM `' + table + '`')
      )[0];
    await source.rollback();
    const summary = Object.fromEntries(
      mappings.map(([table]) => [table, snapshot[table].length]),
    );
    console.log(
      JSON.stringify({
        mode: apply ? 'apply' : 'preflight',
        sourceCounts: summary,
      }),
    );
    if (!apply) return;
    const root = path.resolve(
      process.env.NB_MIGRATION_DIR || './data/migrations',
    );
    await mkdir(root, { recursive: true, mode: 0o700 });
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    // Backups include encrypted credentials: private file, never log its contents.
    const backup = path.join(root, runId + '-mysql.json');
    await writeFile(backup, JSON.stringify(snapshot), {
      mode: 0o600,
      flag: 'wx',
    });
    const saved = JSON.parse(await readFile(backup, 'utf8'));
    if (hash(saved) !== hash(snapshot))
      throw Error('BACKUP_VERIFICATION_FAILED');
    client = new MongoClient(
      process.env.NB_MONGO_URI || 'mongodb://127.0.0.1:27017',
      { serverSelectionTimeoutMS: 5000 },
    );
    await client.connect();
    const db = client.db(process.env.NB_MONGO_DB || 'nanobanana');
    await ensureIndexes(db);
    const config = new ConfigService(process.env),
      storage = new ImageStorage(config),
      auth = new IamAuth(config, {}, {});
    const report = {
      runId,
      sourceCounts: summary,
      collections: {},
      unavailableAssets: [],
      conflicts: [],
      verified: false,
    };
    for (const [table, name, key] of mappings) {
      let verified = 0,
        skippedExpired = 0;
      for (const raw of snapshot[table]) {
        const row = normalize(raw);
        if (row.expires_at && row.expires_at <= new Date()) {
          skippedExpired++;
          continue;
        }
        const fingerprint = hash(raw),
          filter = { [key]: row[key] },
          collection = db.collection(name);
        const existing = await collection.findOne(filter);
        if (existing && existing.migrationFingerprint !== fingerprint) {
          report.conflicts.push({ collection: name, id: String(row[key]) });
          continue;
        }
        if (name === 'image_assets') {
          const sourceCipher = row.source_cipher;
          delete row.source_cipher;
          if (existing?.storageKey) {
            await storage.read(existing);
            Object.assign(
              row,
              Object.fromEntries(
                [
                  'storageProvider',
                  'storageKey',
                  'storageUrl',
                  'mimeType',
                  'size',
                  'width',
                  'height',
                  'contentHash',
                ].map((k) => [k, existing[k]]),
              ),
            );
          } else {
            try {
              Object.assign(
                row,
                await storage.save(
                  row.tenant_id,
                  row.task_id,
                  row.id,
                  auth.open(sourceCipher),
                ),
              );
            } catch {
              row.status = raw.status === 'DELETED' ? 'DELETED' : 'UNAVAILABLE';
              row.storageError = 'SOURCE_UNAVAILABLE';
              report.unavailableAssets.push(row.id);
            }
          }
          if (row.storageKey && existing?.status === 'UNAVAILABLE')
            row.status = raw.status;
        }
        if (!existing) {
          await collection.updateOne(
            filter,
            { $setOnInsert: { ...row, migrationFingerprint: fingerprint } },
            { upsert: true },
          );
        } else if (
          name === 'image_assets' &&
          existing.status === 'UNAVAILABLE' &&
          row.storageKey
        ) {
          await collection.updateOne(
            { ...filter, status: 'UNAVAILABLE' },
            { $set: row, $unset: { storageError: '' } },
          );
        }
        const target = await collection.findOne(filter);
        const mismatch = Object.entries(row).some(
          ([k, v]) => JSON.stringify(target?.[k]) !== JSON.stringify(v),
        );
        if (mismatch)
          report.conflicts.push({ collection: name, id: String(row[key]) });
        else verified++;
      }
      report.collections[name] = {
        source: snapshot[table].length,
        verified,
        skippedExpired,
        targetTotal: await db.collection(name).countDocuments(),
      };
    }
    report.verified =
      !report.conflicts.length && !report.unavailableAssets.length;
    await writeFile(
      path.join(root, runId + '-report.json'),
      JSON.stringify(report, null, 2),
      { mode: 0o600, flag: 'wx' },
    );
    console.log(JSON.stringify(report));
    if (!report.verified) process.exitCode = 2;
  } finally {
    await source?.end();
    await client?.close();
  }
}
if (require.main === module)
  run().catch((e) => {
    // Do not log connection strings, source URLs, SQL payloads or credentials.
    console.error(
      'Migration failed (' +
        e.name +
        (e.code ? ':' + e.code : '') +
        '). Source database unchanged.',
    );
    process.exitCode = 1;
  });
module.exports = { normalize };

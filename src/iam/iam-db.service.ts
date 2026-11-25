import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoClient, type Db, type Document } from 'mongodb';

export const collectionNames = [
  'iam_sessions',
  'iam_login_states',
  'image_tasks',
  'image_assets',
  'video_tasks',
  'iam_outbox',
] as const;
export type CollectionName = (typeof collectionNames)[number];

/** Business database only; the external IAM database is never accessed. */
@Injectable()
export class IamDb implements OnModuleInit, OnModuleDestroy {
  private client?: MongoClient;
  private database?: Db;
  constructor(private readonly config: ConfigService) {}
  async onModuleInit() {
    this.client = new MongoClient(
      this.config.get('NB_MONGO_URI', 'mongodb://127.0.0.1:27017'),
      {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 8,
      },
    );
    await this.client.connect();
    this.database = this.client.db(
      this.config.get('NB_MONGO_DB', 'nanobanana'),
    );
    await ensureIndexes(this.database);
  }
  collection<T extends Document = Document>(name: CollectionName) {
    if (!this.database) throw new Error('MONGODB_NOT_INITIALIZED');
    return this.database.collection<T>(name);
  }
  async onModuleDestroy() {
    await this.client?.close();
  }
}

export async function ensureIndexes(db: Db) {
  for (const [name, key] of [
    ['iam_sessions', 'id_hash'],
    ['iam_login_states', 'state_hash'],
  ] as const) {
    await db.collection(name).createIndex({ [key]: 1 }, { unique: true });
    await db
      .collection(name)
      .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  }
  for (const name of ['image_tasks', 'image_assets']) {
    await db.collection(name).createIndex({ id: 1 }, { unique: true });
    await db
      .collection(name)
      .createIndex({ tenant_id: 1, owner_user_id: 1, created_at: -1 });
    await db.collection(name).createIndex({ tenant_id: 1, created_at: -1 });
  }
  await db.collection('video_tasks').createIndex({ id: 1 }, { unique: true });
  await db.collection('video_tasks').createIndex({ tenant_id: 1, owner_user_id: 1, created_at: -1, id: -1 });
  await db.collection('image_tasks').createIndex(
    { tenant_id: 1, provider: 1, upstream_id: 1 },
    {
      unique: true,
      partialFilterExpression: { upstream_id: { $type: 'string' } },
    },
  );
  await db
    .collection('image_assets')
    .createIndex(
      { tenant_id: 1, task_id: 1, source_hash: 1 },
      { unique: true },
    );
  await db
    .collection('iam_outbox')
    .createIndex(
      { tenant_id: 1, resource_type: 1, resource_key: 1 },
      { unique: true },
    );
}

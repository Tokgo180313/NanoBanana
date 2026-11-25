import { generationProviderUrl } from './generation-models.service';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { MysqlService } from '../mysql/mysql.service';
import {
  apiUrl,
  capabilities,
  fields,
  integer,
  mediaKind,
  type MediaKind,
  protocols,
  required,
} from './model-admin.input';

interface Provider extends RowDataPacket {
  id: string;
  name: string;
  apiUrl: string;
  protocol: string;
  keyConfigured: number;
  version: number;
}
interface Model extends RowDataPacket {
  id: string;
  providerId: string;
  upstreamModelId: string;
  name: string;
  kind: MediaKind;
  capabilities: unknown;
  enabled: number;
  sortOrder: number;
  version: number;
}
const providerColumns =
  'id, name, api_url AS apiUrl, protocol, version, OCTET_LENGTH(api_key_ciphertext) > 0 AS keyConfigured';
const modelColumns =
  'id, provider_id AS providerId, upstream_model_id AS upstreamModelId, name, kind, capabilities, enabled, sort_order AS sortOrder, version';

@Injectable()
export class ModelAdminService {
  constructor(
    private readonly mysql: MysqlService,
    private readonly config: ConfigService,
  ) {}

  private async operation<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY')
        throw new ConflictException('该提供商下的模型 ID 已存在');
      throw new ServiceUnavailableException('模型配置数据库暂不可用');
    }
  }

  private async transaction<T>(
    run: (db: PoolConnection) => Promise<T>,
    lock = false,
  ) {
    return this.operation(async () => {
      const db = await this.mysql.connection.getConnection();
      let lockName: string | undefined;
      try {
        if (lock) {
          const [[row]] = await db.query<RowDataPacket[]>(
            "SELECT CONCAT('nb:m:', SHA2(DATABASE(), 224)) AS name",
          );
          const name = row!.name as string;
          const [[result]] = await db.query<RowDataPacket[]>(
            'SELECT GET_LOCK(?, 5) AS acquired',
            [name],
          );
          if (result?.acquired !== 1)
            throw new ServiceUnavailableException('模型配置正在更新，请重试');
          lockName = name;
        }
        await db.beginTransaction();
        try {
          const result = await run(db);
          await db.commit();
          return result;
        } catch (error) {
          await db.rollback();
          throw error;
        }
      } finally {
        try {
          if (lockName) await db.query('SELECT RELEASE_LOCK(?)', [lockName]);
          db.release();
        } catch {
          db.destroy();
        }
      }
    });
  }

  private async audit(
    db: PoolConnection,
    entity: string,
    id: string,
    actor: string,
    action: string,
    details: object,
  ) {
    await db.execute(
      'INSERT INTO model_config_changes (entity_type, entity_id, actor_id, action, details) VALUES (?, ?, ?, ?, ?)',
      [entity, id, actor, action, JSON.stringify(details)],
    );
  }

  private encrypt(value: unknown) {
    const keyText = required(value, 8192, 'API Key');
    const encoded = this.config.get<string>('NB_MODEL_KEY_BASE64') ?? '';
    const key = Buffer.from(encoded, 'base64');
    const version = this.config.get<string>('NB_MODEL_KEY_VERSION') ?? '1';
    if (
      key.length !== 32 ||
      key.toString('base64') !== encoded ||
      !/^[A-Za-z0-9_.-]{1,64}$/.test(version)
    )
      throw new ServiceUnavailableException('API Key 加密配置无效');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(keyText, 'utf8'),
      cipher.final(),
    ]);
    return [ciphertext, nonce, cipher.getAuthTag(), version] as const;
  }

  private checkVersion(version: unknown, current: number) {
    if (integer(version, 1, 4294967295, '版本') !== current)
      throw new ConflictException('配置已更新，请刷新后重试');
  }

  listProviders() {
    return this.operation(async () => {
      const [rows] = await this.mysql.connection.query<Provider[]>(
        `SELECT ${providerColumns}, (SELECT COUNT(*) FROM models WHERE provider_id = providers.id) AS modelCount FROM providers ORDER BY name, id`,
      );
      return rows.map((row) => ({
        ...row,
        keyConfigured: Boolean(row.keyConfigured),
      }));
    });
  }

  saveProvider(actor: string, body: unknown, id?: string) {
    const data = fields(body, [
      'name',
      'apiUrl',
      'protocol',
      'apiKey',
      'version',
    ]);
    const name = required(data.name, 150, '提供商名称');

    const protocol = protocols.find((item) => item.id === data.protocol);
    if (!protocol) throw new BadRequestException('请选择支持的接口协议');
    const url =
      protocol.kind === 'text'
        ? apiUrl(data.apiUrl)
        : generationProviderUrl(
            protocol.id,
            data.apiUrl,
            this.config.get<string>(
              'NB_MODEL_HOSTS_' + protocol.id.toUpperCase(),
            ),
          );
    const encrypted =
      !id || (data.apiKey !== undefined && data.apiKey !== '')
        ? this.encrypt(data.apiKey)
        : undefined;
    return this.transaction(async (db) => {
      const providerId = id ?? randomUUID();
      let before;
      if (id) {
        const [[row]] = await db.execute<Provider[]>(
          `SELECT ${providerColumns} FROM providers WHERE id = ? FOR UPDATE`,
          [id],
        );
        if (!row) throw new NotFoundException('提供商不存在');
        this.checkVersion(data.version, row.version);
        if (row.protocol !== protocol.id) {
          const [[model]] = await db.execute<RowDataPacket[]>(
            'SELECT id FROM models WHERE provider_id = ? LIMIT 1',
            [id],
          );
          if (model)
            throw new ConflictException('已有模型关联，无法更换接口协议');
        }
        before = { name: row.name, apiUrl: row.apiUrl, protocol: row.protocol };
        await db.execute(
          `INSERT INTO provider_connection_versions
           (provider_id, version, api_url, protocol, api_key_ciphertext, api_key_nonce, api_key_tag, api_key_version)
           SELECT id, version, api_url, protocol, api_key_ciphertext, api_key_nonce, api_key_tag, api_key_version
           FROM providers WHERE id = ? AND protocol IN ('linkfox', 'ark')`,
          [id],
        );
        await db.execute(
          `UPDATE providers SET name = ?, api_url = ?, protocol = ?, version = version + 1${
            encrypted
              ? ', api_key_ciphertext = ?, api_key_nonce = ?, api_key_tag = ?, api_key_version = ?'
              : ''
          } WHERE id = ?`,
          [name, url, protocol.id, ...(encrypted ?? []), id],
        );
      } else {
        await db.execute(
          'INSERT INTO providers (id, name, api_url, protocol, api_key_ciphertext, api_key_nonce, api_key_tag, api_key_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [providerId, name, url, protocol.id, ...encrypted!],
        );
      }
      await this.audit(
        db,
        'provider',
        providerId,
        actor,
        id ? 'update' : 'create',
        {
          before,
          after: { name, apiUrl: url, protocol: protocol.id },
          keyChanged: Boolean(encrypted),
        },
      );
      return { id: providerId };
    });
  }

  listModels() {
    return this.operation(async () => {
      const [rows] = await this.mysql.connection.query<Model[]>(
        `SELECT ${modelColumns}, EXISTS(SELECT 1 FROM model_defaults WHERE model_id = models.id) AS isDefault FROM models ORDER BY sort_order, name, id`,
      );
      return rows.map((row) => ({
        ...row,
        enabled: Boolean(row.enabled),
        isDefault: Boolean(row.isDefault),
      }));
    });
  }

  createModel(actor: string, body: unknown) {
    const data = fields(body, [
      'providerId',
      'upstreamModelId',
      'kind',
      'name',
      'capabilities',
      'sortOrder',
    ]);
    const providerId = required(data.providerId, 64, '提供商');
    const upstreamModelId = required(data.upstreamModelId, 255, '模型 ID');
    const kind = mediaKind(data.kind);
    const name = required(data.name, 150, '模型名称');
    const options = capabilities(kind, data.capabilities);
    const sortOrder = integer(data.sortOrder, -2147483648, 2147483647, '排序');
    const id = randomUUID();
    return this.transaction(async (db) => {
      const [[provider]] = await db.execute<Provider[]>(
        `SELECT ${providerColumns} FROM providers WHERE id = ? FOR UPDATE`,
        [providerId],
      );
      if (!provider) throw new NotFoundException('提供商不存在');
      if (
        protocols.find((item) => item.id === provider.protocol)?.kind !== kind
      )
        throw new BadRequestException('提供商协议与模型类型不匹配');
      await db.execute(
        'INSERT INTO models (id, provider_id, upstream_model_id, name, kind, capabilities, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          providerId,
          upstreamModelId,
          name,
          kind,
          JSON.stringify(options),
          sortOrder,
        ],
      );
      await this.audit(db, 'model', id, actor, 'create', {
        after: {
          providerId,
          upstreamModelId,
          kind,
          name,
          capabilities: options,
          sortOrder,
          enabled: false,
        },
      });
      return { id };
    });
  }

  updateModel(actor: string, id: string, body: unknown) {
    const data = fields(body, [
      'version',
      'name',
      'capabilities',
      'sortOrder',
      'enabled',
      'setDefault',
      'replacementId',
    ]);
    for (const flag of ['enabled', 'setDefault']) {
      if (data[flag] !== undefined && typeof data[flag] !== 'boolean')
        throw new BadRequestException('模型状态参数无效');
    }
    return this.transaction(async (db) => {
      const [[row]] = await db.execute<Model[]>(
        `SELECT ${modelColumns} FROM models WHERE id = ? FOR UPDATE`,
        [id],
      );
      if (!row) throw new NotFoundException('模型不存在');
      this.checkVersion(data.version, row.version);
      const before = {
        name: row.name,
        capabilities: row.capabilities,
        sortOrder: row.sortOrder,
        enabled: Boolean(row.enabled),
      };
      const next = {
        name:
          data.name === undefined
            ? before.name
            : required(data.name, 150, '模型名称'),
        capabilities:
          data.capabilities === undefined
            ? before.capabilities
            : capabilities(row.kind, data.capabilities),
        sortOrder:
          data.sortOrder === undefined
            ? before.sortOrder
            : integer(data.sortOrder, -2147483648, 2147483647, '排序'),
        enabled: (data.enabled as boolean | undefined) ?? before.enabled,
      };
      if (next.enabled) {
        const [[provider]] = await db.execute<Provider[]>(
          `SELECT ${providerColumns} FROM providers WHERE id = ? FOR UPDATE`,
          [row.providerId],
        );
        if (
          !provider?.keyConfigured ||
          protocols.find((item) => item.id === provider.protocol)?.kind !==
            row.kind
        )
          throw new BadRequestException('请先完成提供商配置');
        if (row.kind === 'text') apiUrl(provider.apiUrl);
        else
          generationProviderUrl(
            provider.protocol,
            provider.apiUrl,
            this.config.get<string>(
              'NB_MODEL_HOSTS_' + provider.protocol.toUpperCase(),
            ),
          );
        const limits = capabilities(row.kind, next.capabilities);
        if (
          provider.protocol === 'linkfox' &&
          'maxReferenceImages' in limits &&
          limits.maxReferenceImages === 0
        )
          throw new BadRequestException('Linkfox 模型至少需要支持一张参考图');
      }
      const [[entry]] = await db.execute<RowDataPacket[]>(
        'SELECT model_id AS id FROM model_defaults WHERE kind = ? FOR UPDATE',
        [row.kind],
      );
      const current = entry?.id as string | undefined;
      let target = current;
      if (data.setDefault) {
        if (!next.enabled)
          throw new BadRequestException('仅已启用的模型可设为默认');
        target = id;
      }
      if (!next.enabled && current === id) {
        const [alternatives] = await db.execute<RowDataPacket[]>(
          'SELECT id FROM models WHERE kind = ? AND enabled = TRUE AND id <> ? FOR UPDATE',
          [row.kind, id],
        );
        const replacement = alternatives.find(
          (item) => item.id === data.replacementId,
        );
        if (alternatives.length && !replacement)
          throw new ConflictException('请选择同类型的已启用模型作为替代默认项');
        target = replacement?.id;
      }
      await db.execute(
        'UPDATE models SET name = ?, capabilities = ?, sort_order = ?, enabled = ?, version = version + 1 WHERE id = ?',
        [
          next.name,
          JSON.stringify(next.capabilities),
          next.sortOrder,
          next.enabled,
          id,
        ],
      );
      if (target !== current) {
        if (target)
          await db.execute(
            'INSERT INTO model_defaults (kind, model_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE model_id = ?',
            [row.kind, target, target],
          );
        else
          await db.execute('DELETE FROM model_defaults WHERE kind = ?', [
            row.kind,
          ]);
        await this.audit(db, 'default', row.kind, actor, 'update', {
          before: current ?? null,
          after: target ?? null,
        });
      }
      await this.audit(db, 'model', id, actor, 'update', {
        before,
        after: next,
      });
      return { id };
    }, true);
  }

  listChanges(query: Record<string, unknown>) {
    const page = integer(
      query.page === undefined ? 1 : Number(query.page),
      1,
      100000,
      '页码',
    );
    const filters: string[] = [];
    const params: string[] = [];
    if (query.entityType !== undefined) {
      if (!['provider', 'model', 'default'].includes(String(query.entityType)))
        throw new BadRequestException('记录类型无效');
      filters.push('entity_type = ?');
      params.push(String(query.entityType));
    }
    if (query.entityId !== undefined) {
      filters.push('entity_id = ?');
      params.push(required(query.entityId, 64, '实体 ID'));
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    return this.operation(async () => {
      const [rows] = await this.mysql.connection.query<RowDataPacket[]>(
        `SELECT CAST(id AS CHAR) AS id, entity_type AS entityType, entity_id AS entityId, actor_id AS actorId,
           action, details, created_at AS createdAt FROM model_config_changes ${where}
           ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET ?`,
        [...params, (page - 1) * 20],
      );
      return { items: rows.slice(0, 20), hasNext: rows.length > 20 };
    });
  }
}

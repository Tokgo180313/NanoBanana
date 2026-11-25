import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDecipheriv } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { MysqlService } from '../mysql/mysql.service';
import {
  apiUrl,
  capabilities,
  type ImageCapabilities,
  type VideoCapabilities,
} from './model-admin.input';

export type GenerationKind = 'image' | 'video';

const modelProtocols = {
  image: ['linkfox', 'ai147'],
  video: ['ark'],
  text: ['openai-chat'],
};

const providerHosts: Record<string, string> = {
  linkfox: 'sbappstoreapi.ziniao.com',
  ai147: 'nn.147ai.com',
  ark: 'ark.cn-beijing.volces.com',
};

export function generationProviderUrl(
  protocol: string,
  raw: unknown,
  extraHosts = '',
) {
  const url = new URL(apiUrl(raw));
  if (protocol === 'openai-chat') {
    if (url.origin !== 'https://api.deepseek.com' || url.pathname !== '/')
      throw new BadRequestException('INVALID_GENERATION_PROVIDER_URL');
    return url.origin;
  }
  const allowed = new Set([
    providerHosts[protocol],
    ...extraHosts.split(',').map((host) => host.trim().toLowerCase()),
  ]);
  if (
    !providerHosts[protocol] ||
    !allowed.has(url.hostname) ||
    url.port ||
    (protocol === 'ai147' && url.pathname !== '/') ||
    (protocol === 'linkfox' &&
      url.pathname.replace(/\/$/, '') !==
        '/openapi-router/linkfox-ai/image/v2') ||
    (protocol === 'ark' &&
      url.pathname.replace(/\/$/, '') !== '/api/v3/contents/generations/tasks')
  )
    throw new BadRequestException('INVALID_GENERATION_PROVIDER_URL');
  return url.href.replace(/\/$/, '');
}

export function rejectProviderOverrides(body: object) {
  if (['apiKey', 'endpoint', 'baseUrl', 'apiUrl'].some((key) => key in body))
    throw new BadRequestException('PROVIDER_CREDENTIAL_OVERRIDE_FORBIDDEN');
}

export type ProviderConnection = { apiUrl: string; apiKey: string };
type ResolvedModel<C> = {
  id: string;
  name: string;
  protocol: string;
  upstreamModelId: string;
  capabilities: C;
  providerId: string;
  providerVersion: number;
  connection: ProviderConnection;
};
export const imageConnection = Symbol('imageProviderConnection');

interface ConnectionRow extends RowDataPacket {
  provider_id: string;
  version: number;
  protocol: string;
  api_url: string;
  api_key_ciphertext: Buffer;
  api_key_nonce: Buffer;
  api_key_tag: Buffer;
  api_key_version: string;
}
interface ModelRow extends ConnectionRow {
  id: string;
  name: string;
  capabilities: unknown;
  upstream_model_id: string;
}
const columns =
  'api_url, protocol, api_key_ciphertext, api_key_nonce, api_key_tag, api_key_version, version';

@Injectable()
export class GenerationModels {
  constructor(
    private readonly db: MysqlService,
    private readonly config: ConfigService,
  ) {}

  private async read<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('MODEL_CATALOG_UNAVAILABLE');
    }
  }

  async catalog(kind: GenerationKind) {
    return this.read(async () => {
      const [rows] = await this.db.connection.execute<RowDataPacket[]>(
        `SELECT m.id, m.name, m.capabilities, p.protocol, d.model_id AS default_id
         FROM models m JOIN providers p ON p.id = m.provider_id
         LEFT JOIN model_defaults d ON d.kind = m.kind
         WHERE m.kind = ? AND m.enabled = 1
         ORDER BY m.sort_order, m.name, m.id`,
        [kind],
      );
      return {
        defaultModelId:
          rows.find((row) => row.id === row.default_id)?.id ?? null,
        models: rows.map((row) => ({
          id: row.id,
          name: row.name,
          capabilities: capabilities(kind, row.capabilities),
          // UI uses this to prepare reference images. Server still selects the adapter.
          ...(kind === 'image' && {
            referenceMode: row.protocol === 'linkfox' ? 'upload' : 'inline',
          }),
        })),
      };
    });
  }

  resolve(
    kind: 'text',
    id?: unknown,
  ): Promise<ResolvedModel<Record<string, never>>>;
  resolve(
    kind: GenerationKind,
    id: unknown,
    legacy?: { protocol: string; model: string },
  ): Promise<ResolvedModel<ImageCapabilities | VideoCapabilities>>;
  async resolve(
    kind: GenerationKind | 'text',
    id: unknown,
    legacy?: { protocol: string; model: string },
  ) {
    if (
      id !== undefined &&
      (typeof id !== 'string' || !id.trim() || id.length > 64)
    )
      throw new BadRequestException('INVALID_MODEL_ID');
    const useDefault = kind === 'text' && id === undefined;
    if (id === undefined && !legacy && !useDefault)
      throw new BadRequestException('MODEL_ID_REQUIRED');
    return this.read(async () => {
      const [rows] = await this.db.connection.execute<ModelRow[]>(
        `SELECT m.id, m.name, m.upstream_model_id, m.capabilities, p.id AS provider_id,
         ${columns
           .split(', ')
           .map((column) => 'p.' + column)
           .join(', ')}
         FROM models m JOIN providers p ON p.id = m.provider_id
         WHERE m.kind = ? AND m.enabled = 1 AND m.id = ${
           useDefault
             ? "(SELECT model_id FROM model_defaults WHERE kind = 'text')"
             : id === undefined
               ? '(SELECT model_id FROM generation_model_aliases WHERE protocol = ? AND legacy_model = ?)'
               : '?'
         }`,
        [
          kind,
          ...(useDefault
            ? []
            : id === undefined
              ? [legacy!.protocol, legacy!.model]
              : [id]),
        ],
      );
      const row = rows[0];
      if (useDefault && !row)
        throw new ServiceUnavailableException('DEFAULT_TEXT_MODEL_MISSING');
      const supported = modelProtocols[kind];
      if (
        !row ||
        !supported.includes(row.protocol) ||
        (legacy && row.protocol !== legacy.protocol)
      )
        throw new ConflictException('MODEL_UNAVAILABLE');
      return {
        id: row.id,
        name: row.name,
        protocol: row.protocol,
        upstreamModelId: row.upstream_model_id,
        capabilities: capabilities(kind, row.capabilities),
        providerId: row.provider_id,
        providerVersion: row.version,
        connection: this.decrypt(row),
      };
    });
  }

  private decrypt(row: ConnectionRow): ProviderConnection {
    try {
      const apiUrl = generationProviderUrl(
        row.protocol,
        row.api_url,
        this.config.get<string>('NB_MODEL_HOSTS_' + row.protocol.toUpperCase()),
      );
      const activeVersion =
        this.config.get<string>('NB_MODEL_KEY_VERSION') ?? '1';
      const encoded = this.config.get<string>('NB_MODEL_KEY_BASE64');
      const previous = this.config.get<string>('NB_MODEL_PREVIOUS_KEYS_JSON');
      const value =
        row.api_key_version === activeVersion
          ? encoded
          : previous
            ? (JSON.parse(previous) as Record<string, string>)[
                row.api_key_version
              ]
            : undefined;
      const key = Buffer.from(value ?? '', 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, row.api_key_nonce);
      decipher.setAuthTag(row.api_key_tag);
      const apiKey = Buffer.concat([
        decipher.update(row.api_key_ciphertext),
        decipher.final(),
      ]).toString('utf8');
      if (!apiKey) throw new Error('Empty key');
      return { apiUrl, apiKey };
    } catch (error) {
      if (error instanceof BadRequestException)
        throw new ServiceUnavailableException('MODEL_PROVIDER_URL_UNAVAILABLE');
      throw new ServiceUnavailableException('MODEL_PROVIDER_KEY_UNAVAILABLE');
    }
  }

  async connection(providerId: string, version: number, protocol: string) {
    return this.read(async () => {
      const [rows] = await this.db.connection.execute<ConnectionRow[]>(
        `SELECT ${columns} FROM providers WHERE id = ? AND version = ?
         UNION ALL SELECT ${columns} FROM provider_connection_versions WHERE provider_id = ? AND version = ?`,
        [providerId, version, providerId, version],
      );
      const row = rows[0];
      if (!row || row.protocol !== protocol)
        throw new ServiceUnavailableException(
          'MODEL_PROVIDER_VERSION_UNAVAILABLE',
        );
      return this.decrypt(row);
    });
  }
}

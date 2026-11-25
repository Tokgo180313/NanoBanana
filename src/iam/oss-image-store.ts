import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Credential, { Config } from '@alicloud/credentials';
import OSS from 'ali-oss';
import { createHash } from 'node:crypto';

/** Server-only private object storage. Never expose SDK responses or credentials. */
export class OssImageStore {
  readonly prefix: string;
  private readonly options: Pick<OSS.Options, 'bucket' | 'region' | 'endpoint'>;
  private readonly credentials: Credential;

  constructor(config: ConfigService) {
    const bucket = config.get<string>('NB_OSS_BUCKET', '').trim();
    const region = config.get<string>('NB_OSS_REGION', '').trim();
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
      throw new ServiceUnavailableException(
        'NB_OSS_BUCKET_REQUIRED_OR_INVALID',
      );
    if (!/^(oss-)?[a-z][a-z0-9-]+[a-z0-9]$/.test(region))
      throw new ServiceUnavailableException(
        'NB_OSS_REGION_REQUIRED_OR_INVALID',
      );
    const endpoint = config.get<string>('NB_OSS_ENDPOINT', '').trim();
    if (endpoint) {
      let url: URL;
      try {
        url = new URL(endpoint);
      } catch {
        throw new ServiceUnavailableException('NB_OSS_ENDPOINT_INVALID');
      }
      if (
        url.protocol !== 'https:' ||
        !url.hostname.endsWith('.aliyuncs.com') ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw new ServiceUnavailableException('NB_OSS_ENDPOINT_INVALID');
    }
    this.options = {
      bucket,
      region: region.startsWith('oss-') ? region : `oss-${region}`,
      ...(endpoint ? { endpoint } : {}),
    };
    this.prefix = config
      .get<string>('NB_OSS_PREFIX', 'nanobanana/images')
      .trim()
      .replace(/^\/+|\/+$/g, '');
    this.validateKey(this.prefix);

    const mode = config.get<string>('NB_OSS_AUTH_MODE', 'access_key');
    if (mode === 'default') {
      // The official chain supports ECS roles and OIDC, including token refresh.
      this.credentials = new Credential();
    } else if (mode === 'access_key') {
      const accessKeyId = config.get<string>('ALIBABA_CLOUD_ACCESS_KEY_ID', '');
      const accessKeySecret = config.get<string>(
        'ALIBABA_CLOUD_ACCESS_KEY_SECRET',
        '',
      );
      const securityToken = config.get<string>(
        'ALIBABA_CLOUD_SECURITY_TOKEN',
        '',
      );
      if (!accessKeyId || !accessKeySecret)
        throw new ServiceUnavailableException('OSS_CREDENTIALS_REQUIRED');
      this.credentials = new Credential(
        new Config({
          type: securityToken ? 'sts' : 'access_key',
          accessKeyId,
          accessKeySecret,
          ...(securityToken ? { securityToken } : {}),
        }),
      );
    } else {
      throw new ServiceUnavailableException('NB_OSS_AUTH_MODE_INVALID');
    }
  }

  private validateKey(key: string) {
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(key) ||
      key.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new ServiceUnavailableException('INVALID_OSS_STORAGE_KEY');
  }

  private async client() {
    // Re-resolve before each operation so the provider can refresh temporary
    // credentials; an expired client is never cached across requests.
    const credential = await this.credentials.getCredential();
    if (!credential.accessKeyId || !credential.accessKeySecret)
      throw new Error('OSS_CREDENTIALS_UNAVAILABLE');
    return new OSS({
      ...this.options,
      accessKeyId: credential.accessKeyId,
      accessKeySecret: credential.accessKeySecret,
      ...(credential.securityToken
        ? { stsToken: credential.securityToken }
        : {}),
      authorizationV4: true,
      secure: true,
      timeout: 30000,
    });
  }

  async put(key: string, bytes: Buffer, mime: string, hash: string) {
    this.validateKey(key);
    try {
      const client = await this.client();
      await client.put(key, bytes, {
        mime,
        headers: {
          'x-oss-object-acl': 'private',
          'x-oss-meta-sha256': hash,
          // OSS rejects a corrupt upload before accepting the object.
          'Content-MD5': createHash('md5').update(bytes).digest('base64'),
        },
      });
    } catch {
      throw new ServiceUnavailableException('OSS_IMAGE_WRITE_FAILED');
    }
  }

  async read(key: string): Promise<Buffer> {
    this.validateKey(key);
    try {
      const client = await this.client();
      const result = await client.get(key);
      if (!Buffer.isBuffer(result.content)) throw new Error();
      return result.content;
    } catch {
      throw new ServiceUnavailableException('OSS_IMAGE_READ_FAILED');
    }
  }

  async delete(key: string) {
    this.validateKey(key);
    try {
      const client = await this.client();
      await client.delete(key);
    } catch {
      throw new ServiceUnavailableException('OSS_IMAGE_DELETE_FAILED');
    }
  }
}

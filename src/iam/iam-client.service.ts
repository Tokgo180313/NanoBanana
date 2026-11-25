import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export interface IamContext {
  token: string;
  tenant: number;
  user: number;
  subject: string;
  csrf: string;
  permissions: string[];
  sessionHash: string;
}
@Injectable()
export class IamClient {
  constructor(private readonly config: ConfigService) {}
  async invoke(path: string, token: string, body?: unknown): Promise<any> {
    let response: Response;
    try {
      response = await fetch(
        this.config.get('IAM_URL', 'http://127.0.0.1:18080') + '/api/v1' + path,
        {
          method: body ? 'POST' : 'GET',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(4000),
          redirect: 'error',
        },
      );
    } catch {
      throw new ServiceUnavailableException('IAM_UNAVAILABLE');
    }
    if (response.status === 401)
      throw new UnauthorizedException('SESSION_EXPIRED');
    if (response.status === 403) {const detail=await response.json().catch(()=>({}));throw new ForbiddenException(detail.code==='APPLICATION_ACCESS_DENIED'?'APPLICATION_ACCESS_DENIED':'IAM_ACCESS_DENIED');}
    if (!response.ok)
      throw new ServiceUnavailableException('IAM_REQUEST_REJECTED');
    try {
      return await response.json();
    } catch {
      throw new ServiceUnavailableException('IAM_INVALID_RESPONSE');
    }
  }
  request(type: string, key: string | null, action: string) {
    return {
      appCode: 'image-workbench',
      resource: { type, ...(key ? { key } : {}) },
      action,
    };
  }
  async require(
    ctx: IamContext,
    type: string,
    key: string | null,
    action: string,
  ) {
    const d = await this.invoke(
      '/authz/check',
      ctx.token,
      this.request(type, key, action),
    );
    if (d.allowed !== true)
      throw new ForbiddenException('RESOURCE_ACCESS_DENIED');
    return d;
  }
  async register(ctx: IamContext, type: string, key: string) {
    return this.invoke('/resources', ctx.token, {
      appCode: 'image-workbench',
      resourceType: type,
      resourceKey: key,
      securityLevel: 'NORMAL',
    });
  }
  async batch(ctx: IamContext, type: string, keys: string[], action: string) {
    const result: boolean[] = [];
    for (let i = 0; i < keys.length; i += 100) {
      const part = keys.slice(i, i + 100);
      const decisions = await this.invoke('/authz/batch-check', ctx.token, {
        checks: part.map((key) => this.request(type, key, action)),
      });
      if (!Array.isArray(decisions) || decisions.length !== part.length)
        throw new ServiceUnavailableException('IAM_INVALID_BATCH');
      result.push(...decisions.map((d) => d.allowed === true));
    }
    return result;
  }
}

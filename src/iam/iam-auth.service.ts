import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Request, Response } from 'express';
import { IamDb } from './iam-db.service';
import { IamClient, type IamContext } from './iam-client.service';
import { workbenchOrigins } from './workbench-origins';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const sessionCookie = 'nb_iam_session';
export function cookie(req: Request, name: string) {
  const pair = (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + '='));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
@Injectable()
export class IamAuth {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  constructor(
    private readonly config: ConfigService,
    private readonly db: IamDb,
    private readonly iam: IamClient,
  ) {
    this.jwks = createRemoteJWKSet(
      new URL(
        config.get(
          'OIDC_JWKS',
          'http://localhost:8180/realms/nexus/protocol/openid-connect/certs',
        ),
      ),
    );
  }
  get origin() {
    return this.origins[0];
  }
  get origins() {
    return workbenchOrigins(
      this.config.get('WORKBENCH_ORIGIN', 'http://localhost:5174'),
      this.config.get('WORKBENCH_ORIGINS', ''),
    );
  }
  originFor(req?: Request) {
    // Vite forwards the original browser host. Never turn an arbitrary Host or
    // forwarded header into a redirect: only exact configured origins qualify.
    const hosts = [req?.headers['x-forwarded-host'], req?.headers.host]
      .filter((value): value is string => typeof value === 'string')
      .flatMap((value) => value.split(',').map((host) => host.trim()));
    return (
      this.origins.find((origin) => hosts.includes(new URL(origin).host)) ||
      this.origin
    );
  }
  private browserIssuer(origin: string) {
    const path = this.config.get<string>('OIDC_BROWSER_PATH', '');
    if (!path) return this.issuer;
    if (
      !/^\/realms\/[a-zA-Z0-9_-]+$/.test(path) ||
      path !== new URL(this.issuer).pathname
    )
      throw new ServiceUnavailableException('INVALID_OIDC_BROWSER_PATH');
    return origin + path;
  }
  get issuer() {
    return this.config.get('OIDC_ISSUER', 'http://localhost:8180/realms/nexus');
  }
  private key() {
    const key = Buffer.from(
      this.config.getOrThrow<string>('IAM_SESSION_KEY'),
      'base64',
    );
    if (key.length !== 32)
      throw new ServiceUnavailableException('INVALID_SESSION_KEY');
    return key;
  }
  seal(value: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    return Buffer.concat([
      iv,
      cipher.update(value, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64');
  }
  open(value: string) {
    const bytes = Buffer.from(value, 'base64');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      bytes.subarray(0, 12),
    );
    decipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([
      decipher.update(bytes.subarray(12, -16)),
      decipher.final(),
    ]).toString('utf8');
  }
  private options() {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: '/api',
      maxAge: 300000,
    };
  }
  async login(res: Response, req?: Request) {
    const origin = this.originFor(req);
    const previous = req ? cookie(req, sessionCookie) : '';
    if (previous)
      await this.db
        .collection('iam_sessions')
        .deleteOne({ id_hash: hash(previous) });
    res.clearCookie(sessionCookie, { ...this.options(), maxAge: undefined });
    const state = randomBytes(32).toString('base64url'),
      browser = randomBytes(32).toString('base64url'),
      verifier = randomBytes(32).toString('base64url'),
      nonce = randomBytes(24).toString('base64url');
    await this.db.collection('iam_login_states').insertOne({
      state_hash: hash(state + browser),
      verifier_cipher: this.seal(verifier),
      nonce,
      origin,
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
      created_at: new Date(),
    });
    res.cookie('nb_iam_login', browser, this.options());
    const p = new URLSearchParams({
      client_id: 'image-workbench',
      response_type: 'code',
      redirect_uri: origin + '/api/auth/callback',
      scope: 'openid profile iam.decide',
      state,
      nonce,
      code_challenge: hashChallenge(verifier),
      code_challenge_method: 'S256',
    });
    if (req?.query.reauth === '1') {
      p.set('prompt', 'login');
      p.set('max_age', '0');
    }
    res.redirect(
      this.browserIssuer(origin) + '/protocol/openid-connect/auth?' + p,
    );
  }
  async callback(req: Request, res: Response) {
    const state = String(req.query.state || ''),
      code = String(req.query.code || ''),
      browser = cookie(req, 'nb_iam_login');
    if (!state || !code || !browser)
      throw new BadRequestException('INVALID_LOGIN_STATE');
    const stateHash = hash(state + browser);
    // Atomic consumption prevents concurrent callback replay, independent of TTL cleanup.
    const record = await this.db
      .collection('iam_login_states')
      .findOneAndDelete({
        state_hash: stateHash,
        expires_at: { $gt: new Date() },
      });
    if (!record) throw new BadRequestException('EXPIRED_LOGIN_STATE');
    const origin = record.origin || this.origin;
    if (
      !this.origins.includes(origin) ||
      (record.origin && this.originFor(req) !== origin)
    )
      throw new BadRequestException('LOGIN_ORIGIN_MISMATCH');
    res.clearCookie('nb_iam_login', this.options());
    const token = await this.exchange(
      code,
      this.open(record.verifier_cipher),
      origin,
    );
    let id: JWTPayload;
    try {
      ({ payload: id } = await jwtVerify(token.id_token, this.jwks, {
        issuer: this.issuer,
        audience: 'image-workbench',
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'sub', 'nonce'],
      }));
    } catch {
      throw new UnauthorizedException('INVALID_IDENTITY_TOKEN');
    }
    if (id.nonce !== record.nonce)
      throw new UnauthorizedException('NONCE_MISMATCH');
    const claims = await this.verifyAccess(token.access_token);
    if (id.sub !== claims.sub)
      throw new UnauthorizedException('SUBJECT_MISMATCH');
    await this.iam.invoke(
      '/me/application-access?appCode=image-workbench',
      token.access_token,
    );
    await this.iam.invoke('/me', token.access_token);
    const session = randomBytes(32).toString('base64url'),
      csrf = randomBytes(24).toString('base64url');
    await this.db.collection('iam_sessions').insertOne({
      id_hash: hash(session),
      token_cipher: this.seal(token.access_token),
      id_token_cipher: this.seal(token.id_token),
      csrf_token: csrf,
      origin,
      expires_at: new Date(Number(claims.exp) * 1000),
      created_at: new Date(),
    });
    res.cookie(sessionCookie, session, {
      ...this.options(),
      maxAge: Math.max(0, Number(claims.exp) * 1000 - Date.now()),
    });
    res.redirect(origin + '/#/image-generation');
  }
  private async exchange(code: string, verifier: string, origin = this.origin) {
    try {
      const response = await fetch(
        this.issuer + '/protocol/openid-connect/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: 'image-workbench',
            client_secret: this.config.getOrThrow('OIDC_CLIENT_SECRET'),
            redirect_uri: origin + '/api/auth/callback',
            code,
            code_verifier: verifier,
          }),
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error();
      return (await response.json()) as any;
    } catch {
      throw new UnauthorizedException('OIDC_EXCHANGE_FAILED');
    }
  }
  async verifyAccess(token: string) {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: 'iam-api',
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'sub', 'tenant_id'],
      });
      if (
        payload.azp !== 'image-workbench' ||
        !String(payload.scope || '')
          .split(' ')
          .includes('iam.decide')
      )
        throw new Error();
      return payload;
    } catch {
      throw new UnauthorizedException('INVALID_ACCESS_TOKEN');
    }
  }
  async context(req: Request, mutation = false): Promise<IamContext> {
    const raw = cookie(req, sessionCookie);
    if (!raw || raw.length > 100)
      throw new UnauthorizedException('LOGIN_REQUIRED');
    const sessionHash = hash(raw);
    const session = await this.db.collection('iam_sessions').findOne({
      id_hash: sessionHash,
      expires_at: { $gt: new Date() },
    });
    if (!session) throw new UnauthorizedException('SESSION_EXPIRED');
    let token: string;
    try {
      token = this.open(session.token_cipher);
    } catch {
      throw new UnauthorizedException('INVALID_SESSION');
    }
    const claims = await this.verifyAccess(token);
    if (mutation) {
      if (
        !this.origins.includes(String(req.headers.origin || '')) ||
        (session.origin && req.headers.origin !== session.origin) ||
        !equal(String(req.headers['x-csrf-token'] || ''), session.csrf_token)
      )
        throw new ForbiddenException('CSRF_REJECTED');
    }
    try {
      await this.iam.invoke(
        '/me/application-access?appCode=image-workbench',
        token,
      );
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof UnauthorizedException
      )
        await this.db
          .collection('iam_sessions')
          .deleteOne({ id_hash: sessionHash });
      throw error;
    }
    const me = await this.iam.invoke('/me', token);
    const permissions = await this.iam.invoke(
      '/me/permissions?appCode=image-workbench',
      token,
    );
    if (!Array.isArray(permissions))
      throw new ServiceUnavailableException('IAM_INVALID_PERMISSIONS');
    return {
      token,
      tenant: Number(me.tenantId),
      user: Number(me.userId),
      subject: String(claims.sub),
      csrf: session.csrf_token,
      permissions,
      sessionHash,
    };
  }
  async logout(req: Request, res: Response) {
    const ctx = await this.context(req, true);
    const stored = await this.db
      .collection('iam_sessions')
      .findOne({ id_hash: ctx.sessionHash });
    const origin =
      stored?.origin && this.origins.includes(stored.origin)
        ? stored.origin
        : this.originFor(req);
    const result = await this.iam.invoke('/me/logout-current', ctx.token, {});
    if (result.loggedOut !== true)
      throw new ServiceUnavailableException('LOGOUT_INCOMPLETE');
    await this.db
      .collection('iam_sessions')
      .deleteOne({ id_hash: ctx.sessionHash });
    res.clearCookie(sessionCookie, { ...this.options(), maxAge: undefined });
    const state = randomBytes(32).toString('base64url');
    res.cookie('nb_logout_state', state, this.options());
    const params = new URLSearchParams({
      client_id: 'image-workbench',
      post_logout_redirect_uri: origin + '/api/auth/callback',
      state,
    });
    if (stored?.id_token_cipher)
      params.set('id_token_hint', this.open(stored.id_token_cipher));
    res.setHeader('Cache-Control', 'no-store');
    return {
      loggedOut: true,
      logoutUrl:
        this.browserIssuer(origin) +
        '/protocol/openid-connect/logout?' +
        params,
    };
  }
  logoutCallback(req: Request, res: Response) {
    const state = String(req.query.state || ''),
      expected = cookie(req, 'nb_logout_state');
    if (req.query.code || !state || !expected || !equal(state, expected))
      return false;
    res.clearCookie('nb_logout_state', {
      ...this.options(),
      maxAge: undefined,
    });
    res.redirect(this.originFor(req) + '/#/login?loggedOut=1');
    return true;
  }
}
function hashChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

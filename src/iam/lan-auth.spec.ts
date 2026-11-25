import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';
import { IamAuth, sessionCookie } from './iam-auth.service';
import { workbenchOrigins } from './workbench-origins';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));
const local = 'http://localhost:5274';
const lan = 'http://192.168.1.178:5274';
const issuer = 'http://localhost:8180/realms/nexus';

function setup() {
  const config = new ConfigService({
    WORKBENCH_ORIGIN: local,
    WORKBENCH_ORIGINS: lan,
    OIDC_BROWSER_PATH: '/realms/nexus',
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_SECRET: 'test-only',
    IAM_SESSION_KEY: Buffer.alloc(32, 7).toString('base64'),
  });
  config.skipProcessEnv = true;
  const states = {
    insertOne: jest
      .fn<Promise<void>, [Record<string, unknown>]>()
      .mockResolvedValue(undefined),
    findOneAndDelete: jest.fn(),
  };
  const sessions = {
    insertOne: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
  };
  const db = {
    collection: jest.fn((name: string) =>
      name === 'iam_login_states' ? states : sessions,
    ),
  };
  const iam = {
    invoke: jest.fn((path: string) => {
      if (path === '/me') return Promise.resolve({ tenantId: 1, userId: 5 });
      if (path.includes('permissions'))
        return Promise.resolve(['image:task:create']);
      if (path.includes('logout-current'))
        return Promise.resolve({ loggedOut: true });
      return Promise.resolve({ allowed: true });
    }),
  };
  const auth = new IamAuth(config, db as never, iam as never);
  const response = {
    cookie: jest.fn<void, [string, string, unknown?]>(),
    clearCookie: jest.fn(),
    redirect: jest.fn<void, [string]>(),
    setHeader: jest.fn(),
  };
  const request = (origin = lan) => ({
    headers: {
      host: '127.0.0.1:3100',
      'x-forwarded-host': new URL(origin).host,
      origin,
      'x-csrf-token': 'csrf',
      cookie: '',
    },
    query: {} as Record<string, string>,
  });
  return { auth, states, sessions, response, request };
}

describe('LAN origin handling without weakening session and OIDC checks', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('normalizes exact origins and rejects wildcards or path/query injection', () => {
    expect(workbenchOrigins(local, `${lan}, ${local}/`)).toEqual([local, lan]);
    for (const value of [
      '*',
      'http://example.test/path',
      'https://user:pass@example.test',
      'http://example.test?next=evil',
    ])
      expect(() => workbenchOrigins(value)).toThrow('INVALID_WORKBENCH_ORIGIN');
  });

  it('never redirects to an arbitrary forwarded Host', () => {
    const { auth } = setup();
    expect(
      auth.originFor({
        headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' },
      } as never),
    ).toBe(local);
  });

  it.each([local, lan])(
    'binds the login state, cookie flow and callback to %s',
    async (origin) => {
      const { auth, states, response, request } = setup();
      await auth.login(response as never, request(origin) as never);
      const destination = new URL(response.redirect.mock.calls[0][0]);
      expect(destination.origin).toBe(origin);
      expect(destination.pathname).toBe(
        '/realms/nexus/protocol/openid-connect/auth',
      );
      expect(destination.searchParams.get('redirect_uri')).toBe(
        origin + '/api/auth/callback',
      );
      expect(destination.searchParams.get('code_challenge_method')).toBe(
        'S256',
      );
      expect(states.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ origin }),
      );
    },
  );

  it('uses the original LAN callback for code exchange while validating the unchanged canonical issuer', async () => {
    const { auth, states, sessions, response, request } = setup();
    await auth.login(response as never, request() as never);
    const stateRecord = states.insertOne.mock.calls[0][0];
    states.findOneAndDelete.mockResolvedValueOnce(stateRecord);
    const browser = response.cookie.mock.calls.find(
      (call) => call[0] === 'nb_iam_login',
    )![1];
    const destination = new URL(response.redirect.mock.calls[0][0]);
    const req = request();
    req.query = {
      state: destination.searchParams.get('state')!,
      code: 'test-code',
    };
    req.headers.cookie = 'nb_iam_login=' + browser;
    const claims = {
      sub: 'user',
      exp: Math.floor(Date.now() / 1000) + 300,
      tenant_id: 1,
      azp: 'image-workbench',
      scope: 'iam.decide',
    };
    jest
      .mocked(jwtVerify)
      .mockResolvedValueOnce({
        payload: { ...claims, nonce: stateRecord.nonce },
        protectedHeader: { alg: 'RS256' },
      } as never)
      .mockResolvedValueOnce({
        payload: claims,
        protectedHeader: { alg: 'RS256' },
      } as never);
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id_token: 'id-test', access_token: 'access-test' }),
        ),
      );
    await auth.callback(req as never, response as never);
    expect(fetchMock.mock.calls[0][0]).toBe(
      issuer + '/protocol/openid-connect/token',
    );
    const body = fetchMock.mock.calls[0][1]!.body as URLSearchParams;
    expect(body.get('redirect_uri')).toBe(lan + '/api/auth/callback');
    expect(jwtVerify).toHaveBeenNthCalledWith(
      1,
      'id-test',
      undefined,
      expect.objectContaining({ issuer }),
    );
    expect(sessions.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ origin: lan }),
    );
    expect(response.redirect).toHaveBeenLastCalledWith(
      lan + '/#/image-generation',
    );
  });

  it('rejects a callback arriving through a different configured origin', async () => {
    const { auth, states, response, request } = setup();
    await auth.login(response as never, request() as never);
    states.findOneAndDelete.mockResolvedValueOnce(
      states.insertOne.mock.calls[0][0],
    );
    const req = request(local);
    req.query = { state: 'state', code: 'code' };
    req.headers.cookie = 'nb_iam_login=browser';
    await expect(
      auth.callback(req as never, response as never),
    ).rejects.toThrow('LOGIN_ORIGIN_MISMATCH');
  });

  it.each([
    [lan, 'csrf', true],
    [lan, 'wrong', false],
    ['http://evil.example', 'csrf', false],
    [local, 'csrf', false],
  ])(
    'keeps origin and CSRF checks for mutation from %s with token %s',
    async (origin, csrf, allowed) => {
      const { auth, sessions, request } = setup();
      sessions.findOne.mockResolvedValue({
        token_cipher: 'test',
        csrf_token: 'csrf',
        origin: lan,
      });
      jest.spyOn(auth, 'open').mockReturnValue('token');
      jest.spyOn(auth, 'verifyAccess').mockResolvedValue({ sub: 'user' });
      const req = request();
      req.headers.origin = origin;
      req.headers['x-csrf-token'] = csrf;
      req.headers.cookie = sessionCookie + '=opaque';
      if (allowed)
        await expect(auth.context(req as never, true)).resolves.toMatchObject({
          tenant: 1,
          user: 5,
        });
      else
        await expect(auth.context(req as never, true)).rejects.toThrow(
          'CSRF_REJECTED',
        );
    },
  );

  it('preserves sessions created before origin binding was introduced', async () => {
    const { auth, sessions, request } = setup();
    sessions.findOne.mockResolvedValue({
      token_cipher: 'test',
      csrf_token: 'csrf',
    });
    jest.spyOn(auth, 'open').mockReturnValue('token');
    jest.spyOn(auth, 'verifyAccess').mockResolvedValue({ sub: 'user' });
    const req = request(local);
    req.headers.cookie = sessionCookie + '=opaque';
    await expect(auth.context(req as never, true)).resolves.toMatchObject({
      tenant: 1,
    });
  });

  it('keeps LAN logout and its state-checked callback on the LAN origin', async () => {
    const { auth, sessions, response, request } = setup();
    sessions.findOne.mockResolvedValue({
      token_cipher: 'test',
      csrf_token: 'csrf',
      origin: lan,
    });
    jest.spyOn(auth, 'open').mockReturnValue('token');
    jest.spyOn(auth, 'verifyAccess').mockResolvedValue({ sub: 'user' });
    const req = request();
    req.headers.cookie = sessionCookie + '=opaque';
    const result = await auth.logout(req as never, response as never);
    const destination = new URL(result.logoutUrl);
    expect(destination.origin).toBe(lan);
    expect(destination.searchParams.get('post_logout_redirect_uri')).toBe(
      lan + '/api/auth/callback',
    );
    const state = destination.searchParams.get('state')!;
    req.query = { state };
    req.headers.cookie = 'nb_logout_state=' + state;
    expect(auth.logoutCallback(req as never, response as never)).toBe(true);
    expect(response.redirect).toHaveBeenLastCalledWith(
      lan + '/#/login?loggedOut=1',
    );
  });
});

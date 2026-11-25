import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPublicIdpPath, rewriteIdpText } from '../dev/idp-proxy.ts'

test('LAN IdP pages rewrite absolute forms, redirects and escaped JS URLs while preserving realm and assets', () => {
  const input =
    '<form action="http://localhost:8180/realms/nexus/login-actions/authenticate?code=test"><img src="/resources/logo.png"></form>'
  const actual = rewriteIdpText(input, 'http://192.168.1.178:5274', [
    'http://localhost:8180',
  ])
  assert.ok(
    actual.includes(
      'action="http://192.168.1.178:5274/realms/nexus/login-actions/authenticate?code=test"',
    ),
  )
  assert.ok(actual.includes('src="/resources/logo.png"'))
  const script = 'http:\\/\\/localhost:8180\\/realms\\/nexus'
  assert.equal(
    rewriteIdpText(script, 'http://192.168.1.178:5274', [
      'http://localhost:8180',
    ]),
    'http:\\/\\/192.168.1.178:5274\\/realms\\/nexus',
  )
})

test('public IdP proxy excludes admin/master endpoints and encoded path traversal', () => {
  for (const path of [
    '/admin/realms/nexus',
    '/realms/master',
    '/resources/../../admin',
    '/resources/%2e%2e/%2e%2e/admin',
    '/resources/%252e%252e/admin',
    '/resources/..%5cadmin',
    '/realms/nexus/../master',
    '/resources/..;/admin',
  ])
    assert.equal(isPublicIdpPath(path), false, path)
  assert.equal(
    isPublicIdpPath('/realms/nexus/protocol/openid-connect/auth?state=test'),
    true,
  )
  assert.equal(
    isPublicIdpPath('/resources/version/login/theme/style.css'),
    true,
  )
})

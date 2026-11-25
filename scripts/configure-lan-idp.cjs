/** Add only exact application callbacks; never recreate the realm or grant roles. */
require('dotenv').config({ path: ['.env.iam', '.env'], quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const { workbenchOrigins } = require('../dist-iam/iam/workbench-origins');

async function main() {
  const root = path.resolve(__dirname, '../../../Nexus_IAM');
  const origins = workbenchOrigins(
    process.env.WORKBENCH_ORIGIN || 'http://localhost:5274',
    process.env.WORKBENCH_ORIGINS || '',
  );
  const values = dotenv.parse(await fs.readFile(path.join(root, '.env')));
  if (!values.IDP_ADMIN_PASSWORD)
    throw new Error('IDP_ADMIN_CREDENTIAL_NOT_CONFIGURED');
  const base = 'http://localhost:8180';
  const login = await fetch(
    base + '/realms/master/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: 'admin',
        password: values.IDP_ADMIN_PASSWORD,
      }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    },
  );
  if (!login.ok) throw new Error('IDP_ADMIN_LOGIN_FAILED');
  const token = (await login.json()).access_token;
  const headers = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
  };
  const response = await fetch(
    base + '/admin/realms/nexus/clients?clientId=image-workbench',
    { headers, signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok) throw new Error('IDP_CLIENT_LOOKUP_FAILED');
  const clients = await response.json();
  const client = clients.find((value) => value.clientId === 'image-workbench');
  if (!client) throw new Error('IDP_CLIENT_NOT_FOUND');
  const callbacks = origins.map((origin) => origin + '/api/auth/callback');
  const updated = {
    ...client,
    redirectUris: [
      ...new Set([...(client.redirectUris || []), ...callbacks]),
    ].sort(),
    webOrigins: [...new Set([...(client.webOrigins || []), ...origins])].sort(),
  };
  console.log(
    JSON.stringify({
      application: 'image-workbench',
      exactOrigins: origins,
      apply: process.argv.includes('--apply'),
    }),
  );
  if (!process.argv.includes('--apply')) return;
  const realmPath = path.join(root, 'deploy/generated/realm.json');
  const realm = JSON.parse(await fs.readFile(realmPath, 'utf8'));
  const entry = realm.clients.find(
    (value) => value.clientId === 'image-workbench',
  );
  if (!entry) throw new Error('IDP_PERSISTED_CLIENT_NOT_FOUND');
  const result = await fetch(
    base + '/admin/realms/nexus/clients/' + encodeURIComponent(client.id),
    {
      method: 'PUT',
      headers,
      body: JSON.stringify(updated),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!result.ok) throw new Error('IDP_CLIENT_UPDATE_FAILED');
  entry.redirectUris = updated.redirectUris;
  entry.webOrigins = updated.webOrigins;
  const temp = realmPath + '.lan-' + process.pid + '.tmp';
  try {
    await fs.writeFile(temp, JSON.stringify(realm, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    await fs.rename(temp, realmPath);
  } finally {
    await fs.unlink(temp).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  const verified = await fetch(
    base + '/admin/realms/nexus/clients/' + encodeURIComponent(client.id),
    { headers, signal: AbortSignal.timeout(10000) },
  );
  if (!verified.ok) throw new Error('IDP_CLIENT_VERIFY_FAILED');
  const value = await verified.json();
  if (
    !callbacks.every((uri) => value.redirectUris.includes(uri)) ||
    !origins.every((origin) => value.webOrigins.includes(origin))
  )
    throw new Error('IDP_CLIENT_VERIFY_FAILED');
  console.log(
    'Exact LAN callbacks verified and persisted; existing realm and permissions preserved.',
  );
}
main().catch((error) => {
  console.error(
    /^IDP_[A-Z0-9_]+$/.test(String(error.message))
      ? error.message
      : 'IDP_LAN_CONFIGURATION_FAILED',
  );
  process.exitCode = 1;
});

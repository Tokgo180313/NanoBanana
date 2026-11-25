const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
require('dotenv').config({ path: '.env.iam' });
const mysql = require('mysql2/promise');
(async () => {
  const db = process.env.NB_DB_NAME || 'nanobanana';
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(db))
    throw Error('Invalid database name');
  const c = await mysql.createConnection({
    host: process.env.NB_DB_HOST || '127.0.0.1',
    port: Number(process.env.NB_DB_PORT || 3306),
    user: process.env.NB_DB_USER,
    password: process.env.NB_DB_PASSWORD,
  });
  try {
    await c.query(
      'CREATE DATABASE IF NOT EXISTS `' + db + '` CHARACTER SET utf8mb4',
    );
    await c.query('USE `' + db + '`');
    await c.query(
      'CREATE TABLE IF NOT EXISTS nb_schema_history(version VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    const [lock] = await c.query(
      "SELECT GET_LOCK('nanobanana_iam_migration',10) AS acquired",
    );
    if (lock[0].acquired !== 1) throw Error('Migration lock unavailable');
    for (const name of fs
      .readdirSync('migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      const sql = fs.readFileSync(path.join('migrations', name), 'utf8'),
        checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const [rows] = await c.execute(
        'SELECT checksum FROM nb_schema_history WHERE version=?',
        [name],
      );
      if (rows.length) {
        if (rows[0].checksum !== checksum)
          throw Error('Migration checksum mismatch: ' + name);
        continue;
      }
      for (const statement of sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        await c.query(statement);
      await c.execute(
        'INSERT INTO nb_schema_history(version,checksum) VALUES (?,?)',
        [name, checksum],
      );
      console.log('Applied ' + name);
    }
  } finally {
    await c.query("SELECT RELEASE_LOCK('nanobanana_iam_migration')");
    await c.end();
  }
})().catch((e) => {
  console.error('Migration failed: ' + e.message);
  process.exitCode = 1;
});

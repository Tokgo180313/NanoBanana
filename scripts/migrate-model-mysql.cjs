const { readdir, readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { config } = require('dotenv');
const { createConnection } = require('mysql2/promise');

const root = resolve(__dirname, '..');
config({
  path: [resolve(root, '.env.iam'), resolve(root, '.env')],
  quiet: true,
});

async function migrate() {
  const uri = process.env.NB_MYSQL_URI;
  if (!uri) throw new Error('NB_MYSQL_URI is required');

  const connection = await createConnection({
    uri,
    multipleStatements: true,
    connectTimeout: 5000,
  });

  try {
    const [[{ lockName }]] = await connection.query(
      "SELECT CONCAT('nb:mysql', SHA2(DATABASE(), 224)) AS lockName",
    );
    const [[{ acquired }]] = await connection.query(
      'SELECT GET_LOCK(?, 10) AS acquired',
      [lockName],
    );
    if (acquired !== 1)
      throw new Error('Could not acquire the MySQL migration lock');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS model_schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
    const [applied] = await connection.query(
      'SELECT name FROM model_schema_migrations',
    );
    const directory = resolve(root, 'migrations/model-management');
    const files = (await readdir(directory))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (applied.some(({ name }) => name === file)) continue;
      await connection.query(await readFile(resolve(directory, file), 'utf8'));
      await connection.execute(
        'INSERT INTO model_schema_migrations (name) VALUES (?)',
        [file],
      );
      console.log(`Applied ${file}`);
    }
    console.log('Model management MySQL schema is up to date.');
  } finally {
    await connection.end();
  }
}

migrate().catch((error) => {
  console.error(
    `MySQL migration failed: ${
      error.code ??
      (error.message === 'NB_MYSQL_URI is required' ||
      error.message === 'Could not acquire the MySQL migration lock'
        ? error.message
        : 'check the connection and migration configuration')
    }`,
  );
  process.exitCode = 1;
});

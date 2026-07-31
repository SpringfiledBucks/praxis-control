import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Database, Queryable } from './db.js';

type MigrationSource = {
  version: string;
  sql: string;
  checksum: string;
};

export type MigrationState = {
  current: boolean;
  missing: string[];
  changed: string[];
  unexpected: string[];
};

async function loadMigrationSources(root: string): Promise<MigrationSource[]> {
  const directory = path.join(root, 'migrations');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  return Promise.all(files.map(async (file) => {
    const sql = await readFile(path.join(directory, file), 'utf8');
    return {
      version: file.replace(/\.sql$/, ''),
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    };
  }));
}

export async function verifyMigrationState(database: Pick<Queryable, 'query'>, root = process.cwd()): Promise<MigrationState> {
  const expected = await loadMigrationSources(root);
  const stored = await database.query<{ version: string; checksum: string }>(
    'SELECT version, checksum FROM governance.schema_migrations ORDER BY version',
  );
  const actual = new Map(stored.rows.map((row) => [row.version, row.checksum]));
  const expectedVersions = new Set(expected.map((migration) => migration.version));
  const missing = expected.filter((migration) => !actual.has(migration.version)).map((migration) => migration.version);
  const changed = expected
    .filter((migration) => actual.has(migration.version) && actual.get(migration.version) !== migration.checksum)
    .map((migration) => migration.version);
  const unexpected = [...actual.keys()].filter((version) => !expectedVersions.has(version));
  return { current: missing.length === 0 && changed.length === 0 && unexpected.length === 0, missing, changed, unexpected };
}

export async function runMigrations(database: Database, root = process.cwd()): Promise<string[]> {
  await database.exec('CREATE SCHEMA IF NOT EXISTS governance');
  await database.exec(`
    CREATE TABLE IF NOT EXISTS governance.schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrations = await loadMigrationSources(root);
  const applied: string[] = [];

  for (const { version, sql, checksum } of migrations) {
    const existing = await database.query<{ checksum: string }>(
      'SELECT checksum FROM governance.schema_migrations WHERE version = $1',
      [version],
    );

    if (existing.rowCount) {
      if (existing.rows[0]?.checksum !== checksum) {
        throw new Error(`已应用迁移 ${version} 的校验和发生变化`);
      }
      continue;
    }

    await database.transaction(async (client) => {
      await client.exec(sql);
      await client.query(
        'INSERT INTO governance.schema_migrations(version, checksum) VALUES ($1, $2)',
        [version, checksum],
      );
      applied.push(version);
    });
  }

  return applied;
}

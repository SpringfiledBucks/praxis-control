import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Database } from './db.js';

export async function runMigrations(database: Database, root = process.cwd()): Promise<string[]> {
  await database.exec('CREATE SCHEMA IF NOT EXISTS governance');
  await database.exec(`
    CREATE TABLE IF NOT EXISTS governance.schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const directory = path.join(root, 'migrations');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  const applied: string[] = [];

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const sql = await readFile(path.join(directory, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
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

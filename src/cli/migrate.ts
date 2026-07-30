import { ensureSeedData } from '../application/bootstrap.js';
import { loadConfig } from '../config.js';
import { createDatabase, type Database } from '../infrastructure/db.js';
import { runMigrations } from '../infrastructure/migrations.js';
import { acquireRuntimeLock } from '../runtime/control.js';

const config = loadConfig();
const runtimeLock = config.databaseMode === 'pglite' ? await acquireRuntimeLock(config.runtimeDir) : undefined;
let database: Database | undefined;
try {
  database = await createDatabase(config);
  const applied = await runMigrations(database);
  await ensureSeedData(database, config.rulesetVersion);
  console.log(applied.length ? `已应用迁移：${applied.join(', ')}` : '数据库结构和基础数据已是最新。');
} finally {
  try {
    if (database) await database.close();
  } finally {
    await runtimeLock?.release();
  }
}

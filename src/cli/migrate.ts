import { ensureSeedData } from '../application/bootstrap.js';
import { loadConfig } from '../config.js';
import { createDatabase } from '../infrastructure/db.js';
import { runMigrations } from '../infrastructure/migrations.js';

const config = loadConfig();
const database = await createDatabase(config);
try {
  const applied = await runMigrations(database);
  await ensureSeedData(database, config.rulesetVersion);
  console.log(applied.length ? `已应用迁移：${applied.join(', ')}` : '数据库结构和基础数据已是最新。');
} finally {
  await database.close();
}

import { ensureSeedData } from '../application/bootstrap.js';
import { loadConfig } from '../config.js';
import { createDatabase, type Database } from '../infrastructure/db.js';
import { acquireRuntimeLock } from '../runtime/control.js';

const config = loadConfig();
const runtimeLock = config.databaseMode === 'pglite' ? await acquireRuntimeLock(config.runtimeDir) : undefined;
let database: Database | undefined;
try {
  database = await createDatabase(config);
  await ensureSeedData(database, config.rulesetVersion);
  console.log(`种子数据已就绪，规则版本：${config.rulesetVersion}`);
} finally {
  try {
    if (database) await database.close();
  } finally {
    await runtimeLock?.release();
  }
}

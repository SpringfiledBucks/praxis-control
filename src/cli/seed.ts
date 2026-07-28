import { ensureSeedData } from '../application/bootstrap.js';
import { loadConfig } from '../config.js';
import { createDatabase } from '../infrastructure/db.js';

const config = loadConfig();
const database = await createDatabase(config);
try {
  await ensureSeedData(database, config.rulesetVersion);
  console.log(`种子数据已就绪，规则版本：${config.rulesetVersion}`);
} finally {
  await database.close();
}

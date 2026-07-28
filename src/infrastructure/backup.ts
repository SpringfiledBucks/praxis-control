import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

export type RestoreSummary = {
  targetDirectory: string;
  backupBytes: number;
  migrations: string[];
  projects: number;
  checkins: number;
};

function contains(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function assertTargetDoesNotExist(targetDirectory: string): Promise<void> {
  try {
    await stat(targetDirectory);
    throw new Error(`恢复目标必须不存在：${targetDirectory}`);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code !== 'ENOENT') throw error;
  }
}

export async function restorePGliteBackup(options: {
  backupFile: string;
  targetDirectory: string;
  sourceDataDirectory: string;
}): Promise<RestoreSummary> {
  const backupFile = path.resolve(options.backupFile);
  const targetDirectory = path.resolve(options.targetDirectory);
  const sourceDataDirectory = path.resolve(options.sourceDataDirectory);

  if (contains(sourceDataDirectory, targetDirectory) || contains(targetDirectory, sourceDataDirectory)) {
    throw new Error('恢复目标必须与当前 PGlite 数据目录相互独立。');
  }
  await assertTargetDoesNotExist(targetDirectory);

  const backupStat = await stat(backupFile);
  if (!backupStat.isFile() || backupStat.size === 0) throw new Error('备份文件不存在、不是普通文件或内容为空。');

  const bytes = new Uint8Array(await readFile(backupFile));
  const restored = await PGlite.create(targetDirectory, { loadDataDir: new Blob([bytes]) });
  try {
    const migrations = await restored.query<{ version: string }>(
      'SELECT version FROM governance.schema_migrations ORDER BY version',
    );
    if (migrations.rows.length === 0) throw new Error('恢复后的数据库缺少迁移记录。');

    const counts = await restored.query<{ projects: number; checkins: number }>(`SELECT
      (SELECT count(*)::int FROM core.projects) AS projects,
      (SELECT count(*)::int FROM decision.daily_checkins) AS checkins`);

    return {
      targetDirectory,
      backupBytes: backupStat.size,
      migrations: migrations.rows.map((row) => row.version),
      projects: Number(counts.rows[0]?.projects ?? 0),
      checkins: Number(counts.rows[0]?.checkins ?? 0),
    };
  } finally {
    await restored.close();
  }
}

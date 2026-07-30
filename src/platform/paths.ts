import os from 'node:os';
import path from 'node:path';

export type AppDirectories = {
  dataDir: string;
  databaseDir: string;
  backupDir: string;
  logDir: string;
  runtimeDir: string;
};

export function resolveAppDirectories(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  homeDir = os.homedir(),
): AppDirectories {
  const configuredDataDir = env.PRAXIS_DATA_DIR?.trim();
  let dataDir: string;

  if (configuredDataDir) {
    dataDir = path.resolve(configuredDataDir);
  } else if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA?.trim() || path.join(homeDir, 'AppData', 'Local');
    dataDir = path.join(localAppData, 'PraxisControl');
  } else {
    const xdgDataHome = env.XDG_DATA_HOME?.trim() || path.join(homeDir, '.local', 'share');
    dataDir = path.join(xdgDataHome, 'praxis-control');
  }

  const runtimeBase = platform === 'win32'
    ? dataDir
    : env.XDG_RUNTIME_DIR?.trim() || env.XDG_STATE_HOME?.trim() || path.join(homeDir, '.local', 'state');
  const runtimeDir = platform === 'win32'
    ? path.join(runtimeBase, 'runtime')
    : path.join(runtimeBase, 'praxis-control');

  return {
    dataDir,
    databaseDir: path.join(dataDir, 'pglite'),
    backupDir: path.join(dataDir, 'backups'),
    logDir: path.join(dataDir, 'logs'),
    runtimeDir,
  };
}

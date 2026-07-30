import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppDirectories } from './paths.js';

describe('resolveAppDirectories', () => {
  it('uses LOCALAPPDATA on Windows', () => {
    const result = resolveAppDirectories({ LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' }, 'win32', 'C:\\Users\\test');
    expect(result.dataDir).toBe(path.join('C:\\Users\\test\\AppData\\Local', 'PraxisControl'));
    expect(result.logDir).toBe(path.join(result.dataDir, 'logs'));
  });

  it('uses XDG directories on Linux', () => {
    const result = resolveAppDirectories({ XDG_DATA_HOME: '/data', XDG_RUNTIME_DIR: '/run/user/1000' }, 'linux', '/home/test');
    expect(result.dataDir).toBe(path.join('/data', 'praxis-control'));
    expect(result.runtimeDir).toBe(path.join('/run/user/1000', 'praxis-control'));
  });
});

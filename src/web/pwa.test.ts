import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA and widget static contracts', () => {
  it('publishes a cross-platform install manifest without prematurely registering a Windows widget', async () => {
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'manifest.webmanifest'), 'utf8')) as Record<string, unknown>;
    expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone', lang: 'zh-CN' });
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest).not.toHaveProperty('widgets');
  });

  it('caches only static shell assets and never caches authenticated API responses', async () => {
    const worker = await readFile(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
    const installSection = worker.slice(0, worker.indexOf("self.addEventListener('install'"));
    expect(installSection).not.toContain('/api/');
    expect(worker).not.toContain('cache.put(');
    expect(worker).toContain("credentials: 'include'");
  });

  it('keeps widget actions as deep links instead of business writes', async () => {
    const template = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'widgets', 'praxis-summary-template.json'), 'utf8')) as { actions: Array<{ type: string; verb: string }> };
    expect(template.actions).toEqual([
      { type: 'Action.Execute', title: '打开工作台', verb: 'open-dashboard' },
      { type: 'Action.Execute', title: '记录决策', verb: 'new-checkin' },
    ]);
  });
});

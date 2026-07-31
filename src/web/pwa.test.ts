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

  it('keeps a complete but inactive Windows widget manifest candidate', async () => {
    const candidate = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'manifest.windows-widget.candidate.webmanifest'), 'utf8')) as {
      widgets: Array<Record<string, unknown>>;
    };
    expect(candidate.widgets).toHaveLength(1);
    const widget = candidate.widgets[0]!;
    expect(widget).toMatchObject({
      tag: 'praxis-summary',
      template: 'praxis-summary',
      ms_ac_template: '/static/widgets/praxis-summary-template.json',
      data: '/api/widgets/summary',
      type: 'application/json',
      auth: true,
      update: 900,
      multiple: false,
    });
    expect(widget.screenshots).toEqual([
      expect.objectContaining({ sizes: '300x304', type: 'image/png', platform: 'Windows' }),
    ]);
  });

  it('provides a transparent 300 by 304 picker preview', async () => {
    const screenshot = await readFile(path.join(process.cwd(), 'public', 'widgets', 'praxis-summary-picker-preview.png'));
    expect(screenshot.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(screenshot.readUInt32BE(16)).toBe(300);
    expect(screenshot.readUInt32BE(20)).toBe(304);
    expect(screenshot[25]).toBe(6);
  });

  it('caches only static shell assets and never caches authenticated API responses', async () => {
    const worker = await readFile(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
    const installSection = worker.slice(0, worker.indexOf("self.addEventListener('install'"));
    expect(installSection).not.toContain('/api/');
    expect(worker).not.toContain('cache.put(');
    expect(worker).toContain("credentials: 'include'");
    expect(worker).toContain("cache: 'no-store'");
    expect(worker).toContain('需登录');
    expect(worker).toContain('离线');
    expect(worker).toContain("caches.match(templateUrl)");
  });

  it('keeps widget actions as deep links instead of business writes', async () => {
    const template = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'widgets', 'praxis-summary-template.json'), 'utf8')) as { actions: Array<{ type: string; verb: string }> };
    expect(template.actions).toEqual([
      { type: 'Action.Execute', title: '打开工作台', verb: 'open-dashboard' },
      { type: 'Action.Execute', title: '记录决策', verb: 'new-checkin' },
    ]);
  });
});

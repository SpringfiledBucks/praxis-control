#!/usr/bin/env -S gjs -m

import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Soup from 'gi://Soup?version=3.0';
import { SUPPORTED_API_VERSION, assertCompatibleMeta, createDashboardViewModel, resolveRuntimeStatePath } from './core.mjs';

const APP_ID = 'io.praxiscontrol.App';

function readRuntimeState() {
  const environment = GLib.get_environ().reduce((result, item) => {
    const separator = item.indexOf('=');
    if (separator > 0) result[item.slice(0, separator)] = item.slice(separator + 1);
    return result;
  }, {});
  const statePath = resolveRuntimeStatePath(environment, GLib.get_home_dir());
  try {
    const [ok, bytes] = GLib.file_get_contents(statePath);
    if (!ok) throw new Error('读取失败');
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error('服务尚未启动。请在项目目录运行：npm run praxis -- start --no-open', { cause: error });
  }
}

class ApiClient {
  constructor(runtime) {
    this.runtime = runtime;
    this.session = new Soup.Session({ timeout: 5 });
  }

  async get(route) {
    return this.#request('GET', route);
  }

  async shutdown() {
    return this.#request('POST', '/api/system/shutdown', { token: this.runtime.shutdownToken });
  }

  #request(method, route, body = null) {
    return new Promise((resolve, reject) => {
      const message = Soup.Message.new(method, `${this.runtime.url}${route}`);
      if (body !== null) {
        message.set_request_body_from_bytes(
          'application/json',
          new GLib.Bytes(new TextEncoder().encode(JSON.stringify(body))),
        );
      }
      this.session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (_session, result) => {
        try {
          const bytes = this.session.send_and_read_finish(result);
          const text = new TextDecoder().decode(bytes.get_data());
          const parsed = text ? JSON.parse(text) : {};
          if (message.status_code < 200 || message.status_code >= 300) {
            throw new Error(parsed.message || `请求失败：HTTP ${message.status_code}`);
          }
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}

const PraxisWindow = GObject.registerClass(
class PraxisWindow extends Adw.ApplicationWindow {
  constructor(application) {
    super({ application, title: 'Praxis Control', default_width: 1040, default_height: 720 });
    this._client = null;
    this._buildUi();
    this.refresh();
  }

  _buildUi() {
    const toolbar = new Adw.ToolbarView();
    const header = new Adw.HeaderBar({ title_widget: new Adw.WindowTitle({ title: '实践控制台', subtitle: 'Praxis Control' }) });
    this._openButton = new Gtk.Button({ label: '打开 Web', sensitive: false });
    this._openButton.connect('clicked', () => this.openWeb());
    const refreshButton = new Gtk.Button({ icon_name: 'view-refresh-symbolic', tooltip_text: '刷新' });
    refreshButton.connect('clicked', () => this.refresh());
    this._shutdownButton = new Gtk.Button({ label: '安全关闭服务', sensitive: false });
    this._shutdownButton.add_css_class('destructive-action');
    this._shutdownButton.connect('clicked', () => this.shutdown());
    header.pack_start(this._openButton);
    header.pack_end(this._shutdownButton);
    header.pack_end(refreshButton);
    toolbar.add_top_bar(header);

    const root = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 18, margin_top: 24, margin_bottom: 32, margin_start: 24, margin_end: 24 });
    this._status = new Adw.Banner({ title: '正在连接本机服务…', revealed: true });
    root.append(this._status);

    const title = new Gtk.Label({ label: '克制地判断，留下可复核的证据。', xalign: 0 });
    title.add_css_class('title-2');
    root.append(title);

    const metrics = new Gtk.FlowBox({ homogeneous: true, min_children_per_line: 2, max_children_per_line: 4, column_spacing: 12, row_spacing: 12, selection_mode: Gtk.SelectionMode.NONE });
    this._activeWip = this._createMetric(metrics, '核心 WIP');
    this._awaitingReview = this._createMetric(metrics, '待结果复盘');
    this._reviewedLast7Days = this._createMetric(metrics, '近 7 日闭环');
    this._graphSummary = this._createMetric(metrics, '图谱');
    root.append(metrics);

    const details = new Adw.PreferencesGroup({ title: '当前状态' });
    this._latestAction = new Adw.ActionRow({ title: '最近行动', subtitle: '服务连接后显示最近行动' });
    details.add(this._latestAction);
    details.add(new Adw.ActionRow({ title: '客户端边界', subtitle: '原生客户端只经版本化 API 访问核心，不直接打开数据库。完整流程可回退到 Web。' }));
    root.append(details);

    const clamp = new Adw.Clamp({ maximum_size: 980, tightening_threshold: 720, child: root });
    toolbar.set_content(new Gtk.ScrolledWindow({ child: clamp }));
    this.set_content(toolbar);
  }

  _createMetric(container, title) {
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8, margin_top: 18, margin_bottom: 18, margin_start: 18, margin_end: 18 });
    const caption = new Gtk.Label({ label: title, xalign: 0 });
    caption.add_css_class('dim-label');
    const value = new Gtk.Label({ label: '—', xalign: 0 });
    value.add_css_class('title-1');
    box.append(caption);
    box.append(value);
    const frame = new Gtk.Frame({ child: box });
    container.append(frame);
    return value;
  }

  async refresh() {
    this._setDisconnected('正在连接本机服务…');
    try {
      const client = new ApiClient(readRuntimeState());
      const meta = assertCompatibleMeta(await client.get('/api/meta'));
      const [dashboard, graph] = await Promise.all([client.get('/api/dashboard'), client.get('/api/graph')]);
      const view = createDashboardViewModel(dashboard, graph);
      this._client = client;
      this._activeWip.label = view.activeWip;
      this._awaitingReview.label = view.awaitingReview;
      this._reviewedLast7Days.label = view.reviewedLast7Days;
      this._graphSummary.label = view.graphSummary;
      this._latestAction.subtitle = view.latestAction;
      this._openButton.sensitive = true;
      this._shutdownButton.sensitive = true;
      this._status.title = `已连接 ${client.runtime.url} · API v${meta.apiVersion}`;
    } catch (error) {
      this._setDisconnected(error.message);
    }
  }

  openWeb() {
    if (!this._client) return;
    const launcher = new Gtk.UriLauncher({ uri: this._client.runtime.url });
    launcher.launch(this, null, (_launcher, result) => {
      try { launcher.launch_finish(result); } catch (error) { this._status.title = `打开 Web 失败：${error.message}`; }
    });
  }

  async shutdown() {
    if (!this._client) return;
    try {
      await this._client.shutdown();
      this._setDisconnected('已提交安全关闭请求。关闭窗口不会被用作服务关闭信号。');
    } catch (error) {
      this._status.title = `关闭请求失败：${error.message}`;
    }
  }

  _setDisconnected(message) {
    this._client = null;
    this._openButton.sensitive = false;
    this._shutdownButton.sensitive = false;
    this._status.title = message;
    for (const label of [this._activeWip, this._awaitingReview, this._reviewedLast7Days, this._graphSummary]) label.label = '—';
    this._latestAction.subtitle = '服务连接后显示最近行动';
  }
});

const smokeTest = ARGV.includes('--smoke-test');
const connectedSmokeTest = ARGV.includes('--smoke-test-connected');
let smokeFailure = null;
const application = new Adw.Application({ application_id: APP_ID, flags: Gio.ApplicationFlags.DEFAULT_FLAGS });
application.connect('activate', (app) => {
  const window = new PraxisWindow(app);
  window.present();
  if (connectedSmokeTest) {
    const deadline = GLib.get_monotonic_time() + 5 * GLib.TIME_SPAN_SECOND;
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
      if (window._client) {
        print('PRAXIS_GUI_SMOKE_CONNECTED');
        app.quit();
        return GLib.SOURCE_REMOVE;
      }
      if (GLib.get_monotonic_time() >= deadline) {
        smokeFailure = `Linux GUI 未在 5 秒内连接 API：${window._status.title}`;
        app.quit();
        return GLib.SOURCE_REMOVE;
      }
      return GLib.SOURCE_CONTINUE;
    });
  } else if (smokeTest) {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => { app.quit(); return GLib.SOURCE_REMOVE; });
  }
});
application.run(ARGV.filter((argument) => !['--smoke-test', '--smoke-test-connected'].includes(argument)));
if (smokeFailure) throw new Error(smokeFailure);

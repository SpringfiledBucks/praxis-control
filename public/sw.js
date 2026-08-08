const STATIC_CACHE = 'praxis-static-v2';
const STATIC_ASSETS = [
  '/static/styles.css',
  '/static/app.js',
  '/static/advisory.js',
  '/static/offline.html',
  '/static/icons/praxis-control.svg',
  '/static/widgets/praxis-summary-template.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('praxis-static-') && name !== STATIC_CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
    await updateInstalledPraxisWidget();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/static/')) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/static/offline.html')));
  }
});

async function updatePraxisWidget(widget) {
  const templateUrl = '/static/widgets/praxis-summary-template.json';
  let templateResponse;
  try {
    templateResponse = await fetch(templateUrl, { cache: 'no-store' });
    if (!templateResponse.ok) throw new Error('widget template fetch failed');
  } catch {
    templateResponse = await caches.match(templateUrl);
  }
  if (!templateResponse?.ok) throw new Error('widget template unavailable');
  const template = await templateResponse.text();
  let summary;
  let serviceStatus;
  try {
    const summaryResponse = await fetch('/api/widgets/summary', { cache: 'no-store', credentials: 'include' });
    if (summaryResponse.ok) {
      summary = await summaryResponse.json();
      serviceStatus = '已连接';
    } else if (summaryResponse.status === 401) {
      summary = {
        mainAction: '需要重新登录',
        capacityText: '打开 Praxis Control 恢复会话',
        reviewText: '—',
        wipText: '—',
      };
      serviceStatus = '需登录';
    } else {
      throw new Error(`widget summary failed: ${summaryResponse.status}`);
    }
  } catch {
    summary = {
      mainAction: '暂时无法连接',
      capacityText: '恢复网络后重新打开小组件',
      reviewText: '—',
      wipText: '—',
    };
    serviceStatus = '离线';
  }
  const data = JSON.stringify({
    ...summary,
    mainAction: summary.mainAction || '尚未记录今日行动',
    serviceStatus,
  });
  await self.widgets.updateByTag(widget.definition.tag, { template, data });
}

async function updateInstalledPraxisWidget() {
  if (!self.widgets) return;
  const widget = await self.widgets.getByTag('praxis-summary');
  if (widget) await updatePraxisWidget(widget);
}

self.addEventListener('widgetinstall', (event) => {
  if (!self.widgets) return;
  event.waitUntil((async () => {
    await updatePraxisWidget(event.widget);
    if (self.registration.periodicSync && 'update' in event.widget.definition) {
      try {
        const tags = await self.registration.periodicSync.getTags();
        if (!tags.includes(event.widget.definition.tag)) {
          await self.registration.periodicSync.register(event.widget.definition.tag, {
            minInterval: event.widget.definition.update,
          });
        }
      } catch (error) {
        console.warn('Praxis widget periodic refresh is unavailable.', error);
      }
    }
  })());
});

self.addEventListener('widgetuninstall', (event) => {
  if (!self.widgets || !self.registration.periodicSync) return;
  if (event.widget.instances.length === 1 && 'update' in event.widget.definition) {
    event.waitUntil(self.registration.periodicSync.unregister(event.widget.definition.tag).catch((error) => {
      console.warn('Praxis widget periodic refresh cleanup failed.', error);
    }));
  }
});

self.addEventListener('widgetresume', (event) => {
  if (!self.widgets) return;
  event.waitUntil(updatePraxisWidget(event.widget));
});

self.addEventListener('periodicsync', (event) => {
  if (!self.widgets || event.tag !== 'praxis-summary') return;
  event.waitUntil(updateInstalledPraxisWidget());
});

self.addEventListener('widgetclick', (event) => {
  if (!self.widgets) return;
  const path = event.action === 'new-checkin' ? '/checkins/new' : '/';
  event.waitUntil(self.clients.openWindow(new URL(path, self.location.origin).href));
});

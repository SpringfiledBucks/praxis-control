const STATIC_CACHE = 'praxis-static-v1';
const STATIC_ASSETS = [
  '/static/styles.css',
  '/static/app.js',
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
  const templateResponse = await fetch('/static/widgets/praxis-summary-template.json', { cache: 'no-store' });
  const summaryResponse = await fetch('/api/widgets/summary', { cache: 'no-store', credentials: 'include' });
  if (!templateResponse.ok) throw new Error('widget template unavailable');
  const template = await templateResponse.text();
  const summary = summaryResponse.ok ? await summaryResponse.json() : {
    mainAction: '需要重新登录',
    capacityText: '打开 Praxis Control 恢复会话',
    reviewText: '—',
    wipText: '—',
  };
  const data = JSON.stringify({
    ...summary,
    mainAction: summary.mainAction || '尚未记录今日行动',
    serviceStatus: summaryResponse.ok ? '已连接' : '需登录',
  });
  await self.widgets.updateByTag(widget.definition.tag, { template, data });
}

self.addEventListener('widgetinstall', (event) => {
  if (!self.widgets) return;
  event.waitUntil(updatePraxisWidget(event.widget));
});

self.addEventListener('widgetresume', (event) => {
  if (!self.widgets) return;
  event.waitUntil(updatePraxisWidget(event.widget));
});

self.addEventListener('widgetclick', (event) => {
  if (!self.widgets) return;
  const path = event.action === 'new-checkin' ? '/checkins/new' : '/';
  event.waitUntil(self.clients.openWindow(path));
});

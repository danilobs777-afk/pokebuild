const CACHE_VERSION = 'v27';
const CACHE = `pokebuild-${CACHE_VERSION}`;
const ASSETS = [
  '.',
  'index.html',
  'css/style.css',
  'js/data.js',
  'js/generation.js',
  'js/ui.js',
  'js/api.js',
  'js/storage.js',
  'js/typeCalc.js',
  'js/analyzer.js',
  'js/builder.js',
  'js/teams.js',
  'js/smogonCalcAdapter.js?v=27',
  'js/dmgCalc.js?v=27',
  'js/app.js',
  'vendor/smogon-calc/data/production.min.js?v=27',
  'vendor/smogon-calc/production.min.js?v=27',
  'favicon.svg',
  'manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const staleCaches = keys.filter(key => key.startsWith('pokebuild-') && key !== CACHE);
    await Promise.all(staleCaches.map(key => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.postMessage({
      type: 'POKEBUILD_SW_ACTIVATED',
      version: CACHE_VERSION,
      isUpdate: staleCaches.length > 0
    }));
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  event.respondWith(cacheFirstAsset(request));
});

async function networkFirstHtml(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    cache.put('index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('index.html')) || Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}

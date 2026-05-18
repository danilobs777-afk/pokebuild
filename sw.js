const CACHE = 'pokebuild-v1';
const ASSETS = [
  '.',
  'index.html',
  'css/style.css',
  'js/data.js',
  'js/api.js',
  'js/storage.js',
  'js/typeCalc.js',
  'js/analyzer.js',
  'js/builder.js',
  'js/teams.js',
  'js/dmgCalc.js',
  'js/app.js',
  'favicon.svg',
  'manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Requisições externas (PokéAPI, Google Fonts) passam direto
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

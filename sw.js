// Country Clash service worker: installable + works offline.
// BUMP the version number whenever you publish changes, so installed copies refresh.
const CACHE = 'country-clash-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'assets/logo.svg', 'assets/favicon.svg', 'css/base.css', 'css/theme.css', 'js/diag.js', 'js/core.js', 'js/loader.js', 'js/questions.js', 'js/game.js', 'js/globe-data.js', 'js/globe.js', 'js/pwa.js', 'js/ui.js', 'js/main.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // map data, statistics and flags go straight to the network
  // newest files first; the cached copy is only used when offline
  e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); } return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});

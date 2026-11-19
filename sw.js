// Country Clash service worker: installable + works offline.
// BUMP the version number whenever you publish changes, so installed copies refresh.
const CACHE = 'country-clash-v3';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'logo.svg', 'favicon.svg', 'base.css', 'theme.css', 'diag.js', 'core.js', 'loader.js', 'questions.js', 'game.js', 'globe-data.js', 'globe.js', 'pwa.js', 'ui.js', 'party.js', 'party.css', 'main.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // map data, statistics and flags go straight to the network
  // newest files first; the cached copy is only used when offline
  e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); } return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});

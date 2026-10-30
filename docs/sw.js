const CACHE = 'pocket-chip-v3';
const ASSETS = ['./', './index.html', './style.css', './app.js', './audio.js', './manifest.webmanifest', './icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(async (names) => {
    await Promise.all(names.filter((name) => name.startsWith('pocket-chip-') && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  }));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).catch((error) => {
    if (event.request.mode === 'navigate') return caches.match(new URL('./index.html', self.registration.scope));
    throw error;
  })));
});

// офлайн-кэш. Стратегия «сначала сеть»: пока интернет есть, игрок всегда получает
// свежие файлы, а кэш выручает только офлайн. Кэш-первым нельзя — обновления не доезжают.
const CACHE = 'fruktolet-v3';
const FILES = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/i18n.js',
  './js/config.js',
  './js/utils.js',
  './js/campaign.js',
  './js/save.js',
  './js/audio.js',
  './js/net.js',
  './js/art.js',
  './js/entities.js',
  './js/game.js',
  './js/vendor/peerjs.min.js',
  './art/hero-body-1.png',
  './art/hero-body-2.png',
  './art/hero-body-3.png',
  './art/hero-body-4.png',
  './art/hero-arm-1.png',
  './art/hero-arm-2.png',
  './art/hero-arm-3.png',
  './art/hero-arm-4.png',
  './art/hero-forearm.png',
  './art/hero-leg.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html'))),
  );
});

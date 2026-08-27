// офлайн-кэш. Стратегия «сначала сеть»: пока интернет есть, игрок всегда получает
// свежие файлы, а кэш выручает только офлайн. Кэш-первым нельзя — обновления не доезжают.
const CACHE = 'fruktolet-v4';
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
  './js/cg.js',
  './js/net.js',
  './js/art.js',
  './js/sprites.js',
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
  './art/sprites/apple.png',
  './art/sprites/avocado.png',
  './art/sprites/banana.png',
  './art/sprites/blueberry.png',
  './art/sprites/carrot.png',
  './art/sprites/cherry.png',
  './art/sprites/coconut.png',
  './art/sprites/corn.png',
  './art/sprites/grape.png',
  './art/sprites/lemon.png',
  './art/sprites/mushroom.png',
  './art/sprites/orange.png',
  './art/sprites/pear.png',
  './art/sprites/pineapple.png',
  './art/sprites/potato.png',
  './art/sprites/strawberry.png',
  './art/sprites/watermelon.png',
  './art/icons/arrow-up.png',
  './art/icons/basket.png',
  './art/icons/blast.png',
  './art/icons/crown.png',
  './art/icons/fast-forward.png',
  './art/icons/fire.png',
  './art/icons/hand.png',
  './art/icons/heart-broken.png',
  './art/icons/heart.png',
  './art/icons/hourglass.png',
  './art/icons/lock.png',
  './art/icons/medal.png',
  './art/icons/pause.png',
  './art/icons/play.png',
  './art/icons/pouch.png',
  './art/icons/shield.png',
  './art/icons/sound-off.png',
  './art/icons/sound-on.png',
  './art/icons/star.png',
  './art/icons/target.png',
  './art/icons/trophy.png',
  './art/icons/warning.png',
  './art/icons/wrench.png',
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

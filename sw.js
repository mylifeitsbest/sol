/* Путь от 1 SOL — офлайн-оболочка.
   Стратегия: страница берётся из сети (чтобы обновления доезжали), статика — из кэша.
   Запросы к api.github.com воркер не трогает вообще. */

const VERSION = 'v4';
const CACHE = 'sol-' + VERSION;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './favicon-32.png',
  './fonts/fonts.css',
  './fonts/manrope-latin.woff2',
  './fonts/manrope-latin-ext.woff2',
  './fonts/manrope-cyrillic.woff2',
  './fonts/manrope-cyrillic-ext.woff2',
  './fonts/jetbrains-mono-latin.woff2',
  './fonts/jetbrains-mono-latin-ext.woff2',
  './fonts/jetbrains-mono-cyrillic.woff2',
  './fonts/jetbrains-mono-cyrillic-ext.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // всё чужое (в первую очередь api.github.com) — мимо воркера
  if (url.origin !== self.location.origin) return;

  // страница: сеть вперёд, кэш — как запасной аэродром
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          // 404 или 5xx — это ответ, а не ошибка сети: в кэш такое класть нельзя,
          // иначе страница-ошибка затрёт рабочую копию приложения
          if (!res || !res.ok) throw new Error('bad status ' + (res && res.status));
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./')) || fetch(req))
    );
    return;
  }

  // статика: кэш вперёд, в фоне подтягиваем свежее
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

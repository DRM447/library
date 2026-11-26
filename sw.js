const CACHE_NAME = 'allbooks-cache-v116';
const CORE_URLS = [
  './all_books.html',
  './styles.css',
  './icons.js',
  './api.js',
  './library.js',
  './search.js',
  './bookmark.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

const LUCIDE_CDN_URL = 'https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js';

const OPTIONAL_ASSETS = [
  LUCIDE_CDN_URL
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(CORE_URLS);
      await Promise.allSettled(OPTIONAL_ASSETS.map(url => cache.add(url)));
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isAllowedCdn = event.request.url === LUCIDE_CDN_URL;

  if (!isSameOrigin && !isAllowedCdn) return;

  const isDynamicCore = isSameOrigin && (
    requestUrl.pathname.endsWith('/all_books.html') ||
    requestUrl.pathname.endsWith('/styles.css') ||
    requestUrl.pathname.endsWith('/api.js') ||
    requestUrl.pathname.endsWith('/library.js') ||
    requestUrl.pathname.endsWith('/search.js') ||
    requestUrl.pathname.endsWith('/bookmark.js') ||
    requestUrl.pathname.endsWith('/app.js') ||
    requestUrl.pathname.endsWith('/manifest.json') ||
    requestUrl.pathname.endsWith('/')
  );

  if (isDynamicCore) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const exact = await caches.match(event.request);
          if (exact) return exact;
          if (requestUrl.pathname.endsWith('/')) {
            const fallbackHtml = await caches.match('./all_books.html');
            if (fallbackHtml) return fallbackHtml;
          }
          return new Response('오프라인 상태입니다.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(response => {
          if (response && (response.ok || response.type === 'opaque')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => new Response('', { status: 503, statusText: 'Offline' }));
    })
  );
});
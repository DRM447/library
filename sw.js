const CACHE_NAME = 'allbooks-cache-v4';
const urlsToCache = [
  './index.html',
  './manifest.json',
  './AllBook_logo.svg',
  './AllBook_logo3(512white).svg',
  './AllBook_logo3(512transp).svg',
  './ewha_font.ttf'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  const isIndexPage = requestUrl.origin === self.location.origin &&
    (requestUrl.pathname.endsWith('/index.html') || requestUrl.pathname.endsWith('/library/'));

  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
      .then(async response => {
        if (!isIndexPage || !response || !response.headers.get('content-type')?.includes('text/html')) {
          return response;
        }

        const html = await response.text();
        if (!html.includes('id="quickLinkBox"')) return new Response(html, response);

        const updatedHtml = html.replace(
          '</head>',
          '<style>#quickLinkBox{display:none!important}</style></head>'
        );
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        headers.delete('content-encoding');
        return new Response(updatedHtml, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      })
  );
});

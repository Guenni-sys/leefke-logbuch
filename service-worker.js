const APP_CACHE = 'leefke-v6-14-20260727';
const RUNTIME_CACHE = 'leefke-runtime-v6-3';
const ASSETS = [
  './',
  './index.html',
  './index.html?v=6.14',
  './style.css',
  './style.css?v=6.14',
  './app.js',
  './app.js?v=6.14',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './leefke-hero.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => ![APP_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function trimCache(name, maxItems) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  while (keys.length > maxItems) await cache.delete(keys.shift());
}

async function networkFirst(request, cacheName, fallback) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : null) || new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
      trimCache(cacheName, 750);
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isSupabaseRequest = url.hostname.endsWith('.supabase.co');
  const isLiveDataRequest =
    url.hostname.endsWith('open-meteo.com') ||
    url.hostname.endsWith('pegelonline.wsv.de') ||
    url.hostname.endsWith('bsh.de') ||
    url.hostname.endsWith('wasserstand.bsh.de') ||
    url.hostname.endsWith('wasserstand-nordsee.bsh.de');
  const isRuntimeResource =
    url.hostname.includes('openstreetmap.org') ||
    url.hostname.includes('openseamap.org') ||
    url.hostname === 'unpkg.com' ||
    url.hostname === 'cdn.jsdelivr.net';

  if (isSupabaseRequest) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, APP_CACHE, './index.html'));
    return;
  }

  if (isLiveDataRequest) {
    event.respondWith((async () => {
      const response = await networkFirst(event.request, RUNTIME_CACHE);
      trimCache(RUNTIME_CACHE, 750);
      return response;
    })());
    return;
  }

  if (isRuntimeResource) {
    event.respondWith(cacheFirst(event.request, RUNTIME_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(event.request, APP_CACHE));
  }
});

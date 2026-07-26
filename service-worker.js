const APP_CACHE = 'leefke-v5-2-20260726';
const RUNTIME_CACHE = 'leefke-runtime-v5-2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './style.css?v=5.2',
  './app.js',
  './app.js?v=5.2',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './leefke-hero.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => ![APP_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

async function trimCache(name, maxItems) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  while (keys.length > maxItems) {
    await cache.delete(keys.shift());
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isSupabaseRequest = url.hostname.endsWith('.supabase.co');
  const isRuntimeResource = url.hostname.includes('openstreetmap.org') || url.hostname.includes('openseamap.org') || url.hostname === 'unpkg.com' || url.hostname === 'cdn.jsdelivr.net';

  if (isSupabaseRequest) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (isRuntimeResource) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok || response.type === 'opaque') {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(event.request, response.clone());
          trimCache(RUNTIME_CACHE, 650);
        }
        return response;
      } catch {
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(APP_CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      return new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
});

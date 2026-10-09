'use strict';
// Cache only the public app shell. No OAuth, Drive, snapshots or user media responses.
const SCOPE = self.registration.scope;
const PREFIX = 'leefke-integrated-shell:' + encodeURIComponent(SCOPE) + ':';
const CACHE = PREFIX + '8.25-importfix-1';
const ENTRY = new URL('./', SCOPE).href;
const ASSETS = [
  'app-release-config.js', 'app-local-source.js', 'index.html', 'style.css', 'app.js', 'drive-concurrency.js',
  'prototype/journal.js', 'prototype/journal-migration.js', 'prototype/google-journal-session.js',
  'app-journal-media.js', 'app-journal.js', 'app-journal-ui.js', 'app-journal.webmanifest',
  'icon.svg', 'icon-192.png', 'icon-512.png',
  'leefke-overview-sunset-desktop.jpg', 'leefke-overview-sunset-mobile.jpg',
  'home-tile-day.jpg', 'home-tile-weather.jpg', 'home-tile-ports.jpg',
  'home-tile-fuel.jpg', 'home-tile-route.jpg', 'home-tile-more.jpg'
].map(path => new URL(path, SCOPE).href);
self.addEventListener('install', event => event.waitUntil((async () => {
  const existed = (await caches.keys()).includes(CACHE);
  try { await (await caches.open(CACHE)).addAll([ENTRY, ...ASSETS].map(url => new Request(url, { cache: 'reload', credentials: 'omit' }))); }
  catch (error) { if (!existed) await caches.delete(CACHE); throw error; }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url), scope = new URL(SCOPE);
  if (request.method !== 'GET' || url.origin !== scope.origin || request.headers.has('Authorization')) return;
  let key;
  if (request.mode === 'navigate') {
    if (![scope.pathname, scope.pathname + 'index.html'].includes(url.pathname)) return;
    key = ENTRY;
  } else {
    const plain = url.origin + url.pathname;
    if (!ASSETS.includes(plain)) return;
    key = plain;
  }
  event.respondWith((async () => (await (await caches.open(CACHE)).match(key)) || fetch(request))());
});

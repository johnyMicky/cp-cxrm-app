const CACHE_NAME = 'camptainm-chat-shell-v1';
const APP_SHELL = ['/chat-app', '/chat-manifest.webmanifest', '/chat-icon-192.png', '/chat-icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Network-first only for navigation. We deliberately do not cache Firebase/API
// requests or chat data, so the existing real-time behavior stays authoritative.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/chat-app'))
    );
  }
});

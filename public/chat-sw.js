const CACHE_NAME = 'camptainm-chat-shell-v2';
const CHAT_START = '/chat-app?source=pwa';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([
        CHAT_START,
        '/chat-manifest.webmanifest',
        '/chat-icon-192.png',
        '/chat-icon-512.png'
      ]).catch(() => undefined)
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('camptainm-chat-shell-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // This PWA controls only the dedicated chat route.
  if (request.mode === 'navigate' && url.pathname.startsWith('/chat-app')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(CHAT_START))
    );
  }
});

const CACHE_NAME = 'word-hunt-daily-v1';
const SHELL_FILES = ['./', './index.html', './app.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // puzzle.json changes daily — never serve it from the cache, or a
  // returning visitor would be stuck on the first day's puzzle forever.
  if (event.request.url.includes('/data/puzzle.json')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

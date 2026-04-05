const CACHE = "slipstream-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/styles.css",
  "/scripts/data.js",
  "/scripts/views-season.js",
  "/scripts/views-analysis.js",
  "/manifest.json",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first for static assets; network-first for the remote data file.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Let the remote archive fetch go straight to network (no caching — data may update).
  if (url.hostname === "raw.githubusercontent.com") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response.ok && event.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

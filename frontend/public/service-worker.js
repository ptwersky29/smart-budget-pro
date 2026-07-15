const CACHE_NAME = "penni-v1";
const STATIC_CACHE = "penni-static-v1";
const API_CACHE = "penni-api-v1";

const STATIC_EXTENSIONS = [
  ".js", ".css", ".png", ".svg", ".ico", ".woff", ".woff2",
  ".ttf", ".eot", ".jpg", ".jpeg", ".gif", ".webp",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (!isSameOrigin(url)) return;

  // Static assets: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // API requests: network-first with cache fallback
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() =>
          caches.open(API_CACHE).then((cache) => cache.match(event.request))
        )
    );
    return;
  }

  // Navigation requests (HTML): network-first
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/offline.html")
      )
    );
    return;
  }

  // Everything else: network-only
  event.respondWith(fetch(event.request));
});

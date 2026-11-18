/* Penni service worker — app shell + static assets only.
 *
 * Rules:
 *  - Navigations: network first, cached shell / offline.html as fallback.
 *  - Hashed build assets (/static/*): cache first (safe: content hash).
 *  - Other same-origin GETs: stale-while-revalidate.
 *  - Cross-origin requests (the API) are never intercepted; the app owns that
 *    cache with per-user scoping.
 */

const VERSION = "penni-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const ASSET_LIMIT = 150;
const NAV_TIMEOUT_MS = 5000;

const PRECACHE = [
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/favicon-32x32.png",
  "/icon-192x192.png",
  "/penni-mark.png",
];

const STATIC_EXTENSIONS = [
  ".js", ".css", ".png", ".svg", ".ico", ".woff", ".woff2",
  ".ttf", ".eot", ".jpg", ".jpeg", ".gif", ".webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.allSettled(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING" || event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isStaticAsset(url) {
  return url.pathname.startsWith("/static/") ||
    STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

let putsSinceTrim = 0;

async function putAndMaybeTrim(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  putsSinceTrim += 1;
  if (putsSinceTrim < 20) return;
  putsSinceTrim = 0;
  const keys = await cache.keys();
  if (keys.length <= ASSET_LIMIT) return;
  await Promise.all(keys.slice(0, keys.length - ASSET_LIMIT).map((key) => cache.delete(key)));
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    putAndMaybeTrim(ASSET_CACHE, request, response.clone()).catch(() => {});
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        putAndMaybeTrim(ASSET_CACHE, request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const response = await network;
  if (response) return response;
  return new Response("", { status: 504, statusText: "Offline" });
}

async function navigationHandler(request) {
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS)),
    ]);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put("/index.html", response.clone()).catch(() => {});
      return response;
    }
    throw new Error("navigation failed");
  } catch {
    const shell = await caches.match("/index.html");
    if (shell) return shell;
    const offline = await caches.match("/offline.html");
    if (offline) return offline;
    return new Response("You are offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

const store = new Map();
const inFlight = new Map();
const listeners = new Map();
export const DEFAULT_TTL = 30_000;

// Stable serialisation so {b,a} and {a,b} share one cache entry.
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function cacheKey(url, params) {
  return `${url}::${stableStringify(params || {})}`;
}

function notify(key, data) {
  const subs = listeners.get(key);
  if (!subs) return;
  for (const fn of subs) {
    try { fn(data); } catch { /* a broken subscriber must not break the cache */ }
  }
}

export function subscribe(url, params, listener) {
  const k = cacheKey(url, params);
  if (!listeners.has(k)) listeners.set(k, new Set());
  listeners.get(k).add(listener);
  return () => {
    const subs = listeners.get(k);
    if (!subs) return;
    subs.delete(listener);
    if (subs.size === 0) listeners.delete(k);
  };
}

export function cacheGetEntry(url, params) {
  const k = cacheKey(url, params);
  const entry = store.get(k);
  if (!entry) return null;
  const age = Date.now() - entry.timestamp;
  const stale = age > entry.ttl;
  return { data: entry.data, timestamp: entry.timestamp, age, stale };
}

export function cacheGet(url, params) {
  const k = cacheKey(url, params);
  const entry = store.get(k);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    store.delete(k);
    return null;
  }
  return entry.data;
}

export function cacheSet(url, params, data, ttl = DEFAULT_TTL) {
  const k = cacheKey(url, params);
  store.set(k, { data, timestamp: Date.now(), ttl });
  notify(k, data);
}

export function cacheInvalidate(prefix) {
  if (!prefix) { store.clear(); return; }
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

export function dedupe(url, params, fetcher) {
  const k = cacheKey(url, params);
  const existing = inFlight.get(k);
  if (existing) return existing;
  const promise = fetcher().finally(() => { inFlight.delete(k); });
  inFlight.set(k, promise);
  return promise;
}

/**
 * Stale-while-revalidate.
 * Returns the cached value (even when stale) plus a promise that resolves with
 * fresh data. The promise is shared between callers, so a page with three
 * widgets reading the same endpoint still makes one request.
 */
export function swr(url, params, fetcher, ttl = DEFAULT_TTL) {
  const cached = cacheGetEntry(url, params);
  const request = dedupe(url, params, () =>
    Promise.resolve()
      .then(fetcher)
      .then((data) => {
        cacheSet(url, params, data, ttl);
        return data;
      })
  );
  return {
    cached: cached ? cached.data : null,
    timestamp: cached ? cached.timestamp : null,
    stale: Boolean(cached?.stale),
    fresh: request,
  };
}

export function dedupeOrFetch(url, params, fetcher, ttl = DEFAULT_TTL) {
  const cached = cacheGet(url, params);
  if (cached) return Promise.resolve(cached);
  return swr(url, params, fetcher, ttl).fresh;
}

export function abortPrevious(signalRef, url, params) {
  if (signalRef.current) signalRef.current.abort();
  const controller = new AbortController();
  signalRef.current = controller;
  return controller.signal;
}

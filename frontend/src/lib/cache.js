const store = new Map();
const inFlight = new Map();
const DEFAULT_TTL = 30_000;

function key(url, params) {
  return `${url}::${JSON.stringify(params || {})}`;
}

export function cacheGet(url, params) {
  const k = key(url, params);
  const entry = store.get(k);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    store.delete(k);
    return null;
  }
  return entry.data;
}

export function cacheSet(url, params, data, ttl = DEFAULT_TTL) {
  const k = key(url, params);
  store.set(k, { data, timestamp: Date.now(), ttl });
}

export function cacheInvalidate(prefix) {
  if (!prefix) { store.clear(); return; }
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

export function dedupe(url, params, fetcher) {
  const k = key(url, params);
  const existing = inFlight.get(k);
  if (existing) return existing;
  const promise = fetcher().finally(() => { inFlight.delete(k); });
  inFlight.set(k, promise);
  return promise;
}

export function dedupeOrFetch(url, params, fetcher, ttl = DEFAULT_TTL) {
  const cached = cacheGet(url, params);
  if (cached) return Promise.resolve(cached);
  const k = key(url, params);
  const existing = inFlight.get(k);
  if (existing) return existing;
  const promise = fetcher()
    .then((data) => { cacheSet(url, params, data, ttl); return data; })
    .finally(() => { inFlight.delete(k); });
  inFlight.set(k, promise);
  return promise;
}

export function abortPrevious(signalRef, url, params) {
  if (signalRef.current) signalRef.current.abort();
  const controller = new AbortController();
  signalRef.current = controller;
  return controller.signal;
}

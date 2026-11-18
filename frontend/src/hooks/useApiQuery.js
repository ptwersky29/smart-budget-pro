import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { cacheGetEntry, subscribe } from "../lib/cache";

/**
 * Stale-while-revalidate data hook.
 *
 * - Cached data renders immediately; the network request runs in the background.
 * - `loading` is only true when there is nothing to show yet.
 * - `refreshing` is true while a cached value is being revalidated.
 */
export function useApiQuery(url, params = {}, options = {}) {
  const { ttl, enabled = true, cache } = options;
  const readCache = cache !== false;
  const paramsKey = JSON.stringify(params || {});

  const initial = enabled && readCache ? cacheGetEntry(url, params) : null;
  const [data, setData] = useState(initial ? initial.data : null);
  const [loading, setLoading] = useState(enabled && !initial);
  const [refreshing, setRefreshing] = useState(Boolean(initial));
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const cachedRef = useRef(Boolean(initial));

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setRefreshing(false);
      return null;
    }

    const entry = readCache ? cacheGetEntry(url, paramsRef.current) : null;
    if (entry) {
      cachedRef.current = true;
      setData(entry.data);
      setLoading(false);
      setRefreshing(true);
    } else {
      cachedRef.current = false;
      setLoading(true);
      setRefreshing(false);
    }
    setError(null);

    try {
      let result;
      if (readCache) {
        result = await api.swrGet(url, paramsRef.current, ttl).fresh;
      } else {
        result = (await api.get(url, { params: paramsRef.current })).data;
      }
      if (mountedRef.current) {
        setData(result);
        setLoading(false);
        setRefreshing(false);
        cachedRef.current = true;
      }
      return result;
    } catch (err) {
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return null;
      if (mountedRef.current) {
        setError(err);
        setLoading(false);
        setRefreshing(false);
      }
      return null;
    }
  }, [url, enabled, ttl, readCache, paramsKey]);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = readCache
      ? subscribe(url, paramsRef.current, (next) => {
          if (mountedRef.current && next !== undefined) setData(next);
        })
      : () => {};
    load();
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [load, readCache, url]);

  return { data, loading, refreshing, error, refetch: load };
}

export default useApiQuery;

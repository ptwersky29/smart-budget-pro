import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export function useApiQuery(url, params = {}, options = {}) {
  const { ttl, enabled = true } = options;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const signalRef = useRef(null);
  const mountedRef = useRef(true);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    if (signalRef.current) signalRef.current.abort();
    const controller = new AbortController();
    signalRef.current = controller;

    try {
      let result;
      if (options.cache !== false) {
        result = await api.cachedGet(url, paramsRef.current, ttl);
      } else {
        const { data: d } = await api.get(url, { params: paramsRef.current, signal: controller.signal });
        result = d;
      }
      if (mountedRef.current) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
      if (mountedRef.current) {
        setError(err);
        setLoading(false);
      }
    }
  }, [url, enabled, ttl, options.cache]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; if (signalRef.current) signalRef.current.abort(); };
  }, [load]);

  return { data, loading, error, refetch: load };
}

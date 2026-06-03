import { useEffect, useRef, useCallback } from "react";

export function useKeyboardShortcut(key, handler, { enabled = true, when = true } = {}) {
  useEffect(() => {
    if (!enabled || !when) return;
    const isMatch = (e) => {
      if (typeof key === "string") {
        return e.key === key && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
      }
      if (Array.isArray(key)) {
        return key.includes(e.key) && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
      }
      return false;
    };
    const listener = (e) => {
      if (e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (isMatch(e)) { e.preventDefault(); handler(e); }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [key, handler, enabled, when]);
}

export function useLeaderKey({ timeout = 800 } = {}) {
  const buffer = useRef([]);
  const timer = useRef(null);

  const clear = useCallback(() => { buffer.current = []; timer.current = null; }, []);

  const handler = useCallback((e) => {
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    buffer.current.push(e.key.toLowerCase());
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(clear, timeout);
  }, [timeout, clear]);

  return { buffer, handler, clear };
}

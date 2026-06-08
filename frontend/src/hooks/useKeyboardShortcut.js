import { useEffect, useRef, useCallback } from "react";

/**
 * Smart keyboard shortcut hook.
 * key can be:
 *   - A string: "n", "Escape"
 *   - An object: { key: "k", meta: true }  (Cmd+K)
 *   - An array of either of the above
 * when: boolean expression; enabled: boolean
 */
export function useKeyboardShortcut(key, handler, { enabled = true, when = true } = {}) {
  useEffect(() => {
    if (!enabled || !when) return;
    const isMatch = (e) => {
      const matchKey = (k) => {
        if (typeof k === "string") {
          return e.key === k && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
        }
        if (typeof k === "object" && k.key) {
          const metaOk = k.meta ? e.metaKey : !e.metaKey;
          const ctrlOk = k.ctrl ? e.ctrlKey : !e.ctrlKey;
          const shiftOk = k.shift ? e.shiftKey : !e.shiftKey;
          const altOk = k.alt ? e.altKey : !e.altKey;
          return e.key === k.key && metaOk && ctrlOk && shiftOk && altOk;
        }
        return false;
      };
      if (Array.isArray(key)) return key.some(matchKey);
      return matchKey(key);
    };
    const listener = (e) => {
      if (e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (isMatch(e)) { e.preventDefault(); handler(e); }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [key, handler, enabled, when]);
}

/**
 * Leader-key navigation: press a leader key then a target key within `timeout` ms.
 * Returns isArmed (bool) and handlers for each step.
 */
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

import { useRef, useCallback } from "react";

export function useSwipe(onSwipeLeft, onSwipeRight, threshold = 60) {
  const start = useRef(null);
  const handleTouchStart = useCallback((e) => {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const handleTouchEnd = useCallback((e) => {
    if (!start.current) return;
    const dx = e.changedTouches[0].clientX - start.current.x;
    const dy = e.changedTouches[0].clientY - start.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
      if (dx > 0) onSwipeRight?.();
      else onSwipeLeft?.();
    }
    start.current = null;
  }, [onSwipeLeft, onSwipeRight, threshold]);
  return { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd };
}

import React, { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";

function formatSavedAt(value) {
  try {
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Honest connection state. Never invents data: offline means "this is what was
 * saved at HH:MM", and a slow request says the server is waking up instead of
 * leaving a bare skeleton on screen.
 */
export default function NetworkStatus() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false
  );
  const [cachedAt, setCachedAt] = useState(null);

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => {
      setOffline(false);
      setCachedAt(null);
    };
    const onSlow = () => {
      toast.loading("Waking the server — this can take a few seconds.", {
        id: "penni-slow-request",
        duration: 10_000,
      });
    };
    const onSettled = () => toast.dismiss("penni-slow-request");
    const onCached = (event) => {
      setCachedAt(event.detail?.savedAt || Date.now());
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("penni:slow-request", onSlow);
    window.addEventListener("penni:request-ok", onSettled);
    window.addEventListener("penni:offline-response", onCached);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("penni:slow-request", onSlow);
      window.removeEventListener("penni:request-ok", onSettled);
      window.removeEventListener("penni:offline-response", onCached);
    };
  }, []);

  if (!offline && !cachedAt) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-4 z-[80] mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[12px] font-medium text-muted-foreground shadow-lg"
    >
      <WifiOff className="h-4 w-4 text-amber-500" aria-hidden="true" />
      {cachedAt ? (
        <span>Offline — showing data saved at {formatSavedAt(cachedAt)}</span>
      ) : (
        <span>You are offline. Changes will not be saved.</span>
      )}
    </div>
  );
}

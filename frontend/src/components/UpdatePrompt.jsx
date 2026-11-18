import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Shows an actionable prompt when a new service worker has installed, instead
 * of leaving users on an old build until they hard-refresh.
 */
export default function UpdatePrompt() {
  useEffect(() => {
    const onUpdate = (event) => {
      const registration = event.detail?.registration;
      toast("A new version of Penni is available", {
        id: "penni-update",
        duration: Infinity,
        action: {
          label: "Refresh",
          onClick: () => {
            try {
              registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
            } catch {
              // ignore — reload still picks up the new worker on next visit
            }
            window.location.reload();
          },
        },
      });
    };
    window.addEventListener("penni:update-available", onUpdate);
    return () => window.removeEventListener("penni:update-available", onUpdate);
  }, []);

  return null;
}

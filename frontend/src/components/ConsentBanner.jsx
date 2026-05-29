import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { X } from "lucide-react";

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/gdpr/consent").then(({ data }) => {
      const consented = data?.consents?.some(
        (c) => c.consent_type === "privacy" && c.granted
      );
      setVisible(!consented);
    }).catch(() => setVisible(true));
  }, []);

  const acceptAll = async () => {
    setBusy(true);
    try {
      await api.post("/gdpr/consent", {
        consent_type: "privacy",
        granted: true,
      });
      await api.post("/gdpr/consent", {
        consent_type: "terms",
        granted: true,
      });
      setVisible(false);
    } catch {
      toast.error("Could not save consent preference");
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await api.post("/gdpr/consent", {
        consent_type: "privacy",
        granted: false,
      });
      setVisible(false);
    } catch {
      toast.error("Could not save consent preference");
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background border-t border-border shadow-2xl">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1 text-sm">
          <p className="font-medium">We value your privacy</p>
          <p className="text-muted-foreground mt-1">
            We store your financial data securely and never share it with third parties.
            By continuing, you agree to our{" "}
            <a href="/privacy" className="text-emerald hover:underline" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            .
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={decline}
            disabled={busy}
            className="btn-pill border border-border text-sm disabled:opacity-50"
          >
            Decline
          </button>
          <button
            onClick={acceptAll}
            disabled={busy}
            className="btn-pill gradient-emerald text-white text-sm disabled:opacity-50"
          >
            Accept
          </button>
          <button
            onClick={() => setVisible(false)}
            className="p-2 hover:bg-secondary rounded-lg text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

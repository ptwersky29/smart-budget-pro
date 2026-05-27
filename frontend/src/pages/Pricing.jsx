import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [tylConfig, setTylConfig] = useState({ configured: false });

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get("/billing/tyl/config"); setTylConfig(data); }
      catch { /* ignore */ }
    })();
  }, []);

  const upgrade = async () => {
    if (!user) { navigate("/login"); return; }
    if (!tylConfig.configured) {
      toast.error("Payments aren't fully configured yet. Please contact support.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/billing/tyl/checkout", {
        package_id: "premium_monthly",
        origin_url: window.location.origin,
      });
      // Server returns redirect_url — a server-rendered HTML page that auto-submits to Tyl.
      // This is far more reliable than building a form in JS (no popup blockers, no React quirks).
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }
      // Fallback: build & submit form client-side
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.action_url;
      form.style.display = "none";
      Object.entries(data.fields || {}).forEach(([k, v]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = k;
        input.value = String(v ?? "");
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      console.error("Tyl checkout error:", e);
      toast.error(formatApiError(e.response?.data?.detail) || "Could not start checkout");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto pt-12">
        <div className="text-center mb-12">
          <p className="label-overline text-emerald">Pricing</p>
          <h1 className="text-5xl tracking-tight font-medium mt-3">Premium when you want it.</h1>
          <p className="text-sm text-muted-foreground mt-3">Pay securely via Tyl by NatWest. Cards, Apple Pay, Google Pay accepted.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-border bg-card p-8">
            <p className="label-overline">Free</p>
            <p className="text-5xl tracking-tight mt-2 font-medium">£0<span className="text-base text-muted-foreground">/mo</span></p>
            <ul className="mt-6 space-y-2 text-sm">
              {["Manual transactions","5 AI messages/day","Basic reports","CSV uploads"].map((t)=>(<li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-muted-foreground"/>{t}</li>))}
            </ul>
            <button onClick={()=>navigate(user ? "/dashboard" : "/register")} data-testid="free-cta" className="btn-pill border border-border mt-8 w-full">{user ? "Go to dashboard" : "Start free"}</button>
          </div>
          <div className="rounded-3xl border-2 border-emerald bg-card p-8 relative">
            <span className="absolute top-4 right-4 text-xs px-3 py-1 rounded-full gradient-emerald text-white flex items-center gap-1"><Sparkles className="h-3 w-3"/> Premium</span>
            <p className="label-overline text-emerald">Premium</p>
            <p className="text-5xl tracking-tight mt-2 font-medium">£5<span className="text-base text-muted-foreground">/mo</span></p>
            <ul className="mt-6 space-y-2 text-sm">
              {["Unlimited Claude Sonnet 4.5 AI","UK bank sync via TrueLayer","Investment forecasting","Auto-Maaser & Tzedakah ledger","UK UC & HMRC estimators","Premium PDF reports","SMS finance parsing"].map((t)=>(<li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald"/>{t}</li>))}
            </ul>
            {user?.tier === "premium" ? (
              <div className="btn-pill bg-secondary text-foreground mt-8 w-full opacity-70">You're on Premium ✓</div>
            ) : (
              <button onClick={upgrade} disabled={busy || !tylConfig.configured} data-testid="upgrade-button"
                      className="btn-pill gradient-emerald text-white mt-8 w-full disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upgrade — £5 / mo"}
              </button>
            )}
            {!tylConfig.configured && (
              <p className="text-xs text-muted-foreground mt-3 text-center">Tyl payments not yet configured — shared secret missing.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

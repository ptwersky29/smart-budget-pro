import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";

const FEATURES_FREE = ["Manual transactions","5 AI messages/day","Basic reports","CSV uploads"];
const FEATURES_PREMIUM = [
  "Unlimited Claude Sonnet 4.5 AI","UK bank sync via TrueLayer","Investment forecasting",
  "Auto-Maaser & Tzedakah ledger","UK UC & HMRC estimators","Premium PDF reports","SMS finance parsing",
];

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState({ monthly: false, yearly: false });

  useEffect(() => { document.title = "Pricing | FinanceAI"; }, []);

  const upgrade = async (packageId) => {
    if (!user) { navigate("/login"); return; }
    setBusy((prev) => ({ ...prev, [packageId === "premium_monthly" ? "monthly" : "yearly"]: true }));
    try {
      const { data } = await api.post("/billing/create-checkout", {
        package_id: packageId,
        origin_url: window.location.origin,
      });
      window.location.href = data.checkout_url;
    } catch (e) {
      console.error("checkout error:", e);
      toast.error(formatApiError(e.response?.data?.detail) || "Could not start checkout");
    } finally {
      setBusy((prev) => ({ ...prev, [packageId === "premium_monthly" ? "monthly" : "yearly"]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-5xl mx-auto pt-6 sm:pt-12">
        <Link to="/" className="inline-flex items-center gap-2 mb-6 sm:mb-8">
          <div className="w-8 h-8 rounded-xl gradient-emerald grid place-items-center text-white font-bold">£</div>
          <span className="font-semibold tracking-tight text-lg">FinanceAI</span>
        </Link>
        <div className="text-center mb-8 sm:mb-12">
          <p className="label-overline text-emerald">Pricing</p>
          <h1 className="text-3xl sm:text-5xl tracking-tight font-medium mt-2 sm:mt-3">Premium when you want it.</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-2 sm:mt-3">Choose the plan that fits. Cancel anytime. 14-day free trial included.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
          <div className="rounded-3xl border border-border bg-card p-5 sm:p-8">
            <p className="label-overline">Free</p>
            <p className="text-3xl sm:text-5xl tracking-tight mt-2 font-medium">&pound;0<span className="text-sm sm:text-base text-muted-foreground">/mo</span></p>
            <ul className="mt-4 sm:mt-6 space-y-2 text-sm">
              {FEATURES_FREE.map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-muted-foreground"/>{t}</li>
              ))}
            </ul>
            <Button variant="outlinePill" size="pill" onClick={() => navigate(user ? "/dashboard" : "/register")} data-testid="free-cta" className="mt-6 sm:mt-8 w-full">{user ? "Go to dashboard" : "Start free"}</Button>
          </div>

          <div className="rounded-3xl border-2 border-emerald bg-card p-5 sm:p-8 relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full gradient-emerald text-white flex items-center gap-1 whitespace-nowrap">
              <Sparkles className="h-3 w-3"/> Most popular
            </span>
            <p className="label-overline text-emerald">Premium Monthly</p>
            <p className="text-3xl sm:text-5xl tracking-tight mt-2 font-medium">&pound;5<span className="text-sm sm:text-base text-muted-foreground">/mo</span></p>
            <ul className="mt-4 sm:mt-6 space-y-2 text-sm">
              {FEATURES_PREMIUM.map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald"/>{t}</li>
              ))}
            </ul>
            {user?.tier === "premium" ? (
              <div className="rounded-full px-6 py-3 mt-6 sm:mt-8 w-full bg-secondary text-foreground opacity-70 text-center text-sm font-medium">You're on Premium &check;</div>
            ) : (
              <Button variant="primary" size="pill" onClick={() => upgrade("premium_monthly")} disabled={busy.monthly} data-testid="upgrade-monthly" className="mt-6 sm:mt-8 w-full">
                {busy.monthly ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start 14-day trial"}
              </Button>
            )}
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 sm:p-8">
            <p className="label-overline">Premium Yearly</p>
            <p className="text-3xl sm:text-5xl tracking-tight mt-2 font-medium">&pound;48<span className="text-sm sm:text-base text-muted-foreground">/yr</span></p>
            <p className="text-xs text-emerald mt-1">Save &pound;12/year vs monthly</p>
            <ul className="mt-4 sm:mt-6 space-y-2 text-sm">
              {FEATURES_PREMIUM.map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald"/>{t}</li>
              ))}
            </ul>
            {user?.tier === "premium" ? (
              <div className="rounded-full px-6 py-3 mt-6 sm:mt-8 w-full bg-secondary text-foreground opacity-70 text-center text-sm font-medium">You're on Premium &check;</div>
            ) : (
              <Button variant="primary" size="pill" onClick={() => upgrade("premium_yearly")} disabled={busy.yearly} data-testid="upgrade-yearly" className="mt-6 sm:mt-8 w-full">
                {busy.yearly ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start 14-day trial"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

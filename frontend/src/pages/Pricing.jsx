import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import Logo from "../components/Logo";

const FEATURES = [
  "Unlimited Claude Sonnet 4.5 AI","UK bank sync via TrueLayer","Investment forecasting",
  "Auto-Maaser & Tzedakah ledger","UK UC & HMRC estimators","PDF reports","SMS finance parsing",
  "Manual transactions","CSV & PDF statement uploads",
];

export default function Pricing() {
  useEffect(() => { document.title = "Pricing | Penni"; }, []);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-5xl mx-auto pt-6 sm:pt-12">
        <Link to="/" className="inline-flex items-center gap-2 mb-6 sm:mb-8">
          <Logo size="sm" />
          <span className="font-semibold tracking-tight text-lg">Penni</span>
        </Link>
        <div className="text-center mb-8 sm:mb-12">
          <p className="label-overline text-emerald">Pricing</p>
          <h1 className="text-3xl sm:text-5xl tracking-tight font-medium mt-2 sm:mt-3">Everything included.</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-2 sm:mt-3">All features are available to every user. No upgrade needed.</p>
        </div>
        <div className="max-w-lg mx-auto">
          <div className="rounded-3xl border-2 border-emerald bg-card p-5 sm:p-8 relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full gradient-emerald text-white flex items-center gap-1 whitespace-nowrap">
              <Sparkles className="h-3 w-3"/> All features
            </span>
            <p className="text-3xl sm:text-5xl tracking-tight mt-2 font-medium">&pound;0<span className="text-sm sm:text-base text-muted-foreground"> forever</span></p>
            <ul className="mt-4 sm:mt-6 space-y-2 text-sm">
              {FEATURES.map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald"/>{t}</li>
              ))}
            </ul>
            <Link to="/register" data-testid="free-cta" className="mt-6 sm:mt-8 w-full inline-flex items-center justify-center h-11 px-8 rounded-full gradient-emerald text-white text-sm font-medium hover:opacity-90 transition-opacity">
              Get started free
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

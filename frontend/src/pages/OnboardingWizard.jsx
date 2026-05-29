import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Loader2, Check, ArrowRight, Banknote, Receipt, Target, Zap } from "lucide-react";

const STEPS = [
  { id: "connect_bank", label: "Connect your bank", icon: Banknote, desc: "Link your bank account via TrueLayer to auto-import transactions." },
  { id: "first_transaction", label: "Add a transaction", icon: Receipt, desc: "Manually add your first transaction or upload a statement." },
  { id: "set_budget", label: "Set a budget", icon: Target, desc: "Create your first budget category to start tracking spending." },
  { id: "ai_intro", label: "Meet your AI", icon: Zap, desc: "Try the AI finance coach and see what it can do with your data." },
];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/onboarding/progress").then(({ data }) => {
      setProgress(data);
      const idx = STEPS.findIndex((s) => s.id === data.step);
      setStep(idx >= 0 ? idx : 0);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const markComplete = async () => {
    setBusy(true);
    try {
      const currentStep = STEPS[step].id;
      await api.post("/onboarding/progress", { step: currentStep, completed_steps: { [currentStep]: true } });
      if (step < STEPS.length - 1) {
        const nextStep = STEPS[step + 1].id;
        await api.post("/onboarding/progress", { step: nextStep });
      } else {
        await api.post("/onboarding/progress", { step: "complete" });
        toast.success("Onboarding complete!");
        navigate("/dashboard");
        return;
      }
      setStep((s) => s + 1);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const skipAll = async () => {
    try {
      await api.post("/onboarding/skip");
      navigate("/dashboard");
    } catch { /* best-effort */ }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-emerald" />
      </div>
    );
  }

  if (progress?.skipped || progress?.step === "complete") {
    navigate("/dashboard", { replace: true });
    return null;
  }

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl gradient-emerald grid place-items-center text-white font-bold text-sm">£</div>
              <span className="font-semibold tracking-tight">FinanceAI</span>
            </div>
            <button onClick={skipAll} className="text-sm text-muted-foreground hover:text-foreground">
              Skip all
            </button>
          </div>

          <div className="flex gap-2 mb-10">
            {STEPS.map((s, i) => (
              <div key={s.id} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-emerald" : "bg-secondary"}`} />
            ))}
          </div>

          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald/10 flex items-center justify-center mx-auto mb-6">
              <Icon className="h-8 w-8 text-emerald" />
            </div>
            <h1 className="text-2xl tracking-tight font-medium">{current.label}</h1>
            <p className="text-muted-foreground mt-2">{current.desc}</p>
          </div>

          <div className="flex gap-3">
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="btn-pill border border-border flex-1">
                Back
              </button>
            )}
            <button onClick={markComplete} disabled={busy} className="btn-pill gradient-emerald text-white flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
                {step === STEPS.length - 1 ? "Finish" : "Continue"} <ArrowRight className="h-4 w-4" />
              </>}
            </button>
          </div>

          <div className="mt-10 space-y-3">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 text-sm">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${i < step ? "bg-emerald text-white" : i === step ? "border-2 border-emerald" : "border-2 border-border text-muted-foreground"}`}>
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={i <= step ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

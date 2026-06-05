import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Check, ArrowRight, Banknote, Receipt, Target, Zap, Loader2, Upload, PenLine, Building2, BarChart3 } from "lucide-react";
import Skeleton from "../components/ui/Skeleton";

const STEPS = [
  {
    id: "connect_bank",
    label: "Get your data in",
    icon: Banknote,
    desc: "Choose how you want to import transactions. You can always add more later.",
  },
  {
    id: "first_transaction",
    label: "Add your first transaction",
    icon: Receipt,
    desc: "Log one transaction — it only takes 10 seconds.",
  },
  {
    id: "set_budget",
    label: "Set a spending limit",
    icon: Target,
    desc: "Pick one category and a monthly limit to start tracking.",
  },
  {
    id: "ai_intro",
    label: "Meet your AI coach",
    icon: Zap,
    desc: "Your AI is ready. It analyses your transactions and gives honest, plain-English advice.",
  },
];

/* ── Step content components ─────────────────────────────────── */

function StepImport({ onDone }) {
  return (
    <div className="space-y-3 mt-6">
      <a
        href="/import"
        className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:border-emerald transition-colors group"
      >
        <span className="w-11 h-11 rounded-xl bg-emerald/10 text-emerald grid place-items-center shrink-0">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">Connect your bank</p>
          <p className="text-xs text-muted-foreground mt-0.5">2,400+ UK banks via TrueLayer. Auto-imports transactions.</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald transition-colors shrink-0" />
      </a>
      <a
        href="/import"
        className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:border-emerald transition-colors group"
      >
        <span className="w-11 h-11 rounded-xl bg-topaz/10 text-topaz grid place-items-center shrink-0">
          <Upload className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">Upload a statement</p>
          <p className="text-xs text-muted-foreground mt-0.5">CSV or PDF from your bank. We'll extract everything automatically.</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald transition-colors shrink-0" />
      </a>
      <button
        onClick={onDone}
        className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:border-emerald transition-colors group w-full text-left"
      >
        <span className="w-11 h-11 rounded-xl bg-secondary text-muted-foreground grid place-items-center shrink-0">
          <PenLine className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">I'll add manually</p>
          <p className="text-xs text-muted-foreground mt-0.5">Type in transactions one at a time. Good for getting started fast.</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald transition-colors shrink-0" />
      </button>
    </div>
  );
}

function StepTransaction({ onDone }) {
  const [form, setForm] = useState({ description: "", amount: "", is_income: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState({});

  const validate = () => {
    const e = {};
    if (!form.description.trim()) e.description = "Description is required";
    if (!form.amount || isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0)
      e.amount = "Enter a valid amount";
    return e;
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setError(errs); return; }
    setBusy(true);
    try {
      const amt = parseFloat(form.amount);
      await api.post("/transactions", {
        description: form.description.trim(),
        amount: form.is_income ? amt : -amt,
        category: "uncategorized",
      });
      toast.success("Transaction added");
      onDone();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Could not add transaction");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 mt-6">
      <div>
        <label className="label-overline">Description *</label>
        <input
          value={form.description}
          onChange={(e) => { setForm({ ...form, description: e.target.value }); setError((p) => ({ ...p, description: "" })); }}
          placeholder="e.g. Tesco groceries"
          className={`mt-1 w-full control-shell ${error.description ? "border-ruby" : ""}`}
        />
        {error.description && <p className="text-xs text-ruby mt-1">{error.description}</p>}
      </div>
      <div>
        <label className="label-overline">Amount (£) *</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={form.amount}
          onChange={(e) => { setForm({ ...form, amount: e.target.value }); setError((p) => ({ ...p, amount: "" })); }}
          placeholder="0.00"
          className={`mt-1 w-full control-shell ${error.amount ? "border-ruby" : ""}`}
        />
        {error.amount && <p className="text-xs text-ruby mt-1">{error.amount}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.is_income}
          onChange={(e) => setForm({ ...form, is_income: e.target.checked })}
          className="rounded border-border accent-emerald"
        />
        This is income (salary, payment received, etc.)
      </label>
      <button disabled={busy} className="btn-pill w-full gradient-emerald text-white mt-2 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save transaction <ArrowRight className="h-4 w-4 ml-1" /></>}
      </button>
    </form>
  );
}

function StepBudget({ onDone }) {
  const [form, setForm] = useState({ category: "", limit: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState({});

  const COMMON_CATS = ["groceries", "dining", "transport", "rent", "utilities", "shopping", "entertainment", "health"];

  const validate = () => {
    const e = {};
    if (!form.category.trim()) e.category = "Pick a category";
    if (!form.limit || isNaN(parseFloat(form.limit)) || parseFloat(form.limit) <= 0)
      e.limit = "Enter a monthly limit";
    return e;
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setError(errs); return; }
    setBusy(true);
    try {
      await api.post("/budgets", { category: form.category.toLowerCase(), limit: parseFloat(form.limit) });
      toast.success(`${form.category} budget set to £${form.limit}/mo`);
      onDone();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Could not create budget");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 mt-6">
      <div>
        <label className="label-overline">Category *</label>
        <div className="flex flex-wrap gap-2 mt-2 mb-1">
          {COMMON_CATS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => { setForm({ ...form, category: c }); setError((p) => ({ ...p, category: "" })); }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors capitalize ${
                form.category === c ? "border-emerald bg-emerald/10 text-emerald" : "border-border hover:border-emerald/50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          value={form.category}
          onChange={(e) => { setForm({ ...form, category: e.target.value }); setError((p) => ({ ...p, category: "" })); }}
          placeholder="or type your own"
          className={`mt-2 w-full control-shell ${error.category ? "border-ruby" : ""}`}
        />
        {error.category && <p className="text-xs text-ruby mt-1">{error.category}</p>}
      </div>
      <div>
        <label className="label-overline">Monthly limit (£) *</label>
        <input
          type="number"
          step="1"
          min="1"
          value={form.limit}
          onChange={(e) => { setForm({ ...form, limit: e.target.value }); setError((p) => ({ ...p, limit: "" })); }}
          placeholder="e.g. 300"
          className={`mt-1 w-full control-shell ${error.limit ? "border-ruby" : ""}`}
        />
        {error.limit && <p className="text-xs text-ruby mt-1">{error.limit}</p>}
      </div>
      <button disabled={busy} className="btn-pill w-full gradient-emerald text-white disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create budget <ArrowRight className="h-4 w-4 ml-1" /></>}
      </button>
    </form>
  );
}

function StepAI({ onFinish }) {
  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl border border-emerald/20 bg-emerald/5 p-5">
        <p className="text-sm font-medium text-emerald mb-1">Your AI coach is active</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          It analyses every transaction you add, spots patterns, suggests budget limits, and gives you plain-English summaries — automatically, with no setup needed.
        </p>
      </div>
      <div className="space-y-2">
        {[
          { icon: BarChart3, text: "Monthly spending breakdowns with trends" },
          { icon: Target, text: "Smart budget suggestions based on your history" },
          { icon: Zap, text: "Instant answers to questions about your money" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 text-sm">
            <span className="w-8 h-8 rounded-lg bg-emerald/10 text-emerald grid place-items-center shrink-0">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-muted-foreground">{text}</span>
          </div>
        ))}
      </div>
      <button onClick={onFinish} className="btn-pill w-full gradient-emerald text-white mt-2">
        Go to dashboard <ArrowRight className="h-4 w-4 ml-1" />
      </button>
    </div>
  );
}

/* ── Main wizard ─────────────────────────────────────────────── */

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/onboarding/progress")
      .then(({ data }) => {
        if (data?.skipped || data?.step === "complete") {
          navigate("/dashboard", { replace: true });
          return;
        }
        const idx = STEPS.findIndex((s) => s.id === data.step);
        setStep(idx >= 0 ? idx : 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [navigate]);

  const markStep = async (id, next) => {
    try {
      await api.post("/onboarding/progress", { step: id, completed_steps: { [id]: true } });
      if (next !== undefined) {
        await api.post("/onboarding/progress", { step: STEPS[next]?.id || "complete" });
      }
    } catch { /* best-effort */ }
  };

  const advance = async () => {
    const currentId = STEPS[step].id;
    if (step < STEPS.length - 1) {
      await markStep(currentId, step + 1);
      setStep((s) => s + 1);
    } else {
      setBusy(true);
      try {
        await api.post("/onboarding/progress", { step: "complete" });
        toast.success("You're all set — welcome to FinanceAI!");
        navigate("/dashboard");
      } catch {
        navigate("/dashboard");
      } finally {
        setBusy(false);
      }
    }
  };

  const skipAll = async () => {
    try { await api.post("/onboarding/skip"); } catch { /* best-effort */ }
    navigate("/dashboard");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="w-full max-w-lg space-y-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  const current = STEPS[step];
  const Icon = current.icon;
  const pct = Math.round(((step) / STEPS.length) * 100);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-start justify-center p-6 pt-12">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between mb-10">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl gradient-emerald grid place-items-center text-white font-bold text-sm">£</div>
              <span className="font-semibold tracking-tight">FinanceAI</span>
            </Link>
            <button onClick={skipAll} className="text-sm text-muted-foreground hover:text-foreground">
              Skip setup
            </button>
          </div>

          {/* Progress bar + step count */}
          <div className="mb-8">
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>Step {step + 1} of {STEPS.length}</span>
              <span>{pct}% complete</span>
            </div>
            <div className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                    i < step ? "bg-emerald" : i === step ? "bg-emerald/60" : "bg-secondary"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Step card */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald/10 flex items-center justify-center shrink-0">
                <Icon className="h-6 w-6 text-emerald" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Step {step + 1}</p>
                <h1 className="text-xl tracking-tight font-semibold">{current.label}</h1>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{current.desc}</p>

            {/* Embedded step action */}
            {step === 0 && <StepImport onDone={advance} />}
            {step === 1 && <StepTransaction onDone={advance} />}
            {step === 2 && <StepBudget onDone={advance} />}
            {step === 3 && <StepAI onFinish={advance} />}

            {/* Skip this step link (not last step) */}
            {step < STEPS.length - 1 && (
              <button
                onClick={advance}
                disabled={busy}
                className="mt-4 text-xs text-muted-foreground hover:text-foreground w-full text-center disabled:opacity-50"
              >
                Skip this step
              </button>
            )}
          </div>

          {/* Step checklist below */}
          <div className="mt-6 space-y-2 px-1">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 text-sm">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  i < step ? "bg-emerald text-white" : i === step ? "border-2 border-emerald text-emerald" : "border-2 border-border text-muted-foreground"
                }`}>
                  {i < step ? <Check className="h-3.5 w-3.5" /> : <span className="text-xs">{i + 1}</span>}
                </div>
                <span className={i <= step ? "text-foreground font-medium" : "text-muted-foreground"}>{s.label}</span>
                {i < step && <span className="text-xs text-emerald ml-auto">Done</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { CheckCircle2, Sparkles, TrendingUp, WalletCards } from "lucide-react";
import Logo from "./Logo";

const rows = [
  { label: "Groceries", value: "-42.50", tone: "ruby" },
  { label: "Salary", value: "+4,835.00", tone: "emerald" },
  { label: "Tzedakah", value: "-80.00", tone: "topaz" },
];

export default function AuthVisual({ title = "Premium money, quietly automated." }) {
  return (
    <div className="penni-auth-visual relative hidden min-w-0 overflow-hidden bg-slate-950 p-10 text-white lg:flex xl:p-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,89,233,0.35),transparent_42%),radial-gradient(circle_at_80%_10%,rgba(171,128,245,0.16),transparent_36%)]" />
      <div className="auth-visual-content relative z-10 flex h-full w-full flex-col justify-between gap-8">
        <div className="flex items-center gap-3">
          <Logo size="md" />
          <div>
            <p className="text-sm font-semibold">Penni</p>
            <p className="text-xs text-white/60">Your financial workspace</p>
          </div>
        </div>

        <div className="auth-visual-preview mx-auto w-full max-w-lg rounded-[1.75rem] border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-white/60">Sample combined balance</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight">&pound;12,408.32</p>
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-300">
              <WalletCards className="h-5 w-5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="flex items-center gap-2 text-xs text-white/60">
                <TrendingUp className="h-4 w-4 text-indigo-300" />
                Cash flow
              </div>
              <p className="mt-3 text-2xl font-semibold">&pound;1,284</p>
              <p className="text-xs text-indigo-200">Illustrative preview</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="flex items-center gap-2 text-xs text-white/60">
                <Sparkles className="h-4 w-4 text-violet-300" />
                AI insight
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/85">
                Explore spending patterns and plan ahead.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-sm">
                <span className="text-white/75">{row.label}</span>
                <span className={row.tone === "emerald" ? "text-emerald" : row.tone === "topaz" ? "text-violet-300" : "text-rose-300"}>
                  {row.value.startsWith("-") ? "-" : "+"}&pound;{row.value.replace(/^[+-]/, "")}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-visual-bottom">
          <p className="max-w-lg text-[clamp(28px,3vw,43px)] font-semibold leading-[1.14] tracking-[-0.045em]">{title}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs text-white/70">
            {["Accounts", "Budgets", "Maaser tracking"].map((item) => (
              <span key={item} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-violet-300" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

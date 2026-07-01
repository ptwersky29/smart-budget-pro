import React from "react";
import { CheckCircle2, Sparkles, TrendingUp, WalletCards } from "lucide-react";

const rows = [
  { label: "Groceries", value: "-42.50", tone: "ruby" },
  { label: "Salary", value: "+4,835.00", tone: "emerald" },
  { label: "Tzedakah", value: "-80.00", tone: "topaz" },
];

export default function AuthVisual({ title = "Premium money, quietly automated." }) {
  return (
    <div className="hidden lg:flex relative overflow-hidden bg-slate-950 p-12 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.25),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(245,158,11,0.18),transparent_28%)]" />
      <div className="relative z-10 flex h-full w-full flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="relative grid h-10 w-10 place-items-center rounded-full bg-emerald text-sm font-bold text-white overflow-hidden ring-1 ring-white/15 shadow-lg shadow-emerald/30">
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full pointer-events-none" />
            <span className="relative z-10">&pound;</span>
          </div>
          <div>
            <p className="text-sm font-semibold">Penni</p>
            <p className="text-xs text-white/60">Live money workspace</p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-lg rounded-[2rem] border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-white/55">Total balance</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight">&pound;12,408.32</p>
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald/20 text-emerald">
              <WalletCards className="h-5 w-5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="flex items-center gap-2 text-xs text-white/60">
                <TrendingUp className="h-4 w-4 text-emerald" />
                Cash flow
              </div>
              <p className="mt-3 text-2xl font-semibold">&pound;1,284</p>
              <p className="text-xs text-emerald">8.4% ahead</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="flex items-center gap-2 text-xs text-white/60">
                <Sparkles className="h-4 w-4 text-topaz" />
                AI insight
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/85">
                Move &pound;220 before Shabbos to keep the month on track.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-sm">
                <span className="text-white/75">{row.label}</span>
                <span className={row.tone === "emerald" ? "text-emerald" : row.tone === "topaz" ? "text-topaz" : "text-ruby"}>
                  {row.value.startsWith("+") ? "+" : "-"}&pound;{row.value.replace(/^[+-]/, "")}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="max-w-lg text-4xl font-medium leading-tight tracking-tight">{title}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs text-white/70">
            {["Bank sync", "AI budgets", "Maaser tracking"].map((item) => (
              <span key={item} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

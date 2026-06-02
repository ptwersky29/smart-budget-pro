import React, { useState } from "react";
import { api, formatApiError } from "../lib/api";
import { BarChart3, Loader2, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toast } from "sonner";

const fmt = (n) => `£${Number(n || 0).toFixed(2)}`;

function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function firstOfPrevMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastOfPrevMonth() {
  const d = new Date();
  d.setMonth(d.getMonth(), 0);
  return d.toISOString().slice(0, 10);
}

export default function ComparePeriods({ open, onClose }) {
  const [aFrom, setAFrom] = useState(firstOfPrevMonth());
  const [aTo, setATo] = useState(lastOfPrevMonth());
  const [bFrom, setBFrom] = useState(firstOfMonth());
  const [bTo, setBTo] = useState(today());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const compare = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.get("/analytics/compare-periods", {
        params: {
          period_a_from: aFrom, period_a_to: aTo,
          period_b_from: bFrom, period_b_to: bTo,
        },
      });
      setResult(data);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Comparison failed");
    }
    finally { setLoading(false); }
  };

  const ChangeBadge = ({ pct }) => {
    if (pct == null || isNaN(pct)) return <Minus className="h-4 w-4 text-muted-foreground" />;
    const isGood = pct < 0;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${isGood ? "text-emerald" : pct > 0 ? "text-ruby" : "text-muted-foreground"}`}>
        {pct > 0 ? <TrendingUp className="h-3 w-3" /> : pct < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
        {isGood ? "" : "+"}{pct.toFixed(1)}%
      </span>
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="page-shell p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-topaz" />
            <h3 className="text-xl tracking-tight font-medium">Compare Periods</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>

        {/* Date range inputs */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <p className="label-overline mb-3">Period A</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">From</label>
                <input type="date" value={aFrom} onChange={(e) => setAFrom(e.target.value)}
                  className="w-full control-shell text-sm h-10 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">To</label>
                <input type="date" value={aTo} onChange={(e) => setATo(e.target.value)}
                  className="w-full control-shell text-sm h-10 mt-1" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <p className="label-overline mb-3">Period B</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">From</label>
                <input type="date" value={bFrom} onChange={(e) => setBFrom(e.target.value)}
                  className="w-full control-shell text-sm h-10 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">To</label>
                <input type="date" value={bTo} onChange={(e) => setBTo(e.target.value)}
                  className="w-full control-shell text-sm h-10 mt-1" />
              </div>
            </div>
          </div>
        </div>

        <button onClick={compare} disabled={loading}
          className="btn-pill gradient-topaz text-white text-sm w-full h-11 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
          {loading ? "Comparing…" : "Compare"}
        </button>

        {/* Results */}
        {result && (
          <div className="mt-6 space-y-6">
            {/* Side-by-side stats */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-card/80 p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">{result.period_a.label}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Income</span><span className="font-medium text-emerald">{fmt(result.period_a.income)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Spend</span><span className="font-medium text-ruby">{fmt(result.period_a.spend)}</span></div>
                  <div className="flex justify-between text-sm border-t border-border pt-2">
                    <span className="text-muted-foreground">Net</span>
                    <span className={`font-medium ${result.period_a.income - result.period_a.spend >= 0 ? "text-emerald" : "text-ruby"}`}>
                      {fmt(result.period_a.income - result.period_a.spend)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Transactions</span><span className="font-medium">{result.period_a.count}</span></div>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">{result.period_b.label}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Income</span><span className="font-medium text-emerald">{fmt(result.period_b.income)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Spend</span><span className="font-medium text-ruby">{fmt(result.period_b.spend)}</span></div>
                  <div className="flex justify-between text-sm border-t border-border pt-2">
                    <span className="text-muted-foreground">Net</span>
                    <span className={`font-medium ${result.period_b.income - result.period_b.spend >= 0 ? "text-emerald" : "text-ruby"}`}>
                      {fmt(result.period_b.income - result.period_b.spend)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Transactions</span><span className="font-medium">{result.period_b.count}</span></div>
                </div>
              </div>
            </div>

            {/* Change summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-secondary/30 p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Spend change</span>
                <ChangeBadge pct={result.spend_change_pct} />
              </div>
              <div className="rounded-xl bg-secondary/30 p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Income change</span>
                <ChangeBadge pct={result.income_change_pct} />
              </div>
            </div>

            {/* Category breakdown */}
            {result.category_breakdown?.length > 0 && (
              <div>
                <p className="label-overline mb-3">Category breakdown</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="pb-2 font-medium">Category</th>
                        <th className="pb-2 text-right font-medium">Period A</th>
                        <th className="pb-2 text-right font-medium">Period B</th>
                        <th className="pb-2 text-right font-medium">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.category_breakdown.map((cat) => (
                        <tr key={cat.category} className="border-b border-border/50 last:border-0">
                          <td className="py-2 capitalize">{cat.category}</td>
                          <td className="py-2 text-right font-medium tabular-nums">{fmt(cat.a_spend)}</td>
                          <td className="py-2 text-right font-medium tabular-nums">{fmt(cat.b_spend)}</td>
                          <td className="py-2 text-right"><ChangeBadge pct={cat.change_pct} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

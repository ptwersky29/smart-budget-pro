import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Star, AlertTriangle } from "lucide-react";
import Skeleton from "../components/ui/Skeleton";

function daysLeftInMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  return { dayOfMonth, daysInMonth, remaining: daysInMonth - dayOfMonth };
}

const fmt = (n) => `£${Number(n || 0).toFixed(2)}`;

function Stat({ label, value, accent = "emerald" }) {
  const tone =
    accent === "ruby" ? "text-ruby" :
    accent === "topaz" ? "text-topaz" :
    "text-emerald";
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl tracking-tight font-medium ${tone}`}>{value}</p>
    </div>
  );
}

export default React.memo(function MaaserBalanceWidget() {
  const [sum, setSum] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/jewish/maaser/summary");
      setSum(data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { dayOfMonth, remaining } = useMemo(() => daysLeftInMonth(), []);
  const pctUsed = sum?.obligation > 0 ? Math.min((sum.balance_owed / sum.obligation) * 100, 100) : 0;
  const dailySafe = remaining > 0 && sum?.balance_owed > 0 ? sum.balance_owed / remaining : 0;
  const pctColor = pctUsed < 50 ? "emerald" : pctUsed < 80 ? "topaz" : "ruby";
  const barColor = pctUsed < 50 ? "from-emerald to-emerald/70" : pctUsed < 80 ? "from-topaz to-topaz/70" : "bg-ruby";
  const showWarning = pctUsed >= 80 && sum?.balance_owed > 0;

  return (
    <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-topaz" />
          <p className="label-overline">Maaser Balance</p>
        </div>
        {showWarning && (
          <span className="inline-flex items-center gap-1 text-xs text-ruby font-medium">
            <AlertTriangle className="h-3 w-3" /> Balance high
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : !sum ? (
        <p className="text-sm text-muted-foreground">Could not load Maaser data.</p>
      ) : !sum.enabled && sum.balance_owed === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">Maaser tracking is off.</p>
          <p className="text-xs text-muted-foreground mt-1">Enable it in Settings or the Jewish Tools page.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Obligation" value={fmt(sum.obligation)} accent="topaz" />
            <Stat label="Given" value={fmt(sum.given_total)} accent="emerald" />
            <Stat label="Balance Owed" value={fmt(sum.balance_owed)} accent={sum.balance_owed > 0 ? "ruby" : "emerald"} />
            <Stat label={remaining > 0 ? "Daily safe spend" : "Month ends today"} value={remaining > 0 ? fmt(dailySafe) : "—"} accent={pctColor} />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className={`font-medium tabular-nums ${{ emerald: "text-emerald", topaz: "text-topaz", ruby: "text-ruby" }[pctColor]}`}>{Math.round(pctUsed)}%</span>
            </div>
            <div className="h-2.5 bg-secondary rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(pctUsed)} aria-valuemin={0} aria-valuemax={100} aria-label="Maaser balance progress">
              <div className={`h-full rounded-full transition-all ${pctUsed < 80 ? "bg-gradient-to-r " + barColor : barColor}`} style={{ width: `${pctUsed}%` }} />
            </div>
          </div>

          {showWarning && (
            <div className="mt-3 rounded-xl border border-ruby/20 bg-ruby/5 px-4 py-2.5 text-xs text-ruby flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Your Maaser balance is {Math.round(pctUsed)}% of obligation — consider giving soon.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
});

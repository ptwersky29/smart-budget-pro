import React, { useState } from "react";
import { api } from "../lib/api";
import { Sparkles, Loader2, TrendingUp, TrendingDown, AlertCircle, Wallet, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const ICONS = {
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  alert: AlertCircle,
  sparkle: Sparkles,
  wallet: Wallet,
};

const SEVERITY = {
  good:     { dot: "bg-emerald",  text: "text-emerald" },
  neutral:  { dot: "bg-muted-foreground", text: "text-foreground" },
  warning:  { dot: "bg-topaz",    text: "text-topaz" },
  critical: { dot: "bg-ruby",     text: "text-ruby" },
};

export default function AIInsightPanel({ title = "AI Insights", subtitle, endpoint, body, autoLoad = false, render }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const { data: resp } = await api.post(endpoint, body || {});
      setData(resp);
      setLoaded(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not generate insights");
    } finally { setBusy(false); }
  };

  React.useEffect(() => { if (autoLoad && !loaded && !busy) generate(); /* eslint-disable-next-line */ }, [autoLoad]);

  return (
    <div className="rounded-2xl border border-border bg-card p-6" data-testid="ai-insight-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg gradient-emerald grid place-items-center">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <p className="label-overline text-emerald">{title}</p>
          </div>
          {subtitle && <h3 className="text-2xl tracking-tight font-medium mt-2">{subtitle}</h3>}
        </div>
        <button onClick={generate} disabled={busy} data-testid="ai-generate"
                className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-border hover:border-emerald hover:text-emerald disabled:opacity-50">
          {busy ? <Loader2 className="h-3 w-3 animate-spin"/> : <RefreshCw className="h-3 w-3"/>}
          {data ? "Regenerate" : "Generate"}
        </button>
      </div>

      {!data && !busy && (
        <p className="mt-4 text-sm text-muted-foreground">
          Click <span className="font-medium text-foreground">Generate</span> for AI-powered insights based on your latest data.
        </p>
      )}
      {busy && !data && (
        <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-emerald" />
          Analysing your finances with Claude Sonnet 4.5…
        </div>
      )}
      {data && (render ? render(data) : <DefaultInsights data={data} />)}
    </div>
  );
}

function DefaultInsights({ data }) {
  if (data.note && (!data.insights || data.insights.length === 0)) {
    return <p className="mt-4 text-sm text-muted-foreground">{data.note}</p>;
  }
  return (
    <div className="mt-5 space-y-4">
      {data.headline && <p className="text-lg font-medium tracking-tight leading-snug">{data.headline}</p>}
      {data.insights && (
        <div className="space-y-3">
          {data.insights.map((it, i) => {
            const sev = SEVERITY[it.severity] || SEVERITY.neutral;
            return (
              <div key={i} className="flex gap-3">
                <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${sev.dot}`} />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${sev.text}`}>{it.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{it.body}</p>
                  {it.action && (
                    <p className="text-xs mt-1.5 text-emerald font-medium">→ {it.action}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {data.next_step && (
        <div className="mt-4 p-4 rounded-xl bg-emerald/5 border border-emerald/30">
          <p className="label-overline text-emerald">Next step</p>
          <p className="text-sm mt-1.5 font-medium">{data.next_step}</p>
        </div>
      )}
    </div>
  );
}

export { ICONS, SEVERITY };

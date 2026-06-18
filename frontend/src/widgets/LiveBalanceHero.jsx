import React, { useEffect, useState } from "react";
import { RefreshCw, Wallet, ChevronUp, ChevronDown } from "lucide-react";

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default React.memo(function LiveBalanceHero({ overview, trendData, loading, onRefresh, children }) {
  const [syncTime] = useState(() => Date.now());
  const [syncLabel, setSyncLabel] = useState("syncing...");

  useEffect(() => {
    if (!loading) setSyncLabel(`Updated ${timeAgo(syncTime)}`);
  }, [loading, syncTime]);

  const balance = overview?.balance ?? 0;
  const trend = trendData?.direction === "up";

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-card via-card/95 to-card/90 backdrop-blur-xl shadow-card">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-topaz/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald/10 text-emerald">
                <Wallet className="h-4 w-4" />
              </span>
              <p className="label-overline text-muted-foreground">Total Balance</p>
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-4xl sm:text-5xl lg:text-6xl tracking-tight font-semibold leading-none">
                £{Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {trendData && (
                <span className={`inline-flex items-center gap-1 text-sm font-medium ${trend ? "text-emerald" : "text-ruby"}`}>
                  {trend ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {trendData.direction === "up" ? "+" : ""}£{Math.abs(trendData.values[trendData.values.length - 1] - trendData.values[0]).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/60 text-xs text-muted-foreground border border-border/50">
              <span className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-topaz animate-pulse" : "bg-emerald"}`} />
              {loading ? "refreshing..." : syncLabel}
            </span>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="h-9 w-9 rounded-full border border-border/60 bg-secondary/30 hover:bg-secondary/60 grid place-items-center transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {children && <div className="mt-6 sm:mt-8 grid grid-cols-2 xl:grid-cols-4 gap-3">{children}</div>}
      </div>
    </div>
  );
});

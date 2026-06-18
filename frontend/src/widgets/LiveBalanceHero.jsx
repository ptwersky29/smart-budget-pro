import React, { useEffect, useState } from "react";
import { RefreshCw, Wallet, ChevronUp, ChevronDown, Building2 } from "lucide-react";
import { getBankLogoUrl, toAccountTypeLabel } from "../data/bankLogos";

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default React.memo(function LiveBalanceHero({ overview, truelayerBalance, accounts, trendData, loading, onRefresh, children }) {
  const [syncTime] = useState(() => Date.now());
  const [syncLabel, setSyncLabel] = useState("syncing...");

  useEffect(() => {
    if (!loading) setSyncLabel(`Updated ${timeAgo(syncTime)}`);
  }, [loading, syncTime]);

  const hasAccounts = Array.isArray(accounts) && accounts.length > 0;
  const displayBalance = hasAccounts ? (truelayerBalance ?? overview?.balance ?? 0) : (overview?.balance ?? 0);
  const trend = trendData?.direction === "up";

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-card via-card/95 to-card/90 backdrop-blur-xl shadow-card">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-topaz/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative p-5 sm:p-6 lg:p-8">
        {/* Top row: Balance + Sync */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald/10 text-emerald">
                <Wallet className="h-3.5 w-3.5" />
              </span>
              <p className="label-overline text-muted-foreground">
                {hasAccounts ? "Total Bank Balance" : "Total Balance"}
              </p>
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-3xl sm:text-4xl lg:text-5xl tracking-tight font-semibold leading-none">
                £{Number(displayBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/60 text-[11px] text-muted-foreground border border-border/50">
              <span className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-topaz animate-pulse" : "bg-emerald"}`} />
              {loading ? "refreshing..." : syncLabel}
            </span>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="h-8 w-8 rounded-full border border-border/60 bg-secondary/30 hover:bg-secondary/60 grid place-items-center transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Account cards — inline row */}
        {hasAccounts && (
          <div className="mt-4 flex flex-wrap gap-2">
            {accounts.map((acct) => {
              const institution = acct.institution;
              const logoUrl = getBankLogoUrl(institution);
              const balance = acct.balance ?? 0;
              return (
                <div key={acct.connection_id} className="inline-flex items-center gap-2 rounded-lg bg-card/80 border border-border/40 px-2.5 py-1.5">
                  <div className="relative shrink-0 h-6 w-6 rounded-full bg-white dark:bg-secondary/40 flex items-center justify-center overflow-hidden">
                    {logoUrl ? (
                      <img src={logoUrl} alt={institution || acct.account_name} className="h-4 w-4 object-contain" loading="lazy" />
                    ) : (
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium leading-tight">{institution || acct.account_name}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      £{Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {children && <div className="mt-5 sm:mt-6 grid grid-cols-2 xl:grid-cols-4 gap-3">{children}</div>}
      </div>
    </div>
  );
});

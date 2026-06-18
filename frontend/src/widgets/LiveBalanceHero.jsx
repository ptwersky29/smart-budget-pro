import React, { useEffect, useState } from "react";
import { RefreshCw, Wallet, ChevronUp, ChevronDown, Building2 } from "lucide-react";
import { getBankLogoUrl, getBankColor, getInitials, toAccountTypeLabel } from "../data/bankLogos";

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function AccountCard({ account }) {
  const institution = account.institution;
  const logoUrl = getBankLogoUrl(institution);
  const bankColor = getBankColor(institution);
  const balance = account.balance ?? 0;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-3 transition-all duration-200 hover:bg-card/90 hover:shadow-sm">
      <div className="relative shrink-0 h-9 w-9 rounded-full border border-border/50 bg-white dark:bg-secondary/40 flex items-center justify-center overflow-hidden" style={logoUrl ? {} : { backgroundColor: bankColor + "15" }}>
        {logoUrl ? (
          <img src={logoUrl} alt={institution || account.account_name} className="h-5 w-5 object-contain" loading="lazy" />
        ) : (
          <Building2 className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium truncate">{institution || account.account_name}</p>
          {account.nickname && account.nickname !== institution && (
            <span className="text-[10px] text-muted-foreground truncate">· {account.nickname}</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">{toAccountTypeLabel(account.account_type)}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold tabular-nums">
          £{Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  );
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
  const accountCount = hasAccounts ? accounts.length : 0;

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
              <p className="label-overline text-muted-foreground">
                {hasAccounts ? "Total Bank Balance" : "Total Balance"}
              </p>
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-4xl sm:text-5xl lg:text-6xl tracking-tight font-semibold leading-none">
                £{Number(displayBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {trendData && (
                <span className={`inline-flex items-center gap-1 text-sm font-medium ${trend ? "text-emerald" : "text-ruby"}`}>
                  {trend ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {trendData.direction === "up" ? "+" : ""}£{Math.abs(trendData.values[trendData.values.length - 1] - trendData.values[0]).toLocaleString()}
                </span>
              )}
            </div>
            {hasAccounts && (
              <p className="text-xs text-muted-foreground mt-1">
                {accountCount} account{accountCount !== 1 ? "s" : ""} connected · synced from TrueLayer
              </p>
            )}
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

        {/* Account cards */}
        {hasAccounts && (
          <div className="mt-5 sm:mt-6 space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Connected Accounts</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {accounts.map((acct) => (
                <AccountCard key={acct.connection_id} account={acct} />
              ))}
            </div>
          </div>
        )}

        {children && <div className="mt-6 sm:mt-8 grid grid-cols-2 xl:grid-cols-4 gap-3">{children}</div>}
      </div>
    </div>
  );
});

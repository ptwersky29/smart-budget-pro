import React, { useCallback, useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Loader2, RefreshCcw, ShieldCheck, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import { isPublicDemo } from "../lib/demoSession";

export default function Trading212BalanceCard({ compact = false }) {
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    if (isPublicDemo()) {
      setStatus("hidden");
      return;
    }
    if (force) setRefreshing(true);
    try {
      const { data } = await api.get("/trading212/summary", {
        params: force ? { refresh: true } : {},
        headers: { "Cache-Control": "no-store" },
      });
      setSummary(data);
      setMessage("");
      setStatus(data.connected ? "connected" : "awaiting_keys");
    } catch (error) {
      if (error?.response?.status === 404) {
        setStatus("hidden");
      } else {
        setStatus("error");
        setMessage(error?.response?.data?.detail || "Could not retrieve your Trading 212 balance.");
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (status === "hidden") return null;
  const money = value => {
    try {
      return new Intl.NumberFormat("en-GB", {
        style: "currency", currency: summary?.currency || "GBP", maximumFractionDigits: 2,
      }).format(Number(value) || 0);
    } catch {
      return String(value ?? "—");
    }
  };
  const profit = Number(summary?.unrealized_profit_loss || 0);
  const ProfitIcon = profit < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <section className={`surface min-w-0 rounded-2xl border border-border/70 bg-card ${compact ? "p-4" : "p-5"}`} aria-label="Trading 212 account balance" data-testid="trading212-balance">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-.03em]">Trading 212</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Read-only connection
            </p>
          </div>
        </div>
        <button type="button" onClick={() => load(true)} disabled={refreshing || status === "loading"}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-secondary/40 px-3 text-xs font-semibold hover:bg-secondary disabled:opacity-60"
          aria-label="Refresh Trading 212 balance">
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {status === "loading" ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading your Trading 212 balance…</p>
      ) : status === "awaiting_keys" ? (
        <div className="mt-4 rounded-xl bg-secondary/50 p-3">
          <p className="text-sm font-semibold">Awaiting secure connection</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Add your Trading 212 read-only API key and secret in the Penni Render service to display the live balance.</p>
        </div>
      ) : status === "error" ? (
        <p role="alert" className="mt-4 text-xs text-destructive">{message}</p>
      ) : (
        <>
          <p className="mt-5 text-xs font-medium text-muted-foreground">Portfolio value</p>
          <p className="money-tabular mt-1 text-[clamp(26px,2.5vw,36px)] font-semibold leading-tight tracking-[-.045em]">
            {money(summary.total_value)}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="min-w-0 rounded-xl bg-secondary/50 p-3">
              <p className="text-[11px] text-muted-foreground">Available cash</p>
              <p className="money-tabular mt-1 truncate text-sm font-semibold" title={money(summary.cash_available)}>{money(summary.cash_available)}</p>
            </div>
            <div className="min-w-0 rounded-xl bg-secondary/50 p-3">
              <p className="text-[11px] text-muted-foreground">Invested</p>
              <p className="money-tabular mt-1 truncate text-sm font-semibold" title={money(summary.investments_value)}>{money(summary.investments_value)}</p>
            </div>
            <div className="min-w-0 rounded-xl bg-secondary/50 p-3">
              <p className="text-[11px] text-muted-foreground">Unrealised P/L</p>
              <p className={`money-tabular mt-1 flex items-center gap-0.5 truncate text-sm font-semibold ${profit < 0 ? "text-ruby" : "text-emerald"}`}>
                <ProfitIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{money(profit)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Updated {summary.updated_at ? new Date(summary.updated_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "recently"} · Shown separately from bank totals to avoid double-counting.
          </p>
        </>
      )}
    </section>
  );
}

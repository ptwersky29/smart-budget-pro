import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, RefreshCcw } from "lucide-react";
import { api, formatApiError } from "../lib/api";

const TYPES = [
  { id: "transactions", label: "Cash movements" },
  { id: "orders", label: "Trades" },
];

function money(amount, currency = "GBP") {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency", currency, minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return Number(amount).toFixed(2) + " " + currency;
  }
}

export default function Trading212Activity({ compact = false }) {
  const [kind, setKind] = useState("transactions");
  const [items, setItems] = useState([]);
  const [nextPage, setNextPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    const current = ++requestId.current;
    setItems([]);
    setNextPage(null);
    setLoading(true);
    setError("");
    api.get("/trading212/activity", { params: { kind } })
      .then(({ data }) => {
        if (!active || current !== requestId.current) return;
        setItems(data.items || []);
        setNextPage(data.next_page || null);
      })
      .catch(err => {
        if (!active || current !== requestId.current) return;
        setError(formatApiError(err.response?.data?.detail || err) || "Could not load Trading 212 history");
      })
      .finally(() => { if (active && current === requestId.current) setLoading(false); });
    return () => { active = false; };
  }, [kind]);

  const loadMore = async () => {
    if (loadingMore || !nextPage) return;
    const current = requestId.current;
    const page = nextPage;
    setLoadingMore(true);
    setError("");
    try {
      const { data } = await api.get("/trading212/activity", {
        params: { kind, next_page: page },
      });
      if (current !== requestId.current) return;
      setItems(previous => {
        const ids = new Set(previous.map(row => row.id));
        return [...previous, ...(data.items || []).filter(row => !ids.has(row.id))];
      });
      setNextPage(data.next_page || null);
    } catch (err) {
      if (current === requestId.current) {
        setError(formatApiError(err.response?.data?.detail || err) || "Could not load more history");
      }
    } finally {
      if (current === requestId.current) setLoadingMore(false);
    }
  };

  return (
    <section className="surface min-w-0 overflow-hidden rounded-2xl border border-border/60" aria-label="Trading 212 historical activity">
      <header className={`flex flex-wrap items-center justify-between gap-3 ${compact ? "p-4" : "p-5"} pb-3`}>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Trading 212 history</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Broker-reported history, read-only · not counted twice in Penni balances
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border/60 bg-secondary/40 p-1" aria-label="Trading 212 history type">
          {TYPES.map(type => (
            <button type="button" key={type.id} onClick={() => setKind(type.id)}
              aria-pressed={kind === type.id}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] transition ${kind === type.id
                ? "bg-card font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"}`}>
              {type.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div role="alert" className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>{error}. You may need to enable the matching History permissions for your read-only API key.</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 px-5 py-8 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading historical activity…
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 py-7 text-xs text-muted-foreground">
          {error ? "Historical activity could not be retrieved." : kind === "orders"
            ? "No trade records returned by Trading 212."
            : "No deposits, withdrawals or other cash movements returned."}
        </p>
      ) : (
        <div className="max-h-[360px] divide-y divide-border/60 overflow-y-auto subtle-scroll">
          {items.map((row, i) => {
            const amount = money(row.amount, row.currency);
            const date = row.date ? new Date(row.date) : null;
            const dateLabel = date && !Number.isNaN(date.getTime())
              ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
              : "Date unavailable";
            return (
              <div key={row.id + ":" + i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/70 text-[11px] font-bold text-muted-foreground">
                  {kind === "orders" ? "↗" : row.amount > 0 ? "+" : "−"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{row.description || row.type}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {dateLabel} · {row.type}
                    {row.ticker && row.ticker !== row.description ? ` · ${row.ticker}` : ""}
                    {row.quantity !== undefined && row.quantity !== null ? ` · ${row.quantity} units` : ""}
                  </p>
                </div>
                {amount !== null && (
                  <span className={`shrink-0 text-xs font-semibold tabular-nums ${kind === "transactions" && row.amount > 0 ? "text-emerald" : "text-foreground"}`}>
                    {amount}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {nextPage && !loading && (
        <div className="flex justify-center border-t border-border/60 p-3">
          <button type="button" disabled={loadingMore} onClick={loadMore}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:bg-secondary disabled:opacity-50">
            {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Load older activity
          </button>
        </div>
      )}
      <footer className="flex items-start gap-2 border-t border-border/50 px-4 py-3 text-[11px] text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Trading 212 provides historical activity, but not an exact historical portfolio-value chart through this API.
      </footer>
    </section>
  );
}

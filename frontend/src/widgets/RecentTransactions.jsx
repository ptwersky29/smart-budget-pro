import React from "react";
import { Link } from "react-router-dom";

export default React.memo(function RecentTransactions({ overview }) {
  if (!overview?.recent) return null;
  const txs = overview.recent.slice(0, 5);
  if (txs.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/70">
        <div>
          <p className="label-overline">Recent</p>
          <p className="text-sm font-medium mt-0.5">Transactions</p>
        </div>
        <Link to="/transactions" className="text-xs text-emerald font-medium hover:underline">View all</Link>
      </div>
      <div className="block sm:hidden divide-y divide-border/60">
        {txs.map((t) => (
          <div key={t.transaction_id} className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{t.date?.slice(0, 10)}</p>
              <p className="text-sm font-medium truncate">{t.description}</p>
              <span className="text-xs text-muted-foreground capitalize">{t.category}</span>
            </div>
            <span className={`shrink-0 font-medium tabular-nums text-sm ${t.amount > 0 ? "text-emerald" : ""}`}>
              {t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border/60 bg-secondary/20">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Description</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.transaction_id} className="border-b border-border/40 last:border-0 hover:bg-secondary/20">
                <td className="px-5 py-3 text-muted-foreground text-xs">{t.date?.slice(0, 10)}</td>
                <td className="px-5 py-3 font-medium truncate max-w-[200px]">{t.description}</td>
                <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-secondary capitalize">{t.category || "uncategorized"}</span></td>
                <td className={`px-5 py-3 text-right font-medium tabular-nums ${t.amount > 0 ? "text-emerald" : ""}`}>{t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

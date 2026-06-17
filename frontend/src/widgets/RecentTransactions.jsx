import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ArrowUpDown } from "lucide-react";

const CAT_COLORS = {
  housing: "bg-blue-400",
  food: "bg-orange-400",
  transport: "bg-purple-400",
  utilities: "bg-cyan-400",
  entertainment: "bg-pink-400",
  health: "bg-emerald-400",
  education: "bg-yellow-400",
  shopping: "bg-rose-400",
  income: "bg-emerald-500",
  salary: "bg-emerald-500",
  transfer: "bg-sky-400",
  other: "bg-zinc-400",
};

function catColor(cat) {
  return CAT_COLORS[cat?.toLowerCase()] || "bg-zinc-400";
}

function formatCurrency(n) {
  const abs = Math.abs(n).toFixed(2);
  return n >= 0 ? `+£${abs}` : `-£${abs}`;
}

export default React.memo(function RecentTransactions({ overview }) {
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState("desc");

  const allTxs = overview?.recent || [];
  if (allTxs.length === 0) return null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let result = q
      ? allTxs.filter(
          (t) =>
            (t.description || "").toLowerCase().includes(q) ||
            (t.category || "").toLowerCase().includes(q),
        )
      : allTxs;
    result = [...result].sort((a, b) => {
      const da = new Date(a.date || 0).getTime();
      const db = new Date(b.date || 0).getTime();
      return sortDir === "desc" ? db - da : da - db;
    });
    return result.slice(0, 15);
  }, [allTxs, search, sortDir]);

  return (
    <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card overflow-hidden lg:sticky lg:top-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border/70">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <p className="label-overline">Recent</p>
            <p className="text-sm font-medium mt-0.5">Transactions</p>
          </div>
          <Link to="/transactions" className="text-xs text-emerald font-medium hover:underline shrink-0">
            View all
          </Link>
        </div>
        {/* Search */}
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Filter transactions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-8 pr-3 text-xs rounded-lg bg-secondary/60 border border-border/60 focus:border-ring focus:outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>
      </div>

      {/* Transaction list — scrollable */}
      <div className="max-h-[calc(100vh-18rem)] overflow-y-auto scroll-smooth">
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-xs text-muted-foreground">No matching transactions</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border/40 bg-secondary/10">
                    <th className="px-5 py-2.5 font-medium">Date</th>
                    <th className="px-5 py-2.5 font-medium">Description</th>
                    <th className="px-5 py-2.5 font-medium text-right">
                      <button
                        onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        Amount
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr
                      key={t.transaction_id}
                      className="border-b border-border/20 last:border-0 hover:bg-secondary/20 transition-colors"
                    >
                      <td className="px-5 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {t.date?.slice(0, 10)}
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${catColor(t.category)}`}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate max-w-[160px]">
                              {t.description}
                            </p>
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {t.category || "uncategorized"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td
                        className={`px-5 py-2.5 text-right text-sm font-medium tabular-nums whitespace-nowrap ${
                          t.amount > 0 ? "text-emerald" : ""
                        }`}
                      >
                        {formatCurrency(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="sm:hidden divide-y divide-border/40">
              {filtered.map((t) => (
                <div key={t.transaction_id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${catColor(t.category)}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.date?.slice(0, 10)}
                        <span className="ml-1.5 capitalize">· {t.category || "uncategorized"}</span>
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 font-medium tabular-nums text-sm ${
                      t.amount > 0 ? "text-emerald" : ""
                    }`}
                  >
                    {formatCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom link */}
      <div className="border-t border-border/40 px-5 py-2.5 text-center">
        <Link
          to="/transactions"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all transactions →
        </Link>
      </div>
    </div>
  );
});

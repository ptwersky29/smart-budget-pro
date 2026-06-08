import React from "react";

function ProgressBar({ value, max, color = "emerald" }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const colorClass = color === "ruby"
    ? "bg-ruby" : color === "topaz"
    ? "bg-topaz" : "bg-emerald";
  return (
    <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default React.memo(function EverydaySpending({ data, loading }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card/50 p-4 animate-pulse">
            <div className="h-4 w-32 bg-muted rounded mb-2" />
            <div className="h-2 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!data?.categories?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No spending categories set up yet.</p>
        <p className="text-xs mt-1">Add a day-to-day budget to get started.</p>
      </div>
    );
  }

  const { categories, totals } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border pb-2">
        <span>Category</span>
        <div className="flex items-center gap-4">
          <span className="w-16 text-right">Budget</span>
          <span className="w-16 text-right">Actual</span>
          <span className="w-16 text-right hidden sm:block">Forecast</span>
        </div>
      </div>
      {categories.map((cat) => {
        const over = cat.actual > cat.budgeted;
        return (
          <div key={cat.id} className="rounded-xl border border-border bg-card/50 p-3 sm:p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{cat.name}</span>
              <div className="flex items-center gap-4 text-xs tabular-nums">
                <span className="w-16 text-right text-muted-foreground">£{cat.budgeted}</span>
                <span className={`w-16 text-right font-medium ${over ? "text-ruby" : ""}`}>£{cat.actual}</span>
                <span className="w-16 text-right text-muted-foreground hidden sm:block">£{cat.forecast}</span>
              </div>
            </div>
            <ProgressBar value={cat.actual} max={cat.budgeted} color={over ? "ruby" : cat.actual > cat.budgeted * 0.85 ? "topaz" : "emerald"} />
            <div className="flex items-center justify-between text-xs">
              <span className={over ? "text-ruby" : "text-muted-foreground"}>
                {over ? `£${Math.abs(cat.remaining)} over` : `£${cat.remaining} left`}
              </span>
              <span className="text-muted-foreground">{cat.forecast > cat.budgeted ? "Likely over budget" : "On track"}</span>
            </div>
          </div>
        );
      })}
      {totals && (
        <div className="flex items-center justify-between text-sm font-medium border-t border-border pt-3">
          <span>Total</span>
          <div className="flex items-center gap-4 text-xs tabular-nums">
            <span className="w-16 text-right">£{totals.budgeted}</span>
            <span className="w-16 text-right">£{totals.actual}</span>
          </div>
        </div>
      )}
    </div>
  );
});

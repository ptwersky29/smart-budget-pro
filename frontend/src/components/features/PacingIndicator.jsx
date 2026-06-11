import React, { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function getMonthProgress() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  return dayOfMonth / daysInMonth;
}

function getPaceStatus(budgetPct, monthPct) {
  const ratio = budgetPct / (monthPct || 0.01);
  if (ratio > 1.15) return "over";
  if (ratio < 0.85) return "under";
  return "on-track";
}

export default React.memo(function PacingIndicator({ totalBudgeted, totalSpent, compact }) {
  const monthPct = useMemo(() => getMonthProgress(), []);
  const budgetPct = useMemo(() => (totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0), [totalBudgeted, totalSpent]);
  const pace = useMemo(() => getPaceStatus(budgetPct, monthPct * 100), [budgetPct, monthPct]);

  const paceConfig = {
    over: {
      color: "text-ruby",
      bg: "bg-ruby/10",
      border: "border-ruby/20",
      icon: TrendingUp,
      label: "Spending faster than planned",
      detail: `Month ${Math.round(monthPct * 100)}% complete, ${Math.round(budgetPct)}% of budget used`,
      suggestion: "Consider reducing discretionary spending to stay on track",
    },
    "on-track": {
      color: "text-topaz",
      bg: "bg-topaz/10",
      border: "border-topaz/20",
      icon: Minus,
      label: "On pace",
      detail: `Month ${Math.round(monthPct * 100)}% complete, ${Math.round(budgetPct)}% of budget used`,
      suggestion: "You're spending at a healthy pace",
    },
    under: {
      color: "text-emerald",
      bg: "bg-emerald/10",
      border: "border-emerald/20",
      icon: TrendingDown,
      label: "Spending slower than planned",
      detail: `Month ${Math.round(monthPct * 100)}% complete, ${Math.round(budgetPct)}% of budget used`,
      suggestion: "You're under budget — keep it up!",
    },
  };

  const cfg = paceConfig[pace];
  const Icon = cfg.icon;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${cfg.bg} ${cfg.border} border`}>
        <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
        <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
          {Math.round(monthPct * 100)}% month · {Math.round(budgetPct)}% spent
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-full ${cfg.bg}`}>
          <Icon className={`h-5 w-5 ${cfg.color}`} />
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{cfg.detail}</p>
        </div>
      </div>

      {/* Double progress bars: month vs budget */}
      <div className="mt-3 space-y-2">
        <div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>Month elapsed</span>
            <span className="tabular-nums">{Math.round(monthPct * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
            <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${monthPct * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>Budget used</span>
            <span className="tabular-nums">{Math.round(budgetPct)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pace === "over" ? "bg-ruby" : pace === "on-track" ? "bg-topaz" : "bg-emerald"}`}
              style={{ width: `${Math.min(budgetPct, 100)}%` }} />
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-2">{cfg.suggestion}</p>
    </div>
  );
});

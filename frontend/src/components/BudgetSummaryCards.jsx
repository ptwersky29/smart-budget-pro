import React from "react";
import { Wallet, TrendingDown, PiggyBank, Target } from "lucide-react";
import { MetricCard } from "./ui/layout";

export default React.memo(function BudgetSummaryCards({ data, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-[1.5rem] border border-border bg-card/90 backdrop-blur-xl p-4 sm:p-5 animate-pulse">
            <div className="h-3 w-16 bg-muted rounded mb-3" />
            <div className="h-8 w-24 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { summary } = data;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <MetricCard
        label="Total Budgeted"
        value={`£${summary.budgeted.toLocaleString()}`}
        icon={Wallet}
        tone="emerald"
        detail="For this month"
      />
      <MetricCard
        label="Spent So Far"
        value={`£${summary.spent.toLocaleString()}`}
        icon={TrendingDown}
        tone="ruby"
        detail={`${summary.income > 0 ? ((summary.spent / summary.income) * 100).toFixed(0) : 0}% of income`}
      />
      <MetricCard
        label="Remaining"
        value={`£${Math.max(0, summary.remaining).toLocaleString()}`}
        icon={PiggyBank}
        tone={summary.remaining < 0 ? "ruby" : "topaz"}
        detail={summary.remaining < 0 ? "Over budget!" : "Left to spend"}
      />
      <MetricCard
        label="Budget Adherence"
        value={`${summary.budget_adherence}%`}
        icon={Target}
        tone={summary.budget_adherence >= 80 ? "emerald" : summary.budget_adherence >= 50 ? "topaz" : "ruby"}
        detail={summary.predicted_eom > 0 ? `EoM: £${summary.predicted_eom.toLocaleString()}` : "Track spending"}
      />
    </div>
  );
});

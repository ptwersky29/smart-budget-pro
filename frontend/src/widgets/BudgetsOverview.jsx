import React from "react";
import { Link } from "react-router-dom";
import { PiggyBank, ArrowRight } from "lucide-react";
import PacingIndicator from "../components/features/PacingIndicator";

export default React.memo(function BudgetsOverview({ budgets, currentMonthBudget }) {
  return (
    <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="label-overline">Budgets</p>
        <Link to="/budgets" className="text-xs text-emerald font-medium hover:underline shrink-0">Manage</Link>
      </div>

      {currentMonthBudget && (
        <div className="mb-4">
          <PacingIndicator
            totalBudgeted={currentMonthBudget.total}
            totalSpent={currentMonthBudget.spent}
            compact
          />
        </div>
      )}
      {(!budgets || budgets.length === 0) ? (
        <Link to="/budgets" className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-emerald/40 transition-colors">
          <PiggyBank className="h-4 w-4" />
          <span>Set your first budget</span>
          <ArrowRight className="h-4 w-4 ml-auto" />
        </Link>
      ) : (
        <div className="space-y-3">
          {budgets.slice(0, 4).map((b) => {
            const pct = Math.min(b.progress_pct || 0, 100);
            const over = (b.progress_pct || 0) >= 100;
            return (
              <div key={b.budget_id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium capitalize truncate">{b.category}</span>
                  <span className={`tabular-nums ${over ? "text-ruby font-medium" : "text-muted-foreground"}`}>
                    £{Math.abs(b.spent || 0).toFixed(0)} / £{b.limit.toFixed(0)}
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${over ? "bg-ruby" : "bg-gradient-to-r from-emerald to-emerald/70"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

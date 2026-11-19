import React from "react";
import { ArrowDownLeft, ArrowUpRight, TrendingUp, Clock3 } from "lucide-react";
import { formatCurrency } from "../lib/format";

/** Compact totals, intentionally secondary to the transaction register. */
export default function TransactionWorkspaceSummary({ income, expenses, net, reviewCount, reviewLabel = "To review", periodLabel }) {
  const metrics = [
    { label: "Income", value: income, color: "income", icon: ArrowDownLeft },
    { label: "Expenses", value: expenses, color: "expense", icon: ArrowUpRight },
    { label: "Net movement", value: net, color: "net", icon: TrendingUp },
  ];
  return (
    <section className="penni-workspace-summary" aria-label={periodLabel ? `Transaction totals for ${periodLabel}` : "Transaction totals"}>
      {metrics.map(({ label, value, color, icon: Icon }) => (
        <div className={`penni-workspace-summary-item is-${color}`} key={label}>
          <span className="penni-workspace-summary-icon" aria-hidden="true"><Icon size={15} /></span>
          <span className="penni-workspace-summary-copy">
            <span className="penni-workspace-summary-label">{label}</span>
            <span className="penni-workspace-summary-value money-tabular">{formatCurrency(Number(value) || 0)}</span>
          </span>
        </div>
      ))}
      <div className="penni-workspace-summary-item is-review">
        <span className="penni-workspace-summary-icon" aria-hidden="true"><Clock3 size={15} /></span>
        <span className="penni-workspace-summary-copy">
          <span className="penni-workspace-summary-label">{reviewLabel}</span>
          <span className="penni-workspace-summary-value money-tabular">{Number(reviewCount) || 0}</span>
        </span>
      </div>
    </section>
  );
}

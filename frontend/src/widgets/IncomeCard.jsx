import React from "react";
import { ArrowUpRight } from "lucide-react";
import { MetricCard } from "../components/ui/layout";

export default React.memo(function IncomeCard({ overview }) {
  if (!overview) return null;
  return (
    <MetricCard label="Income" value={`£${overview.income.toLocaleString()}`} icon={ArrowUpRight} tone="emerald"
      detail={<span className="text-xs text-muted-foreground">this month</span>} />
  );
});

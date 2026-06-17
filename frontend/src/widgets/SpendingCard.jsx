import React from "react";
import { ArrowDownRight } from "lucide-react";
import { MetricCard } from "../components/ui/layout";

export default React.memo(function SpendingCard({ overview }) {
  if (!overview) return null;
  return (
    <MetricCard label="Spending" value={`£${overview.spend.toLocaleString()}`} icon={ArrowDownRight} tone="ruby"
      detail={<span className="text-xs text-muted-foreground">this month</span>} />
  );
});

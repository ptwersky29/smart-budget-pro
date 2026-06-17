import React from "react";
import { Wallet } from "lucide-react";
import { MetricCard } from "../components/ui/layout";

export default React.memo(function NetWorthCard({ overview, trendData }) {
  if (!overview) return null;
  return (
    <MetricCard label="Net Worth" value={`£${overview.balance.toLocaleString()}`} icon={Wallet} tone="emerald"
      detail={trendData ? <span className={`flex items-center gap-1 text-xs ${trendData.direction === "up" ? "text-emerald" : "text-ruby"}`}>{trendData.direction === "up" ? "▲" : "▼"} {trendData.direction === "up" ? "+" : ""}£{Math.abs(trendData.values[trendData.values.length - 1] - trendData.values[0]).toLocaleString()} vs 6mo ago</span> : null} />
  );
});

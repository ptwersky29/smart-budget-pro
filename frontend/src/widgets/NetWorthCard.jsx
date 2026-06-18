import React from "react";
import { Wallet, Building2 } from "lucide-react";
import { MetricCard } from "../components/ui/layout";

export default React.memo(function NetWorthCard({ overview, truelayerBalance, hasAccounts, trendData }) {
  if (!overview) return null;
  const balance = hasAccounts ? (truelayerBalance ?? overview.balance) : overview.balance;
  return (
    <MetricCard label="Net Worth" value={`£${Number(balance).toLocaleString()}`} icon={hasAccounts ? Building2 : Wallet} tone="emerald"
      detail={hasAccounts ? "Real bank balance" : trendData ? <span className={`flex items-center gap-1 text-xs ${trendData.direction === "up" ? "text-emerald" : "text-ruby"}`}>{trendData.direction === "up" ? "▲" : "▼"} {trendData.direction === "up" ? "+" : ""}£{Math.abs(trendData.values[trendData.values.length - 1] - trendData.values[0]).toLocaleString()} vs 6mo ago</span> : null} />
  );
});

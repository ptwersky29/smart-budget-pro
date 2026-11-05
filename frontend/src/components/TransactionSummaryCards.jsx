import React, { useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ChartNoAxesColumnIncreasing } from "lucide-react";
import { formatCurrency } from "../lib/format";
import { getTransactionType } from "./GroupedTransactionItems";

/** The sparklines only reflect actual transaction records, never generated demo numbers. */
export function buildTransactionSparklines(rows, month) {
  const values = Array.from({ length: 8 }, () => ({ income: 0, expense: 0, transfer: 0, net: 0 }));
  const matchMonth = String(month || "");
  (rows || []).forEach((transaction) => {
    const date = String(transaction?.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (matchMonth && !date.startsWith(matchMonth))) return;
    const day = Number(date.slice(8, 10));
    if (day < 1 || day > 31) return;
    const index = Math.min(7, Math.floor((day - 1) / 4));
    const amount = Number(transaction?.amount || 0);
    if (!Number.isFinite(amount)) return;
    const kind = getTransactionType(transaction);
    if (kind === "transfer") {
      if (amount < 0) values[index].transfer += Math.abs(amount);
      return;
    }
    if (amount >= 0) values[index].income += amount;
    else values[index].expense += Math.abs(amount);
    values[index].net += amount;
  });
  return values;
}

function Trend({ rows, metric, color }) {
  const data = (rows || []).map((row) => Number(row[metric]) || 0);
  if (!data.length || data.every((v) => v === 0)) {
    return <svg viewBox="0 0 116 42" className="penni-reference-sparkline" aria-hidden="true"><path d="M3 30 H113" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 5" opacity=".17" /></svg>;
  }
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 1);
  const spread = max - min || 1;
  const points = data.map((v, i) => `${3 + (i * 110) / (data.length - 1)},${35 - ((v - min) / spread) * 28}`).join(" ");
  return <svg viewBox="0 0 116 42" className="penni-reference-sparkline" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const cards = [
  { id: "income", label: "Income", icon: ArrowDownLeft, metric: "income", color: "#20a55d" },
  { id: "expenses", label: "Expenses", icon: ArrowUpRight, metric: "expense", color: "#ee4454" },
  { id: "transfers", label: "Transfers", icon: ArrowLeftRight, metric: "transfer", color: "#2964f3" },
  { id: "net", label: "Net", icon: ChartNoAxesColumnIncreasing, metric: "net", color: "#6255ef" },
];

export default function TransactionSummaryCards({ income, expenses, transfers, transferCount, net, month, monthLabel, filtered = false, trendRows = [] }) {
  const trends = useMemo(() => buildTransactionSparklines(trendRows, month), [trendRows, month]);
  const amounts = { income, expenses, transfers, net };
  return <div className="penni-reference-kpis" aria-label="Transaction summary">
    {cards.map(({ id, label, icon: Icon, metric, color }) => {
      const amount = Number(amounts[id]) || 0;
      const detail = id === "transfers" ? `${transferCount || 0} transfer${Number(transferCount) === 1 ? "" : "s"} this month`
        : filtered ? "Matching transactions"
        : id === "net" ? monthLabel : "This month";
      return <article className={`penni-reference-kpi penni-reference-kpi--${id}`} key={id}>
        <span className="penni-reference-kpi-icon"><Icon size={22} strokeWidth={2.2} /></span>
        <div className="penni-reference-kpi-copy">
          <span className="penni-reference-kpi-label">{label}</span>
          <strong className="penni-reference-kpi-amount">{formatCurrency(id === "net" ? amount : Math.abs(amount), id === "net" ? { signed: true } : {})}</strong>
          <span className="penni-reference-kpi-detail">{detail}</span>
        </div>
        <Trend rows={trends} metric={metric} color={color} />
      </article>;
    })}
  </div>;
}

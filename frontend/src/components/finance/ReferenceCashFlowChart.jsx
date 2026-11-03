import React, { useId, useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatCurrency } from "../../lib/format";

function monthLabel(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})/);
  if (!match) return String(value || "");
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("en-GB", { month: "short" });
}

/**
 * Penny-reference cash-flow chart, driven by Penni's existing backend
 * monthly_flow or analytics/spending-trends response. No local demo data.
 */
export default function ReferenceCashFlowChart({ data = [], height = 220 }) {
  const id = useId().replace(/:/g, "");
  const rows = useMemo(() => data.map(row => ({
    month: monthLabel(row.month),
    income: Math.max(0, Number(row.income) || 0),
    spending: Math.max(0, Number(row.spend ?? row.spending) || 0),
  })), [data]);

  if (!rows.length) return null;

  return (
    <div className="penni-reference-chart w-full" role="img" aria-label="Income versus spending by month">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={rows} margin={{ top: 14, right: 8, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id={id + "-income"} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5b5cf0" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#5b5cf0" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={id + "-spend"} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea371" stopOpacity={0.10} />
              <stop offset="100%" stopColor="#0ea371" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--penni-line, #e5e7eb)" strokeDasharray="3 6" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--penni-muted, #667085)", fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--penni-muted, #667085)", fontSize: 10 }}
            tickFormatter={value => formatCurrency(value, { compact: true })} />
          <Tooltip
            formatter={(value, name) => [formatCurrency(value), name]}
            contentStyle={{ borderRadius: 16, background: "var(--penni-surface, #fff)",
              border: "1px solid var(--penni-line, #eee)", color: "var(--penni-ink, #0d0f14)", boxShadow: "var(--penni-shadow)" }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
          <Area type="monotone" name="Income" dataKey="income" stroke="#5b5cf0"
            strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} fill={"url(#" + id + "-income)"} />
          <Area type="monotone" name="Spending" dataKey="spending" stroke="#0ea371"
            strokeWidth={2.2} dot={false} activeDot={{ r: 5 }} fill={"url(#" + id + "-spend)"} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

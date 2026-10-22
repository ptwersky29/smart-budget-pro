import React, { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "../../lib/format";

const COLORS = ["#2f9e73", "#e8a838", "#5b8def", "#b07cc6", "#e8798e", "#f08a4b", "#44b6ae", "#8b75dd"];

export default function CategoryDonut({ data = [], total, size = 168 }) {
  const normalized = useMemo(
    () =>
      data
        .map((item) => ({
          name: item.name || "Uncategorized",
          value: Math.abs(Number(item.value) || 0),
        }))
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value),
    [data],
  );

  const sum = Number(total) || normalized.reduce((acc, item) => acc + item.value, 0);

  if (!normalized.length) {
    return (
      <div className="grid place-items-center py-8 text-center">
        <p className="text-sm font-medium">No spending yet</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Your category breakdown will appear once transactions are imported.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={normalized}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={size * 0.31}
              outerRadius={size * 0.47}
              paddingAngle={2.5}
              stroke="none"
            >
              {normalized.map((item, index) => (
                <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [formatCurrency(value), "Spent"]}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 12,
                boxShadow: "0 12px 30px -18px rgba(15,23,42,.35)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="money-tabular text-lg font-semibold leading-none">{formatCurrency(sum, { compact: true })}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Total spent</p>
        </div>
      </div>
      <div className="grid w-full min-w-0 grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
        {normalized.slice(0, 6).map((item, index) => (
          <div key={item.name} className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: COLORS[index % COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-xs capitalize text-muted-foreground">{item.name}</span>
            <span className="money-tabular shrink-0 text-xs font-medium">{formatCurrency(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import React from "react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Link } from "react-router-dom";
import WidgetWrapper from "./WidgetWrapper";

const TOOLTIP_STYLE = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px" };

export default React.memo(function CashFlowChart({ overview, visibility = true, chartStyle = "smooth" }) {
  if (!visibility) return null;
  return (
    <WidgetWrapper title="Cash flow" subtitle="Last 6 months" actions={<Link to="/reports" className="text-xs text-emerald font-medium hover:underline">Details</Link>}>
      <div className="h-52 p-5">
        {overview?.monthly_flow?.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={overview.monthly_flow} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--emerald))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--emerald))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--topaz))" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(var(--topaz))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={10} tickMargin={4} axisLine={false} tickLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickMargin={4} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="income" stroke="hsl(var(--emerald))" strokeWidth={2} fill="url(#incomeGrad)" dot={false} activeDot={{ r: 4, fill: "hsl(var(--emerald))" }} />
              <Area type="monotone" dataKey="spend" stroke="hsl(var(--topaz))" strokeWidth={2} fill="url(#spendGrad)" dot={false} activeDot={{ r: 4, fill: "hsl(var(--topaz))" }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">No data yet</div>
        )}
      </div>
    </WidgetWrapper>
  );
});

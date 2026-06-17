import React from "react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Link } from "react-router-dom";
import WidgetWrapper from "./WidgetWrapper";

const TOOLTIP_STYLE = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px" };

export default React.memo(function CashFlowChart({ overview, visibility = true }) {
  if (!visibility) return null;
  return (
    <WidgetWrapper title="Cash flow" subtitle="Last 6 months" actions={<Link to="/reports" className="text-xs text-emerald font-medium hover:underline">Details</Link>}>
      <div className="h-48 p-5">
        {overview?.monthly_flow?.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={overview.monthly_flow}>
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={10} tickMargin={4} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickMargin={4} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="income" stroke="hsl(var(--emerald))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="spend" stroke="hsl(var(--topaz))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">No data yet</div>
        )}
      </div>
    </WidgetWrapper>
  );
});

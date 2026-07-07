import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const PIE_COLORS = ["#30a46c", "#e8a838", "#60a5fa", "#a78bfa", "#f472b6", "#fb923c", "#34d399", "#818cf8", "#f87171", "#2dd4bf", "#fbbf24", "#e879f9"];

export default function CategoryPieChart({ data }) {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
      <div className="relative shrink-0" style={{ width: 200, height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={82} paddingAngle={2} strokeWidth={0}>
              {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "13px" }}
              labelStyle={{ fontWeight: 600 }}
              formatter={(value) => [`£${Number(value).toLocaleString()}`, "Spent"]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-xl font-bold tabular-nums tracking-tight">£{data.reduce((s, c) => s + (c.value || 0), 0).toLocaleString()}</p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Total spent</p>
        </div>
      </div>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 w-full">
        {data.map((cat, i) => (
          <div key={cat.name} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg hover:bg-secondary/50 transition-colors">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="capitalize truncate">{cat.name}</span>
            <span className="ml-auto font-medium tabular-nums">£{Number(cat.value).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

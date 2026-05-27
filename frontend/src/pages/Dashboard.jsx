import React, { useCallback, useEffect, useState } from "react";
import { api, API } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Loader2, TrendingUp, Wallet, ArrowDownRight, ArrowUpRight, HeartPulse, RefreshCw, Download } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from "recharts";
import { toast } from "sonner";
import AIInsightPanel from "../components/AIInsightPanel";

const PIE_COLORS = ["#10B981", "#F59E0B", "#3B82F6", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#84CC16"];
const TOOLTIP_STYLE = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px" };

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);

  const downloadMonth = async () => {
    if (user?.tier !== "premium" && user?.role !== "admin") {
      toast.error("Premium feature — upgrade for PDF reports."); return;
    }
    setPdfBusy(true);
    try {
      const res = await fetch(`${API}/reports/monthly`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `financeai-${new Date().toISOString().slice(0,7)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch { toast.error("Download failed"); }
    finally { setPdfBusy(false); }
  };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/overview");
      setData(data);
    } catch (err) {
      console.error("dashboard load failed", err);
      toast.error("Failed to load dashboard");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seed = async () => {
    setLoading(true);
    try { await api.post("/transactions/seed-demo"); toast.success("Demo data added"); await load(); }
    catch (err) { console.error("seed failed", err); toast.error("Could not seed demo"); setLoading(false); }
  };

  if (loading) return <div className="grid place-items-center min-h-[60vh]"><Loader2 className="h-6 w-6 animate-spin text-emerald" /></div>;
  if (!data) return null;

  const empty = !data.recent || data.recent.length === 0;

  return (
    <div className="space-y-8" data-testid="dashboard-root">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="label-overline text-emerald">Overview</p>
          <h1 className="text-4xl tracking-tight font-medium mt-1">Your money, today.</h1>
        </div>
        <button onClick={load} data-testid="dashboard-refresh" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
        <button onClick={downloadMonth} disabled={pdfBusy} data-testid="download-month-pdf" className="text-sm text-emerald hover:underline flex items-center gap-1 disabled:opacity-50">
          {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download month PDF
        </button>
      </div>

      {empty && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Wallet className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium tracking-tight">No transactions yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Add some demo data to explore the app.</p>
          <button onClick={seed} data-testid="seed-demo" className="btn-pill gradient-emerald text-white mt-6 text-sm">Add demo data</button>
        </div>
      )}

      {!empty && <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard testid="kpi-balance" label="Net Balance" value={`£${data.balance.toLocaleString()}`} icon={Wallet} accent="emerald" />
        <StatCard testid="kpi-income" label="Income" value={`£${data.income.toLocaleString()}`} icon={ArrowUpRight} accent="emerald" />
        <StatCard testid="kpi-spend" label="Spend" value={`£${data.spend.toLocaleString()}`} icon={ArrowDownRight} accent="ruby" />
        <StatCard testid="kpi-health" label="Health Score" value={`${data.health_score}/100`} icon={HeartPulse} accent="topaz" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="label-overline">Cash flow</p>
              <p className="text-xl tracking-tight font-medium mt-1">Last 6 months</p>
            </div>
            <TrendingUp className="h-4 w-4 text-emerald" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthly_flow}>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="spend" stroke="#F59E0B" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="label-overline">Spending</p>
          <p className="text-xl tracking-tight font-medium mt-1 mb-4">By category</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.categories.slice(0, 6)} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {data.categories.slice(0, 6).map((c) => <Cell key={c.name} fill={PIE_COLORS[data.categories.indexOf(c) % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {data.categories.slice(0, 4).map((c, i) => (
              <div key={c.name} className="flex justify-between text-xs">
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{background: PIE_COLORS[i]}} />{c.name}</span>
                <span className="font-medium">£{c.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AIInsightPanel
        title="AI Insights"
        subtitle="What's happening with your money"
        endpoint="/ai/insights/dashboard"
      />

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-6 pb-2 flex items-center justify-between">
          <div>
            <p className="label-overline">Recent</p>
            <p className="text-xl tracking-tight font-medium mt-1">Transactions</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground border-y border-border bg-secondary/30">
            <th className="px-6 py-3">Date</th><th className="px-6 py-3">Description</th><th className="px-6 py-3">Category</th><th className="px-6 py-3 text-right">Amount</th>
          </tr></thead>
          <tbody>
            {data.recent.map((t) => (
              <tr key={t.transaction_id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="px-6 py-3 text-muted-foreground text-xs">{t.date?.slice(0,10)}</td>
                <td className="px-6 py-3 font-medium">{t.description}</td>
                <td className="px-6 py-3"><span className="text-xs px-2 py-1 rounded-full bg-secondary capitalize">{t.category}</span></td>
                <td className={`px-6 py-3 text-right font-medium ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}>{t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  );
}

const StatCard = ({ label, value, icon: Icon, accent, testid }) => (
  <div data-testid={testid} className="rounded-2xl border border-border bg-card p-5 hover:-translate-y-0.5 hover:shadow-md transition-all">
    <div className="flex items-center justify-between">
      <p className="label-overline">{label}</p>
      <Icon className={`h-4 w-4 ${accent === "ruby" ? "text-ruby" : accent === "topaz" ? "text-topaz" : "text-emerald"}`} />
    </div>
    <p className="text-3xl tracking-tight font-medium mt-3">{value}</p>
  </div>
);

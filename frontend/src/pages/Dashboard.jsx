import React, { useCallback, useEffect, useState } from "react";
import { api, API } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Loader2, Wallet, ArrowDownRight, ArrowUpRight, HeartPulse, RefreshCw, Download } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from "recharts";
import { toast } from "sonner";
import AIInsightPanel from "../components/AIInsightPanel";
import { ActionLink, EmptyState, MetricCard, PageHeader, SectionCard } from "../components/ui/layout";
import Skeleton, { SkeletonCard, SkeletonChart } from "../components/ui/Skeleton";

const PIE_COLORS = Array.from({length: 8}, (_, i) => `var(--chart-${i + 1})`);
const TOOLTIP_STYLE = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px" };

const Dashboard = React.memo(function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
    setRefreshing(true);
    try {
      const { data } = await api.get("/dashboard/overview");
      setData(data);
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.message || "Unknown error";
      console.error("dashboard load failed", err);
      toast.error(`Dashboard failed (${status || "?"}): ${detail}`);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seed = async () => {
    setLoading(true);
    try { await api.post("/transactions/seed-demo"); toast.success("Demo data added"); await load(); }
    catch (err) { console.error("seed failed", err); toast.error("Could not seed demo"); setLoading(false); }
  };

  if (loading) return (
    <div className="space-y-8" data-testid="dashboard-root">
      <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-6 lg:p-8 shadow-modal">
        <Skeleton className="h-3 w-16 mb-3" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96 mt-3" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonChart className="lg:col-span-2" />
        <SkeletonChart />
      </div>
    </div>
  );
  if (!data) return (
    <div className="grid place-items-center min-h-[60vh] text-center p-8">
      <div>
        <p className="text-lg font-medium text-muted-foreground">Could not load dashboard</p>
        <button onClick={load} className="mt-4 btn-pill border border-emerald text-emerald text-sm">Try again</button>
      </div>
    </div>
  );

  const empty = !data.recent || data.recent.length === 0;

  return (
    <div className="space-y-8" data-testid="dashboard-root">
      <PageHeader
        eyebrow="Overview"
        title="Your money, today."
        description="A premium, simple view of your balance, spend, cash flow, and AI-backed insights."
        actions={
          <>
            <button onClick={load} disabled={refreshing} data-testid="dashboard-refresh" className="toolbar-chip hover:bg-secondary/70 disabled:opacity-50">
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
            </button>
            <button onClick={downloadMonth} disabled={pdfBusy} data-testid="download-month-pdf" className="btn-pill border border-border bg-card/80 text-sm h-11 px-5 disabled:opacity-50">
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="ml-2">Download PDF</span>
            </button>
            <ActionLink to="/transactions" label="Add transaction" />
          </>
      }
      />

      {empty && (
        <EmptyState
          icon={Wallet}
          title="No transactions yet"
          description="Add some demo data to explore the app, or connect a bank to see real activity here."
          action={<button onClick={seed} data-testid="seed-demo" className="btn-pill gradient-emerald text-white text-sm">Add demo data</button>}
        />
      )}

      {!empty && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard testid="kpi-balance" label="Net Balance" value={`£${data.balance.toLocaleString()}`} icon={Wallet} tone="emerald" />
        <MetricCard testid="kpi-income" label="Income" value={`£${data.income.toLocaleString()}`} icon={ArrowUpRight} tone="emerald" />
        <MetricCard testid="kpi-spend" label="Spend" value={`£${data.spend.toLocaleString()}`} icon={ArrowDownRight} tone="ruby" />
        <MetricCard testid="kpi-health" label="Health Score" value={`${data.health_score}/100`} icon={HeartPulse} tone="topaz" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard eyebrow="Cash flow" title="Last 6 months" className="lg:col-span-2" contentClassName="pt-0">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthly_flow}>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="income" stroke="hsl(var(--emerald))" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="spend" stroke="hsl(var(--topaz))" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Spending" title="By category" contentClassName="pt-0">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.categories.slice(0, 6)} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {data.categories.slice(0, 6).map((c, i) => <Cell key={c.name} style={{ fill: `var(--chart-${(i % 8) + 1})` }} />)}
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
        </SectionCard>
      </div>

      <AIInsightPanel
        title="AI Insights"
        subtitle="What's happening with your money"
        endpoint="/ai/insights/dashboard"
      />

      <SectionCard eyebrow="Recent" title="Transactions" contentClassName="p-0">
        {/* Mobile card view */}
        <div className="block sm:hidden divide-y divide-border">
          {data.recent.map((t) => (
            <div key={t.transaction_id} style={{ contentVisibility: "auto" }} className="px-4 py-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">{t.date?.slice(0,10)}</p>
                <span className={`shrink-0 font-medium tabular-nums ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}>
                  {t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}
                </span>
              </div>
              <p className="font-medium text-sm truncate">{t.description}</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary capitalize">{t.category}</span>
            </div>
          ))}
        </div>
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground border-y border-border bg-secondary/30">
            <th className="px-6 py-3">Date</th><th className="px-6 py-3">Description</th><th className="px-6 py-3">Category</th><th className="px-6 py-3 text-right">Amount</th>
          </tr></thead>
          <tbody>
            {data.recent.map((t) => (
              <tr key={t.transaction_id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="px-6 py-3 text-muted-foreground text-xs">{t.date?.slice(0,10)}</td>
                <td className="px-6 py-3 font-medium truncate max-w-xs">{t.description}</td>
                <td className="px-6 py-3"><span className="text-xs px-2 py-1 rounded-full bg-secondary capitalize">{t.category}</span></td>
                <td className={`px-6 py-3 text-right font-medium ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}>{t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </SectionCard>
      </>}
    </div>
  );
}

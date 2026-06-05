import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { toast } from "sonner";
import AIInsightPanel from "../components/AIInsightPanel";
import { EmptyState, MetricCard } from "../components/ui/layout";
import Skeleton, { SkeletonCard } from "../components/ui/Skeleton";
import {
  Wallet, ArrowDownRight, ArrowUpRight, HeartPulse, RefreshCw, Plus,
  AlertTriangle, CalendarDays, PiggyBank, Building2, TrendingUp,
  ArrowRight, MoreHorizontal,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";

const TOOLTIP_STYLE = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px" };

const Dashboard = React.memo(function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { document.title = "Dashboard | FinanceAI"; }, []);
  const [overview, setOverview] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [ov, bd, al, up] = await Promise.allSettled([
        api.get("/dashboard/overview"),
        api.get("/budgets"),
        api.get("/budget-system/alerts"),
        api.get("/budget-system/upcoming"),
      ]);
      if (ov.status === "fulfilled") setOverview(ov.value.data);
      else toast.error("Could not load dashboard data");
      if (bd.status === "fulfilled") setBudgets(bd.value.data.budgets || []);
      if (al.status === "fulfilled") setAlerts(al.value.data.alerts || al.value.data || []);
      if (up.status === "fulfilled") setUpcoming(up.value.data.upcoming || up.value.data || []);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const trendData = useMemo(() => {
    if (!overview?.monthly_flow) return null;
    const vals = overview.monthly_flow.map(m => m.income - m.spend);
    return { values: vals, direction: vals.length > 1 ? (vals[vals.length - 1] >= vals[0] ? "up" : "down") : "neutral" };
  }, [overview]);

  const currentMonthBudget = useMemo(() => {
    if (!budgets.length) return null;
    const total = budgets.reduce((s, b) => s + (Number(b.limit) || 0), 0);
    const spent = budgets.reduce((s, b) => s + (Number(b.spent) || 0), 0);
    const overCount = budgets.filter(b => (b.progress_pct || 0) >= 100).length;
    return { total, spent, remaining: total - spent, overCount, pct: total ? Math.round((spent / total) * 100) : 0 };
  }, [budgets]);

  const topAlerts = useMemo(() => {
    const arr = Array.isArray(alerts) ? alerts : [];
    return arr.slice(0, 3);
  }, [alerts]);

  const topUpcoming = useMemo(() => {
    const arr = Array.isArray(upcoming) ? upcoming : [];
    return arr.slice(0, 3);
  }, [upcoming]);

  const seed = async () => {
    try {
      setLoading(true);
      await api.post("/transactions/seed-demo");
      toast.success("Demo data added");
      await loadAll();
    } catch {
      toast.error("Could not seed demo");
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="space-y-8" data-testid="dashboard-root">
      <Skeleton className="h-12 w-full rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[1,2,3,4].map(i => <SkeletonCard key={i} />)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
        <div className="space-y-4"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>
      </div>
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );

  if (!overview) return (
    <div className="grid place-items-center min-h-[60vh] text-center p-8">
      <div>
        <p className="text-lg font-medium text-muted-foreground">Could not load dashboard</p>
        <button onClick={() => loadAll()} className="mt-4 btn-pill border border-emerald text-emerald text-sm">Try again</button>
      </div>
    </div>
  );

  const empty = !overview.recent || overview.recent.length === 0;

  return (
    <div className="space-y-6" data-testid="dashboard-root">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="label-overline text-emerald">Overview</p>
          <h1 className="text-2xl lg:text-3xl tracking-tight font-semibold mt-1">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}{user?.name ? `, ${user?.name?.split(" ")[0]}` : ""}.
          </h1>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="toolbar-chip">
            <MoreHorizontal className="h-3.5 w-3.5 mr-1" /> Actions
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => loadAll(true)}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/import")}>
              <Building2 className="h-4 w-4 mr-2" /> Import
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/transactions")}>
              <Plus className="h-4 w-4 mr-2" /> Add transaction
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {empty && (
        <EmptyState
          icon={Wallet}
          title="Welcome to FinanceAI"
          description="Connect your bank to import transactions automatically, upload a CSV statement, or add your first transaction manually to get started."
          action={
            <div className="flex flex-wrap gap-3 justify-center">
              <Link to="/import" className="btn-pill gradient-emerald text-white text-sm h-11 px-5">Connect bank <ArrowRight className="ml-2 h-4 w-4" /></Link>
              <Link to="/import" className="btn-pill border border-border text-sm h-11 px-5">Upload statement</Link>
              <Link to="/transactions" className="btn-pill border border-border text-sm h-11 px-5">Add manually</Link>
              <button onClick={seed} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Explore with sample data</button>
            </div>
          }
        />
      )}

      {!empty && <>
      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard label="Net Worth" value={`£${overview.balance.toLocaleString()}`} icon={Wallet} tone="emerald"
          detail={trendData ? <span className={`flex items-center gap-1 text-xs ${trendData.direction === "up" ? "text-emerald" : "text-ruby"}`}>{trendData.direction === "up" ? "▲" : "▼"} {trendData.direction === "up" ? "+" : ""}£{Math.abs(trendData.values[trendData.values.length - 1] - trendData.values[0]).toLocaleString()} vs 6mo ago</span> : null} />
        <MetricCard label="Income" value={`£${overview.income.toLocaleString()}`} icon={ArrowUpRight} tone="emerald"
          detail={<span className="text-xs text-muted-foreground">this month</span>} />
        <MetricCard label="Spending" value={`£${overview.spend.toLocaleString()}`} icon={ArrowDownRight} tone="ruby"
          detail={<span className="text-xs text-muted-foreground">this month</span>} />
        <MetricCard label="Health" value={`${overview.health_score}`} icon={HeartPulse} tone="topaz"
          detail={
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">/ 100</span>
              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden max-w-[80px]">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald to-topaz" style={{ width: `${overview.health_score}%` }} />
              </div>
            </div>
          } />
      </div>

      {/* Alerts + Upcoming */}
      {(topAlerts.length > 0 || topUpcoming.length > 0) && (
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card overflow-hidden">
          {topAlerts.length > 0 && (
            <div className="divide-y divide-border/60">
              {topAlerts.map((a, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3 text-sm">
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${a.severity === "critical" || a.severity === "danger" ? "text-ruby" : a.severity === "warning" ? "text-topaz" : "text-emerald"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{a.title || a.message}</p>
                    {a.description && <p className="text-xs text-muted-foreground truncate">{a.description}</p>}
                  </div>
                  {a.action_url && <Link to={a.action_url} className="text-xs text-emerald font-medium shrink-0 hover:underline">Fix</Link>}
                </div>
              ))}
            </div>
          )}
          {topUpcoming.length > 0 && (
            <div className="border-t border-border/60 divide-y divide-border/60">
              {topUpcoming.map((u, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3 text-sm">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{u.description || u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.date ? new Date(u.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}
                      {u.amount ? ` · £${Number(u.amount).toFixed(2)}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3-column: Budgets | Cash Flow | Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Budgets */}
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="label-overline">Budgets</p>
              <p className="text-sm font-medium mt-0.5">
                {currentMonthBudget
                  ? `${currentMonthBudget.pct}% of limit used`
                  : "No budgets set"}
              </p>
            </div>
            <Link to="/budgets" className="text-xs text-emerald font-medium hover:underline shrink-0">Manage</Link>
          </div>
          {budgets.length === 0 ? (
            <Link to="/budgets" className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-emerald/40 transition-colors">
              <PiggyBank className="h-4 w-4" />
              <span>Set your first budget</span>
              <ArrowRight className="h-4 w-4 ml-auto" />
            </Link>
          ) : (
            <div className="space-y-3">
              {budgets.slice(0, 4).map((b) => {
                const pct = Math.min(b.progress_pct || 0, 100);
                const over = (b.progress_pct || 0) >= 100;
                return (
                  <div key={b.budget_id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium capitalize truncate">{b.category}</span>
                      <span className={`tabular-nums ${over ? "text-ruby font-medium" : "text-muted-foreground"}`}>
                        £{Math.abs(b.spent || 0).toFixed(0)} / £{b.limit.toFixed(0)}
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${over ? "bg-ruby" : "bg-gradient-to-r from-emerald to-emerald/70"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cash Flow */}
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="label-overline">Cash flow</p>
              <p className="text-sm font-medium mt-0.5">Last 6 months</p>
            </div>
            <Link to="/reports" className="text-xs text-emerald font-medium hover:underline shrink-0">Details</Link>
          </div>
          <div className="h-48">
            {overview.monthly_flow?.length > 0 ? (
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
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card p-5">
          <p className="label-overline mb-3">Quick actions</p>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/transactions" className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-border hover:border-emerald/30 bg-secondary/20 hover:bg-emerald/5 transition-colors text-center">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald/10 text-emerald"><Plus className="h-4 w-4" /></span>
              <span className="text-xs font-medium leading-tight">Add transaction</span>
            </Link>
            <Link to="/import" className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-border hover:border-emerald/30 bg-secondary/20 hover:bg-emerald/5 transition-colors text-center">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald/10 text-emerald"><Building2 className="h-4 w-4" /></span>
              <span className="text-xs font-medium leading-tight">Connect bank</span>
            </Link>
            <Link to="/budgets" className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-border hover:border-topaz/30 bg-secondary/20 hover:bg-topaz/5 transition-colors text-center">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-topaz/10 text-topaz"><PiggyBank className="h-4 w-4" /></span>
              <span className="text-xs font-medium leading-tight">Budgets</span>
            </Link>
            <Link to="/investments" className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-border hover:border-topaz/30 bg-secondary/20 hover:bg-topaz/5 transition-colors text-center">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-topaz/10 text-topaz"><TrendingUp className="h-4 w-4" /></span>
              <span className="text-xs font-medium leading-tight">Investments</span>
            </Link>
          </div>
        </div>
      </div>

      {/* AI Insights */}
      <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card p-5">
        <AIInsightPanel
          title="AI Insights"
          subtitle="What's happening with your money"
          endpoint="/ai/insights/dashboard"
        />
      </div>

      {/* Recent transactions */}
      <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/70">
          <div>
            <p className="label-overline">Recent</p>
            <p className="text-sm font-medium mt-0.5">Transactions</p>
          </div>
          <Link to="/transactions" className="text-xs text-emerald font-medium hover:underline">View all</Link>
        </div>
        <div className="block sm:hidden divide-y divide-border/60">
          {overview.recent.slice(0, 5).map((t) => (
            <div key={t.transaction_id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{t.date?.slice(0, 10)}</p>
                <p className="text-sm font-medium truncate">{t.description}</p>
                <span className="text-xs text-muted-foreground capitalize">{t.category}</span>
              </div>
              <span className={`shrink-0 font-medium tabular-nums text-sm ${t.amount > 0 ? "text-emerald" : ""}`}>
                {t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/60 bg-secondary/20">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {overview.recent.slice(0, 5).map((t) => (
                <tr key={t.transaction_id} className="border-b border-border/40 last:border-0 hover:bg-secondary/20">
                  <td className="px-5 py-3 text-muted-foreground text-xs">{t.date?.slice(0, 10)}</td>
                  <td className="px-5 py-3 font-medium truncate max-w-[200px]">{t.description}</td>
                  <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-secondary capitalize">{t.category || "uncategorized"}</span></td>
                  <td className={`px-5 py-3 text-right font-medium tabular-nums ${t.amount > 0 ? "text-emerald" : ""}`}>{t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>}
    </div>
  );
});

export default Dashboard;

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { toast } from "sonner";
import AIInsightPanel from "../components/AIInsightPanel";
import { EmptyState } from "../components/ui/layout";
import Skeleton, { SkeletonCard } from "../components/ui/Skeleton";
import {
  Wallet, RefreshCw, Plus,
  AlertTriangle, CalendarDays, Building2,
  ArrowRight, MoreHorizontal,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";
import { Button } from "../components/ui/button";
import {
  NetWorthCard, IncomeCard, SpendingCard, HealthScoreCard,
  CashFlowChart, BudgetsOverview, QuickActionsPanel, RecentTransactions, MaaserBalanceWidget,
} from "../widgets";

const Dashboard = React.memo(function Dashboard() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  useEffect(() => { document.title = "Dashboard | FinanceAI"; }, []);
  const [overview, setOverview] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const dashboardPrefs = settings.preferences?.dashboard || {};
  const activeWidgets = dashboardPrefs.widgets || [];
  const widgetOrder = dashboardPrefs.widget_order || [];
  const chartStyle = dashboardPrefs.chart_style || "smooth";
  const showWidget = (key) => activeWidgets.includes(key);

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
        <Button onClick={() => loadAll()} variant="outlinePill" size="pillSm" className="mt-4">Try again</Button>
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
          <DropdownMenuTrigger asChild>
            <Button variant="chip">
              <MoreHorizontal className="h-3.5 w-3.5" /> Actions
            </Button>
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
              <Button variant="primary" size="pill" asChild>
                <Link to="/import">Connect bank <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button variant="outlinePill" size="pill" asChild>
                <Link to="/import">Upload statement</Link>
              </Button>
              <Button variant="outlinePill" size="pill" asChild>
                <Link to="/transactions">Add manually</Link>
              </Button>
              <button onClick={seed} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Explore with sample data</button>
            </div>
          }
        />
      )}

      {!empty && <>
      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {showWidget("net_worth") && <NetWorthCard overview={overview} trendData={trendData} />}
        {showWidget("income") && <IncomeCard overview={overview} />}
        {showWidget("spending") && <SpendingCard overview={overview} />}
        {showWidget("health_score") && <HealthScoreCard overview={overview} />}
      </div>

      {/* Maaser Balance */}
      {showWidget("maaser_balance") && <MaaserBalanceWidget />}

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
        {showWidget("budgets_overview") && <BudgetsOverview budgets={budgets} currentMonthBudget={currentMonthBudget} />}
        {showWidget("cash_flow") && <CashFlowChart overview={overview} chartStyle={chartStyle} />}
        {showWidget("quick_actions") && <QuickActionsPanel />}
      </div>

      {/* AI Insights */}
      {showWidget("ai_insights") && (
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card p-5">
          <AIInsightPanel
            title="AI Insights"
            subtitle="What's happening with your money"
            endpoint="/ai/insights/dashboard"
          />
        </div>
      )}

      {/* Recent transactions */}
      {showWidget("recent_transactions") && <RecentTransactions overview={overview} />}
      </>}
    </div>
  );
});

export default Dashboard;

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  PiggyBank,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useAssistant } from "../contexts/AssistantContext";
import { useSettings } from "../contexts/SettingsContext";
import { useCategories } from "../contexts/CategoriesContext";
import { Button } from "../components/ui/button";
import Skeleton from "../components/ui/Skeleton";
import {
  EmptyPanel,
  PageHeader,
  StatCard,
  Surface,
  SurfaceHeader,
} from "../components/ui/page";
import Sparkline from "../components/ui/Sparkline";
import AccountTile from "../components/finance/AccountTile";
import CategoryDonut from "../components/finance/CategoryDonut";
import {
  formatCurrency,
  formatLongDate,
  formatMonth,
  formatShortDate,
  greetingForNow,
} from "../lib/format";

function monthLabel(value) {
  if (!value) return "";
  if (!String(value).includes("-")) return String(value);
  const formatted = formatMonth(value);
  return formatted.split(" ")[0];
}

function TransactionLine({ transaction }) {
  const income = Number(transaction.amount) > 0;
  const title = transaction.description || transaction.merchant || "Transaction";
  return (
    <Link
      to={`/transactions?search=${encodeURIComponent(title)}`}
      className="group flex items-center gap-3 px-4 py-2.5 transition hover:bg-secondary/35 sm:px-5"
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${income ? "bg-emerald/10 text-emerald" : "bg-secondary text-muted-foreground"}`}>
        {income ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium">{title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] capitalize text-muted-foreground">
          <span>{transaction.category || "uncategorized"}</span>
          <span className="text-border">·</span>
          <span>{formatShortDate(transaction.date)}</span>
        </span>
      </span>
      <span className={`money-tabular shrink-0 text-[12.5px] font-semibold ${income ? "text-emerald" : ""}`}>
        {formatCurrency(transaction.amount, { signed: true })}
      </span>
    </Link>
  );
}

function BudgetLine({ budget }) {
  const limit = Number(budget.limit ?? budget.amount ?? 0);
  const spent = Number(budget.spent ?? 0);
  const pct = Math.min(Number(budget.progress_pct ?? (limit ? (spent / limit) * 100 : 0)), 100);
  const over = Number(budget.progress_pct ?? 0) >= 100;
  return (
    <Link to="/budgets" className="block px-4 py-2.5 transition hover:bg-secondary/30 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[12px] font-medium capitalize">{budget.category || "Budget"}</span>
        <span className={`money-tabular shrink-0 text-[11px] ${over ? "font-semibold text-ruby" : "text-muted-foreground"}`}>
          {formatCurrency(spent, { compact: true })} / {formatCurrency(limit, { compact: true })}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full ${over ? "bg-ruby" : "bg-emerald"}`}
          style={{ width: `${Math.max(pct, spent > 0 ? 3 : 0)}%` }}
        />
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { version: categoriesVersion } = useCategories();
  const { openAssistant } = useAssistant();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    document.title = "Dashboard | Penni";
  }, []);

  const dashboardPrefs = settings.preferences?.dashboard || {};
  const activeWidgets =
    dashboardPrefs.widgets && dashboardPrefs.widgets.length > 0
      ? dashboardPrefs.widgets
      : [
          "net_worth",
          "income",
          "spending",
          "health_score",
          "cash_flow",
          "budgets_overview",
          "recent_transactions",
          "ai_insights",
        ];
  const showWidget = (key) => activeWidgets.includes(key);

  const loadAll = useCallback(async (silent) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [ov, bd, al, up] = await Promise.allSettled([
        api.get("/dashboard/overview"),
        api.get("/budgets"),
        api.get("/budget-system/alerts"),
        api.get("/budget-system/upcoming"),
      ]);
      if (ov.status === "fulfilled") {
        setOverview(ov.value.data);
        setLoadError("");
      } else {
        const message = formatApiError(ov.reason);
        setOverview(null);
        setLoadError(message);
        if (silent) toast.error(message || "Could not refresh dashboard");
      }
      if (bd.status === "fulfilled") setBudgets(bd.value.data.budgets || []);
      if (al.status === "fulfilled") setAlerts(al.value.data.alerts || al.value.data || []);
      if (up.status === "fulfilled") setUpcoming(up.value.data.upcoming || up.value.data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll, categoriesVersion]);

  const accounts = overview?.accounts || [];
  const categories = useMemo(
    () => overview?.categories || overview?.category_spend || [],
    [overview],
  );
  const monthlyFlow = overview?.monthly_flow || [];
  const income = Number(overview?.income) || 0;
  const spend = Number(overview?.spend ?? overview?.spending) || 0;
  const savings = income - spend;
  const savingsRate = Number(overview?.savings_rate) || (income > 0 ? Math.round((savings / income) * 100) : 0);
  const balance = Number(
    overview?.truelayer_balance ||
      accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0) ||
      overview?.balance ||
      0,
  );
  const trendValues = monthlyFlow.map((month) => Number(month.income) - Number(month.spend));
  const topAlerts = (Array.isArray(alerts) ? alerts : []).slice(0, 2);
  const topUpcoming = (Array.isArray(upcoming) ? upcoming : []).slice(0, 4);
  const totalBudget = budgets.reduce((sum, budget) => sum + (Number(budget.limit ?? budget.amount) || 0), 0);
  const totalSpentBudget = budgets.reduce((sum, budget) => sum + (Number(budget.spent) || 0), 0);

  const addTransaction = () => {
    navigate("/transactions");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("app-quick-action", { detail: { action: "open-new-transaction" } }));
    }, 250);
  };

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

  if (loading) {
    return (
      <div className="page-stack" data-testid="dashboard-loading">
        <Skeleton className="h-20 w-full rounded-[1.25rem]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28 rounded-[1.25rem]" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,0.85fr)]">
          <div className="space-y-4">
            <Skeleton className="h-52 rounded-[1.25rem]" />
            <Skeleton className="h-80 rounded-[1.25rem]" />
          </div>
          <Skeleton className="h-96 rounded-[1.25rem]" />
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-4">
        <div role="alert" data-testid="dashboard-error" className="surface w-full max-w-md p-6 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-topaz" />
          <p className="mt-3 text-base font-semibold">Could not load dashboard</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {loadError || "Something went wrong. Please try again."}
          </p>
          <Button onClick={() => loadAll()} variant="outlinePill" size="pillSm" className="mt-4">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const empty =
    (!overview.recent || overview.recent.length === 0) &&
    accounts.length === 0 &&
    budgets.length === 0;

  const header = (
    <PageHeader
      eyebrow={formatLongDate(new Date(), { weekday: false })}
      title={`${greetingForNow()}${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
      description="Your accounts, spending and plans, gathered into one calm view."
      actions={
        <>
          <button
            type="button"
            onClick={() => loadAll(true)}
            className="grid h-9 w-9 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground transition hover:text-foreground"
            aria-label="Refresh dashboard"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Button variant="outlinePill" size="pill" onClick={() => openAssistant()}>
            <Sparkles className="h-4 w-4" />
            Ask Penni
          </Button>
          <Button variant="primary" size="pill" onClick={addTransaction}>
            <Plus className="h-4 w-4" />
            Add transaction
          </Button>
        </>
      }
    />
  );

  if (empty) {
    return (
      <div className="page-stack" data-testid="dashboard-root">
        {header}
        <Surface>
          <EmptyPanel
            icon={Wallet}
            title="Welcome to Penni"
            description="Connect your bank to import transactions automatically, upload a statement, or add your first transaction manually to get started."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" size="pill" asChild>
                  <Link to="/accounts">Connect bank <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button variant="outlinePill" size="pill" asChild>
                  <Link to="/accounts">Upload statement</Link>
                </Button>
                <Button variant="outlinePill" size="pill" asChild>
                  <Link to="/transactions">Add manually</Link>
                </Button>
                <button
                  type="button"
                  onClick={seed}
                  className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Explore with sample data
                </button>
              </div>
            }
          />
        </Surface>
      </div>
    );
  }

  return (
    <div className="page-stack" data-testid="dashboard-root">
      {header}

      {topAlerts.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {topAlerts.map((alert, index) => (
            <div
              key={`${alert.title || alert.message}-${index}`}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-topaz/20 bg-topaz/[0.065] px-3.5 py-2.5"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-topaz" />
              <p className="min-w-0 flex-1 truncate text-[11.5px] font-medium">
                {alert.title || alert.message}
              </p>
              {alert.action_url ? (
                <Link to={alert.action_url} className="shrink-0 text-[10.5px] font-semibold text-topaz">
                  Review
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {showWidget("net_worth") ? (
          <StatCard
            label="Total balance"
            value={formatCurrency(balance)}
            detail={`${accounts.length} ${accounts.length === 1 ? "account" : "accounts"} connected`}
            icon={Wallet}
            tone="emerald"
            delta={monthlyFlow.length ? `${monthLabel(monthlyFlow[monthlyFlow.length - 1]?.month)} net` : null}
            deltaTone="neutral"
          >
            <Sparkline values={trendValues} height={26} />
          </StatCard>
        ) : null}
        {showWidget("income") ? (
          <StatCard
            label="Income"
            value={formatCurrency(income)}
            detail="This month"
            icon={ArrowDownLeft}
            tone="blue"
            delta={income > spend ? "Positive" : null}
            deltaTone="up"
          />
        ) : null}
        {showWidget("spending") ? (
          <StatCard
            label="Spending"
            value={formatCurrency(spend)}
            detail={`${categories.length} ${categories.length === 1 ? "category" : "categories"}`}
            icon={ArrowUpRight}
            tone="ruby"
          />
        ) : null}
        {showWidget("health_score") ? (
          <StatCard
            label="Net saved"
            value={formatCurrency(savings)}
            detail={`${savingsRate}% of income`}
            icon={PiggyBank}
            tone="topaz"
            delta={overview.grade ? `Grade ${overview.grade}` : null}
            deltaTone={savings >= 0 ? "up" : "down"}
          />
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,0.85fr)]">
        <div className="space-y-4">
          <Surface className="overflow-hidden">
            <SurfaceHeader
              title="Accounts"
              subtitle="Balances across your connected banks"
              actions={
                <Link to="/accounts" className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald">
                  View all <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              }
              compact
            />
            <div className="mt-3 grid grid-cols-1 gap-2.5 px-4 pb-4 sm:grid-cols-2 sm:px-5 sm:pb-5 lg:grid-cols-3">
              {accounts.slice(0, 5).map((account) => (
                <AccountTile key={account.account_id || account.id} account={account} />
              ))}
              <Link
                to="/accounts"
                className="flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-[1rem] border border-dashed border-border/80 p-4 text-muted-foreground transition hover:border-emerald/30 hover:bg-emerald/[0.03] hover:text-emerald"
              >
                <Plus className="h-4 w-4" />
                <span className="text-[11px] font-medium">Add account</span>
              </Link>
            </div>
          </Surface>

          <div className="grid gap-4 md:grid-cols-2">
            <Surface className="min-w-0 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold tracking-[-0.02em]">Spending breakdown</p>
                  <p className="mt-0.5 text-[10.5px] text-muted-foreground">This month by category</p>
                </div>
                <Link to="/reports" className="text-[10.5px] font-semibold text-emerald">Details</Link>
              </div>
              <CategoryDonut data={categories} total={spend} size={146} />
            </Surface>

            {showWidget("cash_flow") ? (
              <Surface className="min-w-0 p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold tracking-[-0.02em]">Cash flow</p>
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground">Income vs spending</p>
                  </div>
                  <Link to="/reports" className="text-[10.5px] font-semibold text-emerald">Reports</Link>
                </div>
                {monthlyFlow.length ? (
                  <div>
                    <div className="flex h-[124px] items-end gap-2">
                      {monthlyFlow.map((month) => {
                        const highest = Math.max(...monthlyFlow.map((item) => Math.max(Number(item.income) || 0, Number(item.spend) || 0)), 1);
                        const incomeHeight = Math.max(((Number(month.income) || 0) / highest) * 100, 2);
                        const spendHeight = Math.max(((Number(month.spend) || 0) / highest) * 100, 2);
                        return (
                          <div key={month.month} className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
                            <div className="flex h-full items-end justify-center gap-[3px]">
                              <div className="w-[42%] rounded-t-md bg-emerald/80 transition group-hover:bg-emerald" style={{ height: `${incomeHeight}%` }} title={`Income ${formatCurrency(month.income)}`} />
                              <div className="w-[42%] rounded-t-md bg-topaz/45 transition group-hover:bg-topaz/65" style={{ height: `${spendHeight}%` }} title={`Spending ${formatCurrency(month.spend)}`} />
                            </div>
                            <span className="text-center text-[9px] text-muted-foreground">{monthLabel(month.month)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-4 text-[9.5px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald" />Income</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-topaz/60" />Spending</span>
                    </div>
                  </div>
                ) : (
                  <EmptyPanel title="No cash flow yet" description="Add a few transactions to see your monthly trend." className="py-8" />
                )}
              </Surface>
            ) : null}
          </div>

          {showWidget("recent_transactions") && overview.recent?.length ? (
            <Surface className="overflow-hidden">
              <SurfaceHeader
                title="Recent transactions"
                subtitle="The latest movement across your accounts"
                actions={
                  <Link to="/transactions" className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald">
                    View ledger <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                }
                compact
              />
              <div className="mt-2 divide-y divide-border/50 border-t border-border/50">
                {overview.recent.slice(0, 5).map((transaction, index) => (
                  <TransactionLine key={transaction.transaction_id || transaction.tx_id || index} transaction={transaction} />
                ))}
              </div>
            </Surface>
          ) : null}
        </div>

        <div className="space-y-4">
          {showWidget("ai_insights") ? (
            <div className="relative overflow-hidden rounded-[1.25rem] bg-[#123c30] p-5 text-white shadow-[0_24px_50px_-34px_rgba(10,42,32,0.9)]">
              <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/12 ring-1 ring-white/15">
                    <Sparkles className="h-[18px] w-[18px] text-[#f3c970]" />
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/70">
                    Penni AI
                  </span>
                </div>
                <h2 className="mt-4 text-[17px] font-semibold leading-tight tracking-[-0.03em]">
                  {topAlerts.length ? "A few things deserve a closer look." : "Your money, made clearer."}
                </h2>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/65">
                  Ask about spending patterns, budgets or anything that looks unusual. You choose whether your financial data is shared.
                </p>
                <div className="mt-4 space-y-1.5">
                  {["Analyse my spending this month", "Help me improve my budget"].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => openAssistant({ prompt })}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-left text-[11px] text-white/85 transition hover:bg-white/[0.1]"
                    >
                      <span>{prompt}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-white/45" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {showWidget("budgets_overview") ? (
            <Surface className="overflow-hidden">
              <SurfaceHeader
                title="Budgets"
                subtitle={
                  totalBudget
                    ? `${formatCurrency(totalSpentBudget, { compact: true })} of ${formatCurrency(totalBudget, { compact: true })} used`
                    : "Keep everyday spending in view"
                }
                actions={<Link to="/budgets" className="text-[11px] font-semibold text-emerald">Manage</Link>}
                compact
              />
              {budgets.length ? (
                <div className="mt-3 divide-y divide-border/50 border-t border-border/50">
                  {budgets.slice(0, 4).map((budget) => (
                    <BudgetLine key={budget.budget_id || budget.category} budget={budget} />
                  ))}
                </div>
              ) : (
                <EmptyPanel
                  icon={Target}
                  title="No budgets yet"
                  description="Set a simple monthly limit for the categories that matter."
                  action={
                    <Button variant="outlinePill" size="sm" asChild>
                      <Link to="/budgets">Create a budget</Link>
                    </Button>
                  }
                  className="py-8"
                />
              )}
            </Surface>
          ) : null}

          <Surface className="overflow-hidden">
            <SurfaceHeader
              title="Upcoming"
              subtitle="Bills and planned payments"
              actions={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
              compact
            />
            {topUpcoming.length ? (
              <div className="mt-3 divide-y divide-border/50 border-t border-border/50">
                {topUpcoming.map((item, index) => {
                  const amount = item.estimated_amount ?? item.amount;
                  return (
                    <div key={`${item.description || item.name}-${index}`} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium">{item.description || item.name || "Upcoming payment"}</span>
                        <span className="block text-[10.5px] text-muted-foreground">
                          {formatShortDate(item.date || item.due_date)}
                        </span>
                      </span>
                      {amount != null ? (
                        <span className="money-tabular shrink-0 text-[12px] font-semibold">{formatCurrency(amount)}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-7 text-center">
                <TrendingUp className="mx-auto h-4 w-4 text-muted-foreground" />
                <p className="mt-2 text-[11px] text-muted-foreground">Nothing scheduled yet.</p>
              </div>
            )}
          </Surface>

          {showWidget("maaser_balance") ? (
            <Link
              to="/jewish"
              className="surface surface-hover flex items-center gap-3 p-4"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-topaz/10 text-topaz">
                <Target className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium">Maaser & giving</span>
                <span className="block text-[10.5px] text-muted-foreground">Open your giving overview</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

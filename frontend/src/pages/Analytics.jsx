import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, RefreshCw, Wallet, PiggyBank } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { summarizeTrends } from "../lib/analyticsSummary";
import { useCategories } from "../contexts/CategoriesContext";
import { Button } from "../components/ui/button";
import { PageHeader, Surface, SurfaceHeader, StatCard, EmptyPanel } from "../components/ui/page";
import CategoryDonut from "../components/finance/CategoryDonut";
import ReferenceCashFlowChart from "../components/finance/ReferenceCashFlowChart";

function rangeForMonths(months) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const date = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  return { date_from: date(start), date_to: date(end) };
}

const PERIODS = [{ months: 3, label: "3M" }, { months: 6, label: "6M" }, { months: 12, label: "1Y" }];

export default function Analytics() {
  const [months, setMonths] = useState(6);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState({ trends: [], categories: [], comparisons: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { version: categoriesVersion } = useCategories();

  useEffect(() => { document.title = "Analytics | Penni"; }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    Promise.allSettled([
      api.get("/analytics/spending-trends", { params: { months } }),
      api.get("/analytics/spending-by-category", { params: rangeForMonths(months) }),
      api.get("/analytics/budget-comparison"),
    ]).then(results => {
      if (!active) return;
      if (results.every(result => result.status === "rejected")) {
        setError(true);
        return;
      }
      const value = index => results[index].status === "fulfilled" ? results[index].value.data : {};
      setData({
        trends: value(0).trends || [],
        categories: value(1).categories || [],
        comparisons: value(2).comparisons || [],
      });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [months, refresh, categoriesVersion]);

  const summary = useMemo(() => summarizeTrends(data.trends), [data.trends]);
  const categoryTotal = data.categories.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

  return (
    <div className="penni-analytics page-stack pb-4" data-testid="analytics-root">
      <PageHeader title="Analytics" eyebrow="Insights" description="Follow the real story behind your money."
        actions={<div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-2xl border border-border bg-card p-1" role="group" aria-label="Time period">
            {PERIODS.map(period => (
              <button type="button" key={period.months} onClick={() => setMonths(period.months)}
                aria-pressed={months === period.months}
                className={"h-9 min-w-12 rounded-xl px-3 text-xs font-semibold transition-colors " +
                  (months === period.months ? "penni-accent-button" : "text-muted-foreground hover:bg-secondary")}>
                {period.label}
              </button>
            ))}
          </div>
          <Button variant="outlinePill" size="sm" onClick={() => setRefresh(current => current + 1)}
            aria-label="Refresh analytics"><RefreshCw className="h-4 w-4" /></Button>
          <Button asChild variant="outlinePill" size="sm"><Link to="/reports">Reports</Link></Button>
        </div>} />

      {error ? (
        <Surface padded>
          <EmptyPanel icon={BarChart3} title="Unable to load your analytics"
            description="The financial data service is unavailable. Your existing records have not been changed."
            action={<Button variant="primary" onClick={() => setRefresh(value => value + 1)}>Try again</Button>} />
        </Surface>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy={loading}>
            <StatCard label="Total income" value={loading ? "—" : formatCurrency(summary.income)} detail="Selected period" icon={ArrowDownRight} tone="blue" />
            <StatCard label="Total spending" value={loading ? "—" : formatCurrency(summary.spending)} detail="Selected period" icon={ArrowUpRight} tone="ruby" />
            <StatCard label="Net saved" value={loading ? "—" : formatCurrency(summary.saved)} detail="Income minus spending" icon={PiggyBank} tone="topaz" />
            <StatCard label="Savings rate" value={loading ? "—" : summary.savingsRate.toFixed(1) + "%"} detail="Share of total income" icon={Wallet} />
          </div>
          <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
            <Surface className="min-w-0 p-4 sm:p-6">
              <SurfaceHeader title="Money in and out" subtitle="Income and spending across your selected months" compact />
              {loading ? <div className="penni-skeleton mt-5 h-[250px] rounded-2xl" role="status" aria-label="Loading chart" /> :
                data.trends.length ? <ReferenceCashFlowChart data={data.trends} height={250} /> :
                <EmptyPanel title="No activity for this period" description="Your chart will appear when transactions are recorded." />}
            </Surface>
            <Surface className="min-w-0 p-4 sm:p-6">
              <SurfaceHeader title="Spending categories" subtitle="Where your money went" compact />
              {loading ? <div className="penni-skeleton mt-5 h-[250px] rounded-2xl" role="status" aria-label="Loading categories" /> :
                <CategoryDonut data={data.categories} total={categoryTotal} size={178} />}
            </Surface>
          </div>
          <Surface className="overflow-hidden">
            <SurfaceHeader title="Budget performance" subtitle="Current month, from your existing budget engine"
              actions={<Button asChild variant="outlinePill" size="sm"><Link to="/budgets">Manage budgets</Link></Button>} compact />
            {loading ? <div className="penni-skeleton m-5 h-24 rounded-2xl" role="status" aria-label="Loading budgets" /> :
              data.comparisons.length ? (
                <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
                  {data.comparisons.slice(0, 9).map((row, index) => {
                    const pct = Math.min(100, Math.max(0, Number(row.progress_pct) || 0));
                    return <div key={row.category + index} className="rounded-2xl border border-border bg-secondary/30 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold capitalize">{row.category}</p>
                        <span className="money-tabular text-xs text-muted-foreground">{Math.round(pct)}%</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar"
                        aria-label={row.category + " budget used"} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full rounded-full" style={{ width: pct + "%", background: pct > 90 ? "#e5484d" : "var(--penni-accent)" }} />
                      </div>
                      <p className="money-tabular mt-2 text-xs text-muted-foreground">{formatCurrency(row.spent)} of {formatCurrency(row.budget)}</p>
                    </div>;
                  })}
                </div>
              ) : <EmptyPanel title="No budgets yet" description="Create a budget to compare planned and actual spending." />}
          </Surface>
        </>
      )}
    </div>
  );
}

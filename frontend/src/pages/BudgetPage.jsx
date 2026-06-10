import React, { useCallback, useEffect, useMemo, useState } from "react";
import { parseISO, isBefore } from "date-fns";
import {
  RefreshCw, Wallet, ShoppingCart, Calendar, Plus, Pencil, Trash2,
  Check, X, Target, TrendingDown, ChevronLeft, ChevronRight,
  Sparkles, AlertTriangle, TrendingUp, Zap, Download,
} from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { PageHeader, MetricCard } from "../components/ui/layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import ConfirmModal from "../components/ui/ConfirmModal";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import CategoryCombobox from "../components/CategoryCombobox";

function fmtMonth(y, m) { return `${y}-${String(m).padStart(2, "0")}`; }

function parseMonth(str) {
  const p = str.split("-");
  return { year: parseInt(p[0], 10), month: parseInt(p[1], 10) };
}

function addMonth(str, delta) {
  const { year, month } = parseMonth(str);
  const d = new Date(year, month - 1 + delta, 1);
  return fmtMonth(d.getFullYear(), d.getMonth() + 1);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={32}>
      <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="spent" stroke={color} strokeWidth={1.5} fill={`url(#grad-${color})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default React.memo(function BudgetPage() {
  const now = new Date();
  const [month, setMonth] = useState(fmtMonth(now.getFullYear(), now.getMonth() + 1));
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [allCats, setAllCats] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addTab, setAddTab] = useState("expense");
  const [form, setForm] = useState({ category: "", limit: "", budget_type: "everyday", event_date: "" });
  const [quickForm, setQuickForm] = useState({ amount: "", description: "", category: "" });
  const [alerts, setAlerts] = useState([]);
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [trends, setTrends] = useState({});
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [applyingInsight, setApplyingInsight] = useState(null);

  const { year, month: mNum } = parseMonth(month);
  const monthLabel = `${MONTH_NAMES[mNum - 1]} ${year}`;
  const isCurrentMonth = month === fmtMonth(now.getFullYear(), now.getMonth() + 1);

  const everyday = useMemo(() => budgets.filter((b) => (b.budget_type || "everyday") !== "event"), [budgets]);
  const events = useMemo(() => budgets.filter((b) => b.budget_type === "event"), [budgets]);
  const upcomingEvents = useMemo(() =>
    events
      .filter((b) => b.event_date && !isBefore(parseISO(b.event_date), now))
      .sort((a, b) => (a.event_date || "").localeCompare(b.event_date || "")),
    [events, now],
  );
  const pastEvents = useMemo(() =>
    events.filter((b) => b.event_date && isBefore(parseISO(b.event_date), now)),
    [events, now],
  );

  const summary = useMemo(() => {
    const totalPlanned = budgets.reduce((s, b) => s + (Number(b.limit) || 0), 0);
    const totalSpent = budgets.reduce((s, b) => s + (Number(b.spent) || 0), 0);
    const overCount = budgets.filter((b) => (b.progress_pct || 0) >= 100).length;
    return { count: budgets.length, totalPlanned, totalSpent, overCount };
  }, [budgets]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/budgets", { params: { month } });
      setBudgets(data.budgets || []);
    } catch {
      toast.error("Failed to load budgets");
    } finally {
      setLoading(false);
    }
  }, [month]);

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await api.get("/categories");
      setAllCats(data.categories || []);
    } catch {}
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const { data } = await api.get("/budgets/alerts");
      setAlerts(data.alerts || []);
    } catch {}
  }, []);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const { data } = await api.get("/budgets/insights");
      setInsights(data.insights || []);
    } catch {} finally {
      setInsightsLoading(false);
    }
  }, []);

  const fetchTrends = useCallback(async () => {
    if (everyday.length === 0) return;
    setTrendsLoading(true);
    try {
      const { data } = await api.get("/budgets/trends", { params: { all: true, months: 6 } });
      setTrends(data.trends || {});
    } catch {} finally {
      setTrendsLoading(false);
    }
  }, [everyday.length]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchCategories(); }, []);
  useEffect(() => { fetchAlerts(); }, []);
  useEffect(() => { fetchInsights(); }, []);
  useEffect(() => { if (!loading && everyday.length > 0) fetchTrends(); }, [loading, everyday.length, fetchTrends]);

  const resetForm = () => setForm({ category: "", limit: "", budget_type: "everyday", event_date: "" });
  const resetQuickForm = () => setQuickForm({ amount: "", description: "", category: "" });

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.category.trim() || !form.limit) { toast.error("Enter a category and amount"); return; }
    try {
      const payload = {
        category: form.category.toLowerCase().trim(),
        limit: parseFloat(form.limit),
        budget_type: form.budget_type,
      };
      if (form.budget_type === "event" && form.event_date) payload.event_date = form.event_date;
      await api.post("/budgets", payload);
      toast.success(form.budget_type === "event" ? "Event created" : "Budget created");
      resetForm();
      setShowAdd(false);
      await fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Could not save"); }
  };

  const handleQuickExpense = async (e) => {
    e.preventDefault();
    if (!quickForm.amount || !quickForm.category) { toast.error("Enter amount and category"); return; }
    try {
      await api.post("/transactions", {
        amount: -Math.abs(parseFloat(quickForm.amount)),
        description: quickForm.description || `Quick expense: ${quickForm.category}`,
        category: quickForm.category.toLowerCase().trim(),
      });
      toast.success("Expense added");
      resetQuickForm();
      setShowAdd(false);
      await fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Could not save"); }
  };

  const handleApplyInsight = async (insight) => {
    setApplyingInsight(insight.category);
    try {
      const existing = budgets.find((b) => b.category === insight.category);
      if (existing) {
        await api.patch(`/budgets/${existing.budget_id}`, { limit: insight.suggested_budget });
      } else {
        await api.post("/budgets", {
          category: insight.category,
          limit: insight.suggested_budget,
          period: "monthly",
          budget_type: "everyday",
        });
      }
      toast.success(`Budget for ${insight.category} set to £${insight.suggested_budget}`);
      await fetchData();
      await fetchInsights();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not apply suggestion");
    } finally {
      setApplyingInsight(null);
    }
  };

  const startEdit = (b) => {
    setEditingId(b.budget_id);
    setForm({
      category: b.category,
      limit: String(b.limit),
      budget_type: b.budget_type || "everyday",
      event_date: b.event_date ? b.event_date.slice(0, 10) : "",
    });
  };

  const cancelEdit = () => { setEditingId(null); resetForm(); };

  const handleUpdate = async (id) => {
    if (!form.category.trim() || !form.limit) { toast.error("Enter a category and amount"); return; }
    try {
      const payload = { category: form.category.toLowerCase().trim(), limit: parseFloat(form.limit) };
      if (form.budget_type === "event") payload.event_date = form.event_date || null;
      await api.patch(`/budgets/${id}`, payload);
      toast.success("Updated");
      cancelEdit();
      await fetchData();
    } catch { toast.error("Could not update"); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/budgets/${id}`);
      toast.success("Removed");
      setConfirmDelete(null);
      await fetchData();
    } catch { toast.error("Could not delete"); }
  };

  const handleSeedDefaults = async () => {
    try {
      await api.post("/budgets/seed-defaults");
      toast.success("Default budgets loaded");
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not load defaults");
    }
  };

  const criticalAlerts = alerts.filter((a) => a.severity === "critical");
  const warningAlerts = alerts.filter((a) => a.severity === "warning");
  const spikeAlerts = alerts.filter((a) => a.severity === "spike");

  const renderBudgetCard = (b, showDate = false) => {
    const over = (b.progress_pct || 0) >= 100;
    const isEditing = editingId === b.budget_id;
    const catTrends = trends[b.category];

    if (isEditing) {
      return (
        <div key={b.budget_id} className="rounded-xl border border-border bg-card/50 p-4 density-pad space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="flex-1" />
            <Input type="number" step="0.01" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} className="w-full sm:w-28" />
            {showDate && <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className="w-full sm:w-36" />}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="pill" onClick={() => handleUpdate(b.budget_id)}><Check className="h-3.5 w-3.5 mr-1" /> Save</Button>
            <Button variant="outlinePill" size="pill" onClick={cancelEdit}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
          </div>
        </div>
      );
    }

    return (
      <div key={b.budget_id} className="rounded-xl border border-border bg-card/50 p-4 density-pad hover:border-muted-foreground/20 transition-all group">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium capitalize break-all">{b.category}</h3>
            {showDate && b.event_date && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(b.event_date)}
                {!isBefore(parseISO(b.event_date), now) && (
                  <span className="ml-2">· {daysUntil(b.event_date)} days away</span>
                )}
              </p>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => startEdit(b)} className="p-1 rounded hover:bg-secondary text-muted-foreground"><Pencil className="h-3 w-3" /></button>
            <button onClick={() => setConfirmDelete(b.budget_id)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-ruby"><Trash2 className="h-3 w-3" /></button>
          </div>
        </div>

        <div className="flex items-baseline gap-1.5 mb-1.5">
          <span className={`text-lg font-semibold tabular-nums ${over ? "text-ruby" : "text-foreground"}`}>
            £{b.spent}
          </span>
          <span className="text-sm text-muted-foreground">/ £{b.limit}</span>
          {over && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ruby/10 text-ruby font-medium">Over</span>}
        </div>

        <div className="h-2 rounded-full bg-muted/50 overflow-hidden mb-1">
          <div
            className={`h-full rounded-full transition-all ${over ? "bg-ruby" : "bg-emerald"}`}
            style={{ width: `${Math.min(100, b.progress_pct || 0)}%` }}
          />
        </div>

        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{b.progress_pct}% used</span>
          <span>£{Math.max(0, b.remaining || 0).toFixed(2)} left</span>
        </div>

        {catTrends && catTrends.length >= 2 && (
          <div className="mt-0.5 -mx-1">
            <Sparkline data={catTrends} color={over ? "#e5484d" : "#30a46c"} />
          </div>
        )}
      </div>
    );
  };

  const formatDate = (d) => {
    if (!d) return "";
    const dt = parseISO(d);
    return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  const daysUntil = (d) => {
    const diff = parseISO(d).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="space-y-6 density-gap-y">
      <PageHeader
        eyebrow="Finance"
        title="Budgets"
        description="Set spending limits and track where your money goes."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSeedDefaults}>
              <Download className="h-4 w-4 mr-1.5" /> Load defaults
            </Button>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        }
      />

      {/* Smart Alerts Banner */}
      {alerts.length > 0 && (
        <div className="density-gap-y">
          {criticalAlerts.length > 0 && criticalAlerts.map((a) => (
            !dismissedAlerts.has(a.category + a.severity) && (
              <div key={`critical-${a.category}`} className="flex items-start gap-3 rounded-xl border border-ruby/30 bg-ruby/5 p-3 density-pad">
                <AlertTriangle className="h-5 w-5 text-ruby shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ruby">{a.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">£{a.spent} of £{a.budget} used</p>
                </div>
                <button onClick={() => setDismissedAlerts(new Set([...dismissedAlerts, a.category + a.severity]))} className="p-1 rounded hover:bg-ruby/10 text-ruby/60 hover:text-ruby"><X className="h-4 w-4" /></button>
              </div>
            )
          ))}
          {warningAlerts.length > 0 && warningAlerts.filter((a) => !dismissedAlerts.has(a.category + a.severity)).length > 0 && (
            <details className="group">
              <summary className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                <TrendingUp className="h-4 w-4" />
                <span>{warningAlerts.filter((a) => !dismissedAlerts.has(a.category + a.severity)).length} budgets nearing limit</span>
              </summary>
              <div className="mt-2 density-gap-y">
                {warningAlerts.map((a) => (
                  !dismissedAlerts.has(a.category + a.severity) && (
                    <div key={`warning-${a.category}`} className="flex items-start gap-3 rounded-xl border border-topaz/30 bg-topaz/5 p-3 density-pad">
                      <TrendingUp className="h-5 w-5 text-topaz shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{a.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">£{a.spent} of £{a.budget} used</p>
                      </div>
                      <button onClick={() => setDismissedAlerts(new Set([...dismissedAlerts, a.category + a.severity]))} className="p-1 rounded hover:bg-topaz/10 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                    </div>
                  )
                ))}
              </div>
            </details>
          )}
          {spikeAlerts.length > 0 && spikeAlerts.filter((a) => !dismissedAlerts.has(a.category + a.severity)).length > 0 && (
            <details className="group">
              <summary className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                <Zap className="h-4 w-4" />
                <span>{spikeAlerts.filter((a) => !dismissedAlerts.has(a.category + a.severity)).length} spending spikes</span>
              </summary>
              <div className="mt-2 density-gap-y">
                {spikeAlerts.map((a) => (
                  !dismissedAlerts.has(a.category + a.severity) && (
                    <div key={`spike-${a.category}`} className="flex items-start gap-3 rounded-xl border border-chart-1/30 bg-chart-1/5 p-3 density-pad">
                      <Zap className="h-5 w-5 text-chart-1 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{a.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">3-month avg: £{a.avg_3m}</p>
                      </div>
                      <button onClick={() => setDismissedAlerts(new Set([...dismissedAlerts, a.category + a.severity]))} className="p-1 rounded hover:bg-chart-1/10 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                    </div>
                  )
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Month selector + summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 density-gap">
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(addMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-lg font-semibold min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={() => setMonth(addMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
            <ChevronRight className="h-5 w-5" />
          </button>
          {!isCurrentMonth && (
            <Button variant="ghost" size="pill" onClick={() => setMonth(fmtMonth(now.getFullYear(), now.getMonth() + 1))}>
              Back to today
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground ml-auto">
          <span>Budgeted <strong className="text-foreground">£{summary.totalPlanned.toLocaleString()}</strong></span>
          <span>Spent <strong className={summary.overCount > 0 ? "text-ruby" : "text-emerald"}>£{summary.totalSpent.toLocaleString()}</strong></span>
          {summary.overCount > 0 && <span className="text-ruby">{summary.overCount} over</span>}
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 density-gap">
        <MetricCard label="Budgets" value={String(summary.count)} icon={Wallet} tone="emerald" />
        <MetricCard label="Budgeted" value={`£${summary.totalPlanned.toLocaleString()}`} icon={Target} tone="topaz" />
        <MetricCard label="Spent" value={`£${summary.totalSpent.toLocaleString()}`} icon={TrendingDown} tone={summary.overCount > 0 ? "ruby" : "emerald"} />
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 density-gap">
          {[...Array(6)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse" />)}
        </div>
      )}

      {!loading && budgets.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Wallet className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No budgets yet</p>
          <p className="text-xs mt-1 mb-4">Create your first spending limit or planned event.</p>
          <Button variant="primary" size="pill" onClick={() => { setAddTab("budget"); setShowAdd(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Create budget
          </Button>
        </div>
      )}

      {!loading && budgets.length > 0 && (
        <>
          {/* Everyday Spending */}
          {everyday.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  Monthly Spending Limits
                </h2>
                <span className="text-xs text-muted-foreground">{everyday.length} budgets</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 density-gap">
                {everyday.map((b) => renderBudgetCard(b))}
              </div>
              {trendsLoading && everyday.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">Loading trends...</p>
              )}
            </section>
          )}

          {/* Upcoming Events */}
          {upcomingEvents.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Upcoming Events
                </h2>
                <span className="text-xs text-muted-foreground">{upcomingEvents.length} events</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 density-gap">
                {upcomingEvents.map((b) => renderBudgetCard(b, true))}
              </div>
            </section>
          )}

          {/* Past events for current month */}
          {pastEvents.length > 0 && isCurrentMonth && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Past Events
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 density-gap">
                {pastEvents.map((b) => renderBudgetCard(b, true))}
              </div>
            </section>
          )}

          {events.length > 0 && upcomingEvents.length === 0 && pastEvents.length === 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Planned Events
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 density-gap">
                {events.map((b) => renderBudgetCard(b, true))}
              </div>
            </section>
          )}
        </>
      )}

      {/* AI Budget Insights */}
      {!loading && (insights.length > 0) && (
        <section>
          <button
            onClick={() => setShowInsights(!showInsights)}
            className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3 hover:opacity-80"
          >
            <Sparkles className={`h-4 w-4 text-topaz ${insightsLoading ? "animate-pulse" : ""}`} />
            AI Budget Insights
            <span className="text-xs text-muted-foreground font-normal">({insights.length} suggestions)</span>
          </button>
          {showInsights && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 density-gap">
              {insights.map((ins) => {
                const hasBudget = ins.current_budget > 0;
                const needsChange = ins.suggested_budget !== ins.current_budget;
                return (
                  <div key={ins.category} className="rounded-xl border border-border bg-card/50 p-4 density-pad">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-sm font-medium capitalize">{ins.category}</h4>
                      {!hasBudget && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-topaz/10 text-topaz font-medium">No budget</span>}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1 mb-3">
                      <p>Current: <strong className="text-foreground">£{ins.current_spent}</strong> this month</p>
                      <p>3-month avg: <strong className="text-foreground">£{ins.avg_spent_3m}</strong></p>
                      {hasBudget && <p>Budget: <strong className="text-foreground">£{ins.current_budget}</strong></p>}
                      <p className="text-topaz font-medium mt-1">{ins.reason}</p>
                    </div>
                    {needsChange && (
                      <Button
                        variant="primary"
                        size="pill"
                        className="w-full"
                        onClick={() => handleApplyInsight(ins)}
                        disabled={applyingInsight === ins.category}
                      >
                        {applyingInsight === ins.category ? "Applying..." : `Set to £${ins.suggested_budget}`}
                      </Button>
                    )}
                    {!needsChange && hasBudget && (
                      <p className="text-xs text-emerald text-center">Budget is on track ✓</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* FAB */}
      {!loading && !showAdd && (
        <button
          onClick={() => { setAddTab("expense"); setShowAdd(true); }}
          className="fixed bottom-6 right-6 z-20 h-14 w-14 rounded-full bg-emerald text-white shadow-lg hover:bg-emerald/90 active:scale-95 transition-all flex items-center justify-center"
          aria-label="Quick add"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Bottom sheet — mobile sheet, desktop centered dialog */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:flex lg:items-start lg:justify-center lg:pt-[10vh]" onClick={() => { setShowAdd(false); resetForm(); resetQuickForm(); }}>
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl border border-border bg-card/95 backdrop-blur-xl shadow-modal p-6 max-h-[85vh] overflow-y-auto animate-slide-up lg:relative lg:mx-0 lg:max-w-md lg:rounded-2xl lg:shadow-lg lg:animate-[fadeUp_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20 mx-auto mb-4" />

            {/* Tabs */}
            <div className="flex gap-2 p-1 rounded-xl bg-muted/50 mb-5">
              <button
                type="button"
                onClick={() => setAddTab("expense")}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${addTab === "expense" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
              >
                <TrendingDown className="h-3.5 w-3.5 inline mr-1.5" /> Quick Expense
              </button>
              <button
                type="button"
                onClick={() => setAddTab("budget")}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${addTab === "budget" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
              >
                <Target className="h-3.5 w-3.5 inline mr-1.5" /> New Budget
              </button>
            </div>

            {addTab === "expense" ? (
              <form onSubmit={handleQuickExpense}>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <CategoryCombobox
                      value={quickForm.category}
                      onChange={(val) => setQuickForm({ ...quickForm, category: val })}
                      categories={allCats}
                      placeholder="Category"
                      onCategoryCreated={fetchCategories}
                    />
                  </div>
                  <div className="w-28">
                    <Input type="number" step="0.01" min="0.01" placeholder="£0.00" value={quickForm.amount}
                      onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })} required autoFocus className="text-right" />
                  </div>
                  <Button type="submit" variant="primary" size="pill" className="shrink-0 h-11 px-4">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {quickForm.description && (
                  <div className="mt-2">
                    <Input placeholder="Description (optional)" value={quickForm.description}
                      onChange={(e) => setQuickForm({ ...quickForm, description: e.target.value })} />
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <button type="button" onClick={() => setQuickForm({ ...quickForm, description: quickForm.description ? "" : " " })}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {quickForm.description ? "Remove description" : "+ Add description"}
                  </button>
                  <button type="button" onClick={() => { setShowAdd(false); resetQuickForm(); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreate}>
                {/* Type toggle */}
                <div className="flex gap-2 p-1 rounded-xl bg-muted/50 mb-4">
                  <button type="button"
                    onClick={() => setForm({ ...form, budget_type: "everyday", event_date: "" })}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${form.budget_type === "everyday" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
                    <ShoppingCart className="h-3.5 w-3.5 inline mr-1.5" /> Monthly
                  </button>
                  <button type="button"
                    onClick={() => setForm({ ...form, budget_type: "event" })}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${form.budget_type === "event" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
                    <Calendar className="h-3.5 w-3.5 inline mr-1.5" /> Event
                  </button>
                </div>

                {form.budget_type === "everyday" ? (
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <CategoryCombobox
                        value={form.category}
                        onChange={(val) => setForm({ ...form, category: val })}
                        categories={allCats}
                        placeholder="Category"
                        onCategoryCreated={fetchCategories}
                      />
                    </div>
                    <div className="w-28">
                      <Input type="number" step="0.01" min="0" placeholder="£0.00" value={form.limit}
                        onChange={(e) => setForm({ ...form, limit: e.target.value })} required className="text-right" />
                    </div>
                    <Button type="submit" variant="primary" size="pill" className="shrink-0 h-11 px-4">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end gap-3">
                      <div className="flex-[2]">
                        <Input placeholder="Event name (e.g. Pesach 2026)" value={form.category}
                          onChange={(e) => setForm({ ...form, category: e.target.value })} required />
                      </div>
                      <div className="w-28">
                        <Input type="number" step="0.01" min="0" placeholder="£0.00" value={form.limit}
                          onChange={(e) => setForm({ ...form, limit: e.target.value })} required className="text-right" />
                      </div>
                    </div>
                    <div className="flex items-end gap-3 mt-3">
                      <div className="flex-1">
                        <Input type="date" value={form.event_date}
                          onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                          className="text-sm" />
                      </div>
                      <Button type="submit" variant="primary" size="pill" className="shrink-0 h-11 px-4">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}

                <div className="flex justify-end mt-2">
                  <button type="button" onClick={() => { setShowAdd(false); resetForm(); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title="Remove this budget?"
        message="This will permanently delete this budget item."
        confirmLabel="Yes, remove"
        onConfirm={() => handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
});

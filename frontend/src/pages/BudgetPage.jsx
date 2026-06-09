import React, { useCallback, useEffect, useMemo, useState } from "react";
import { parseISO, isBefore } from "date-fns";
import {
  RefreshCw, Wallet, ShoppingCart, Calendar, Plus, Pencil, Trash2,
  Check, X, Target, TrendingDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { PageHeader, MetricCard } from "../components/ui/layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import ConfirmModal from "../components/ui/ConfirmModal";

const CATEGORIES = [
  "groceries", "dining", "transport", "rent", "utilities",
  "subscriptions", "tzedakah", "health", "entertainment",
  "shopping", "insurance", "education", "gifts", "charity",
];

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

export default React.memo(function BudgetPage() {
  const now = new Date();
  const [month, setMonth] = useState(fmtMonth(now.getFullYear(), now.getMonth() + 1));
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category: "", limit: "", budget_type: "everyday", event_date: "" });

  const { year, month: mNum } = parseMonth(month);
  const monthLabel = `${MONTH_NAMES[mNum - 1]} ${year}`;
  const isCurrentMonth = month === fmtMonth(now.getFullYear(), now.getMonth() + 1);

  const everyday = useMemo(() => budgets.filter((b) => (b.budget_type || "everyday") !== "event"), [budgets]);
  const events = useMemo(() => budgets.filter((b) => b.budget_type === "event"), [budgets]);
  const upcomingEvents = useMemo(() =>
    events
      .filter((b) => b.event_date && !isBefore(parseISO(b.event_date), new Date()))
      .sort((a, b) => (a.event_date || "").localeCompare(b.event_date || "")),
    [events],
  );
  // Events in the past for this month
  const pastEvents = useMemo(() =>
    events.filter((b) => b.event_date && isBefore(parseISO(b.event_date), new Date())),
    [events],
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

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => setForm({ category: "", limit: "", budget_type: "everyday", event_date: "" });

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

  const renderBudgetCard = (b, showDate = false) => {
    const over = (b.progress_pct || 0) >= 100;
    const isEditing = editingId === b.budget_id;

    if (isEditing) {
      return (
        <div key={b.budget_id} className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
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
      <div key={b.budget_id} className="rounded-xl border border-border bg-card/50 p-4 hover:border-muted-foreground/20 transition-all group">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium capitalize truncate">{b.category}</h3>
            {showDate && b.event_date && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(b.event_date)}
                {!isBefore(parseISO(b.event_date), new Date()) && (
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

        <div className="flex items-baseline gap-1.5 mb-2">
          <span className={`text-lg font-semibold tabular-nums ${over ? "text-ruby" : "text-foreground"}`}>
            £{b.spent}
          </span>
          <span className="text-sm text-muted-foreground">/ £{b.limit}</span>
          {over && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ruby/10 text-ruby font-medium">Over</span>}
        </div>

        <div className="h-2 rounded-full bg-muted/50 overflow-hidden mb-1.5">
          <div
            className={`h-full rounded-full transition-all ${over ? "bg-ruby" : "bg-emerald"}`}
            style={{ width: `${Math.min(100, b.progress_pct || 0)}%` }}
          />
        </div>

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{b.progress_pct}% used</span>
          <span>£{Math.max(0, b.remaining || 0).toFixed(2)} left</span>
        </div>
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Budgets"
        description="Set spending limits and track where your money goes."
        actions={
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {/* Month selector + summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
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
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <MetricCard label="Budgets" value={String(summary.count)} icon={Wallet} tone="emerald" />
        <MetricCard label="Budgeted" value={`£${summary.totalPlanned.toLocaleString()}`} icon={Target} tone="topaz" />
        <MetricCard label="Spent" value={`£${summary.totalSpent.toLocaleString()}`} icon={TrendingDown} tone={summary.overCount > 0 ? "ruby" : "emerald"} />
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse" />)}
        </div>
      )}

      {!loading && budgets.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Wallet className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No budgets yet</p>
          <p className="text-xs mt-1 mb-4">Create your first spending limit or planned event.</p>
          <Button variant="primary" size="pill" onClick={() => setShowAdd(true)}>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {everyday.map((b) => renderBudgetCard(b))}
              </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcomingEvents.map((b) => renderBudgetCard(b, true))}
              </div>
            </section>
          )}

          {/* Past events for current month (shown separate) */}
          {pastEvents.length > 0 && isCurrentMonth && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Past Events
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pastEvents.map((b) => renderBudgetCard(b, true))}
              </div>
            </section>
          )}

          {/* Events with no date shown separately */}
          {events.length > 0 && upcomingEvents.length === 0 && pastEvents.length === 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Planned Events
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {events.map((b) => renderBudgetCard(b, true))}
              </div>
            </section>
          )}
        </>
      )}

      {/* FAB */}
      {!loading && !showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-6 right-6 z-20 h-14 w-14 rounded-full bg-emerald text-white shadow-lg hover:bg-emerald/90 active:scale-95 transition-all flex items-center justify-center"
          aria-label="Add budget"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => { setShowAdd(false); resetForm(); }}>
          <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl tracking-tight font-medium mb-1">
              {form.budget_type === "event" ? "Add Planned Event" : "Add Spending Limit"}
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              {form.budget_type === "event"
                ? "One-time budget for a holiday, simcha, or other event."
                : "Monthly limit for a regular spending category."}
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Type toggle */}
              <div className="flex gap-2 p-1 rounded-xl bg-muted/50">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, budget_type: "everyday", event_date: "" })}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${form.budget_type === "everyday" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
                >
                  <ShoppingCart className="h-3.5 w-3.5 inline mr-1.5" /> Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, budget_type: "event" })}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${form.budget_type === "event" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
                >
                  <Calendar className="h-3.5 w-3.5 inline mr-1.5" /> Event
                </button>
              </div>

              {/* Category / Event name */}
              {form.budget_type === "everyday" ? (
                <div>
                  <label className="label-overline mb-1 block">Category</label>
                  <Input list="cats" placeholder="e.g. groceries" value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })} required />
                  <datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
              ) : (
                <div>
                  <label className="label-overline mb-1 block">Event name</label>
                  <Input placeholder="e.g. Pesach 2026" value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })} required />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-overline mb-1 block">Amount (£)</label>
                  <Input type="number" step="0.01" min="0" placeholder="0.00" value={form.limit}
                    onChange={(e) => setForm({ ...form, limit: e.target.value })} required />
                </div>
                {form.budget_type === "event" && (
                  <div>
                    <label className="label-overline mb-1 block">Event date</label>
                    <Input type="date" value={form.event_date}
                      onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <Button type="button" variant="outlinePill" size="pill" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</Button>
                <Button type="submit" variant="primary" size="pill">
                  <Plus className="h-4 w-4 mr-1" /> {form.budget_type === "event" ? "Add Event" : "Add Budget"}
                </Button>
              </div>
            </form>
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

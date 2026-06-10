import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseISO, isBefore } from "date-fns";
import {
  RefreshCw, Wallet, ShoppingCart, Calendar, Plus, Pencil, Trash2,
  Check, X, Target, TrendingDown, ChevronLeft, ChevronRight,
  Sparkles, AlertTriangle, TrendingUp, Zap, Download, Search, Copy,
} from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import ConfirmModal from "../components/ui/ConfirmModal";
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

function ProgressRing({ pct, size = 40, stroke = 3.5, color }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/30" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color || (pct >= 100 ? "#e5484d" : "#30a46c")} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.5s ease" }} />
    </svg>
  );
}

function Sparkline({ data, color, height = 28 }) {
  if (!data || data.length < 2) return null;
  const w = 60;
  const values = data.map((d) => d.spent);
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const range = mx - mn || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${height - ((v - mn) / range) * (height - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={height} className="w-full overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

export default React.memo(function BudgetPage() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);
  const [month, setMonth] = useState(fmtMonth(now.getFullYear(), now.getMonth() + 1));
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [allCats, setAllCats] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addTab, setAddTab] = useState("expense");
  const [form, setForm] = useState({ category: "", limit: "", budget_type: "everyday", event_date: "", event_group_id: "", event_group_name: "" });
  const [quickForm, setQuickForm] = useState({ amount: "", description: "", category: "" });
  const [budgetAdded, setBudgetAdded] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [applyingInsight, setApplyingInsight] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [eventGroups, setEventGroups] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryHierarchy, setCategoryHierarchy] = useState({});

  const { year, month: mNum } = parseMonth(month);
  const monthLabel = `${MONTH_NAMES[mNum - 1]} ${year}`;
  const isCurrentMonth = month === fmtMonth(now.getFullYear(), now.getMonth() + 1);

  const everyday = useMemo(() => budgets.filter((b) => (b.budget_type || "everyday") !== "event"), [budgets]);
  const events = useMemo(() => budgets.filter((b) => b.budget_type === "event"), [budgets]);
  const upcomingEventGroups = useMemo(() =>
    Object.values(eventGroups).filter((g) => g.event_date && !isBefore(parseISO(g.event_date), now))
      .sort((a, b) => (a.event_date || "").localeCompare(b.event_date || "")),
    [eventGroups, now],
  );
  const pastEventGroups = useMemo(() =>
    Object.values(eventGroups).filter((g) => g.event_date && isBefore(parseISO(g.event_date), now)),
    [eventGroups, now],
  );
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

  const sectionForCategory = useMemo(() => {
    const map = {};
    Object.entries(categoryHierarchy).forEach(([section, names]) => {
      if (Array.isArray(names)) names.forEach((n) => { if (typeof n === "string") map[n] = section; });
    });
    // Also map from allCats which includes custom categories
    allCats.forEach((c) => { if (c.section) map[c.name] = c.section; });
    return map;
  }, [categoryHierarchy, allCats]);

  const filteredEveryday = useMemo(() => {
    let items = everyday;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter((b) => b.category.toLowerCase().includes(q));
    }
    return items;
  }, [everyday, searchQuery]);

  const sectionsForDisplay = useMemo(() => {
    const groups = {};
    filteredEveryday.forEach((b) => {
      const sec = sectionForCategory[b.category] || "Other";
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push(b);
    });
    // Maintain hierarchy order + append custom sections
    const ordered = {};
    Object.keys(categoryHierarchy).forEach((sec) => {
      if (groups[sec]) { ordered[sec] = groups[sec]; delete groups[sec]; }
    });
    Object.entries(groups).forEach(([sec, items]) => { ordered[sec] = items; });
    return ordered;
  }, [filteredEveryday, sectionForCategory, categoryHierarchy]);


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/budgets", { params: { month } });
      setBudgets(data.budgets || []);
      setEventGroups(data.event_groups || {});
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
      setCategoryHierarchy(data.hierarchy || {});
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

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchCategories(); }, []);
  useEffect(() => { fetchAlerts(); }, []);
  useEffect(() => { fetchInsights(); }, []);

  const resetForm = () => setForm({ category: "", limit: "", budget_type: "everyday", event_date: "", event_group_id: "", event_group_name: "" });
  const resetQuickForm = () => setQuickForm({ amount: "", description: "", category: "" });

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.category.trim() || !form.limit) { toast.error("Enter a category and amount"); return; }
    try {
      const payload = {
        category: form.category.toLowerCase().trim(),
        limit: parseFloat(form.limit),
        period: "monthly",
        budget_type: form.budget_type,
        month: month,
      };
      if (form.budget_type === "event") {
        if (form.event_date) payload.event_date = form.event_date;
        if (form.event_group_id) payload.event_group_id = form.event_group_id;
        if (form.event_group_name) payload.event_group_name = form.event_group_name.trim();
        delete payload.month;
      }
      await api.post("/budgets", payload);
      toast.success(form.budget_type === "event" ? "Item added to event" : "Budget added");
      setBudgetAdded(true);
      if (form.budget_type === "event") {
        setForm((prev) => ({ ...prev, category: "", limit: "" }));
      } else {
        setForm((prev) => ({ ...prev, category: "", limit: "" }));
      }
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
      event_group_id: b.event_group_id || "",
      event_group_name: b.event_group_name || "",
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
    setSeeding(true);
    try {
      const { data } = await api.post("/budgets/seed-defaults");
      toast.success(data.message || "Default budgets loaded");
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not load defaults");
    } finally {
      setSeeding(false);
    }
  };

  const handleCopyPreviousMonth = async () => {
    const prevMonth = addMonth(month, -1);
    try {
      const { data } = await api.get("/budgets", { params: { month: prevMonth } });
      const prevBudgets = (data.budgets || []).filter((b) => (b.budget_type || "everyday") !== "event");
      if (prevBudgets.length === 0) { toast.info("No budgets to copy from previous month"); return; }
      let copied = 0;
      for (const b of prevBudgets) {
        const existing = budgets.find((eb) => eb.category === b.category);
        if (existing) continue;
        await api.post("/budgets", {
          category: b.category,
          limit: Number(b.limit),
          period: "monthly",
          budget_type: "everyday",
          month,
        });
        copied++;
      }
      toast.success(`Copied ${copied} budget(s) from ${prevMonth}`);
      if (copied > 0) await fetchData();
    } catch { toast.error("Could not copy budgets"); }
  };

  const criticalAlerts = useMemo(() => alerts.filter((a) => a.severity === "critical"), [alerts]);
  const warningAlerts = useMemo(() => alerts.filter((a) => a.severity === "warning"), [alerts]);
  const spikeAlerts = useMemo(() => alerts.filter((a) => a.severity === "spike"), [alerts]);

  const renderBudgetCard = (b, showDate = false) => {
    const over = (b.progress_pct || 0) >= 100;
    const isEditing = editingId === b.budget_id;
    const progressColor = over ? "#e5484d" : (b.progress_pct || 0) >= 80 ? "#e8a838" : "#30a46c";

    if (isEditing) {
      return (
        <div key={b.budget_id} className="rounded-lg border border-border bg-card/50 p-2 space-y-1.5">
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full text-xs rounded border border-border bg-transparent px-1.5 py-1" />
          <input type="number" step="0.01" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} className="w-full text-xs rounded border border-border bg-transparent px-1.5 py-1" />
          <div className="flex gap-1">
            <button onClick={() => handleUpdate(b.budget_id)} className="text-[10px] px-2 py-1 rounded bg-emerald text-white"><Check className="h-3 w-3" /></button>
            <button onClick={cancelEdit} className="text-[10px] px-2 py-1 rounded bg-muted text-muted-foreground"><X className="h-3 w-3" /></button>
          </div>
        </div>
      );
    }

    const isSelected = bulkSelected.has(b.budget_id);
    return (
      <div key={b.budget_id} className={`rounded-lg border ${isSelected ? "border-emerald bg-emerald/5" : "border-border bg-card/80"} p-2.5 hover:border-muted-foreground/20 hover:shadow-sm transition-all group relative`}>
        {isSelected && <div className="absolute inset-0 rounded-lg border-2 border-emerald/40 pointer-events-none" />}
        <div className="flex items-center gap-2">
          <div className="relative shrink-0">
            <input type="checkbox" checked={isSelected} onChange={() => {
              const next = new Set(bulkSelected);
              if (isSelected) next.delete(b.budget_id); else next.add(b.budget_id);
              setBulkSelected(next);
            }} className="absolute -left-1 -top-1 z-10 w-3.5 h-3.5 rounded border-border text-emerald focus:ring-emerald/30" />
            <ProgressRing pct={b.progress_pct || 0} size={32} stroke={3} color={progressColor} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[8px] font-bold tabular-nums">{Math.round(b.progress_pct || 0)}%</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-medium capitalize truncate leading-tight">{b.category}</h3>
            <div className="flex items-baseline gap-1">
              <span className={`text-xs font-semibold tabular-nums ${over ? "text-ruby" : "text-foreground"}`}>
                £{b.spent}
              </span>
              <span className="text-[10px] text-muted-foreground">/ £{b.limit}</span>
            </div>
            <div className="h-1 rounded-full bg-muted/30 overflow-hidden mt-1">
              <div className={`h-full rounded-full ${over ? "bg-ruby" : "bg-gradient-to-r from-emerald via-topaz to-ruby"}`} style={{ width: `${Math.min(100, b.progress_pct || 0)}%` }} />
            </div>
          </div>
          <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => startEdit(b)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
            <button onClick={() => setConfirmDelete(b.budget_id)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-ruby"><Trash2 className="h-3 w-3" /></button>
          </div>
        </div>
      </div>
    );
  };

  const renderEventGroup = (g) => {
    const totalLimit = g.total_limit || 0;
    const totalSpent = g.total_spent || 0;
    const pct = totalLimit ? Math.min(100, (totalSpent / totalLimit) * 100) : 0;
    const over = pct >= 100;
    const eventColor = over ? "#e5484d" : pct >= 80 ? "#e8a838" : "#30a46c";
    return (
      <div key={g.event_group_id} className="rounded-lg border border-border bg-card/80 p-2.5 hover:border-muted-foreground/20 hover:shadow-sm transition-all">
        <div className="flex items-center gap-2">
          {g.event_date && (
            <div className="shrink-0 flex flex-col items-center w-7">
              <span className="text-[8px] uppercase font-bold text-muted-foreground leading-tight">{parseISO(g.event_date).toLocaleDateString("en-GB", { month: "short" })}</span>
              <span className="text-xs font-bold leading-none">{parseISO(g.event_date).getDate()}</span>
            </div>
          )}
          <div className="relative shrink-0">
            <ProgressRing pct={pct} size={28} stroke={3} color={eventColor} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[7px] font-bold tabular-nums">{Math.round(pct)}%</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-medium truncate leading-tight">{g.event_group_name || g.category}</h3>
            <div className="flex items-baseline gap-1">
              <span className={`text-xs font-semibold tabular-nums ${over ? "text-ruby" : "text-foreground"}`}>£{totalSpent.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground">/ £{totalLimit.toFixed(2)}</span>
            </div>
          </div>
          <button onClick={() => {
            if (window.confirm(`Delete entire event "${g.event_group_name}" and all ${g.item_count} items?`)) {
              api.delete(`/budgets/group/${g.event_group_id}`).then(() => { fetchData(); toast.success("Event deleted"); }).catch(() => toast.error("Could not delete event"));
            }
          }} className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-ruby shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="h-3 w-3" /></button>
        </div>

        {g.items && g.items.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-border space-y-0.5">
            {g.items.map((item) => {
              const itemPct = item.limit ? Math.min(100, (item.spent / item.limit) * 100) : 0;
              return (
                <div key={item.budget_id} className="flex items-center gap-1 text-[10px] py-0.5">
                  <div className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
                  <span className="flex-1 truncate text-muted-foreground">{item.category}</span>
                  <span className="tabular-nums text-muted-foreground">£{item.spent.toFixed(2)}</span>
                  <div className="w-8 h-1 rounded-full bg-muted/40 overflow-hidden shrink-0">
                    <div className={`h-full rounded-full ${itemPct >= 100 ? "bg-ruby" : "bg-emerald"}`} style={{ width: `${Math.min(100, itemPct)}%` }} />
                  </div>
                  <button onClick={() => setConfirmDelete(item.budget_id)} className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-ruby"><X className="h-2.5 w-2.5" /></button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-1.5 pt-1.5 border-t border-border">
            <form onSubmit={async (e) => {
              e.preventDefault();
              const input = e.target.elements.namedItem("newItemCat");
              const amt = e.target.elements.namedItem("newItemAmt");
              if (!input?.value || !amt?.value) return;
              try {
                await api.post("/budgets", {
                  category: input.value.toLowerCase().trim(),
                  limit: parseFloat(amt.value),
                  budget_type: "event",
                  event_date: g.event_date,
                  event_group_id: g.event_group_id,
                  event_group_name: g.event_group_name,
                });
                toast.success("Item added");
                input.value = ""; amt.value = "";
                await fetchData();
              } catch { toast.error("Could not add item"); }
            }} className="flex items-end gap-1">
              <div className="flex-1">
                <input name="newItemCat" placeholder="Category" className="w-full h-6 rounded bg-secondary/30 border border-transparent px-1.5 text-[10px] placeholder:text-muted-foreground focus:border-ring focus:outline-none" />
              </div>
              <div className="w-14">
                <input name="newItemAmt" type="number" step="0.01" min="0.01" placeholder="£0" className="w-full h-6 rounded bg-secondary/30 border border-transparent px-1.5 text-[10px] text-right placeholder:text-muted-foreground focus:border-ring focus:outline-none" />
              </div>
              <button type="submit" className="h-6 px-1.5 rounded bg-emerald text-white text-[10px] hover:bg-emerald/90"><Plus className="h-2.5 w-2.5" /></button>
            </form>
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="space-y-5">

      {/* Smart Alerts Banner */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          {criticalAlerts.length > 0 && criticalAlerts.map((a) => (
            !dismissedAlerts.has(a.category + a.severity) && (
              <div key={`critical-${a.category}`} className="flex items-start gap-3 rounded-xl border border-ruby/30 bg-ruby/5 p-3">
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
              <div className="mt-2 space-y-2">
                {warningAlerts.map((a) => (
                  !dismissedAlerts.has(a.category + a.severity) && (
                    <div key={`warning-${a.category}`} className="flex items-start gap-3 rounded-xl border border-topaz/30 bg-topaz/5 p-3">
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
              <div className="mt-2 space-y-2">
                {spikeAlerts.map((a) => (
                  !dismissedAlerts.has(a.category + a.severity) && (
                    <div key={`spike-${a.category}`} className="flex items-start gap-3 rounded-xl border border-chart-1/30 bg-chart-1/5 p-3">
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

      {/* Dashboard overview */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-card via-card/95 to-card/90 backdrop-blur-xl p-5 sm:p-6 shadow-card overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 relative">
          {/* Large progress ring with subtle shadow */}
          <div className="relative shrink-0 drop-shadow-[0_0_8px_rgba(48,164,108,0.4)]">
            <ProgressRing pct={summary.totalPlanned ? (summary.totalSpent / summary.totalPlanned) * 100 : 0} size={80} stroke={5}
              color={summary.overCount > 0 ? "#e5484d" : summary.totalSpent > summary.totalPlanned * 0.8 ? "#e8a838" : "#30a46c"} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold tabular-nums">{summary.totalPlanned ? Math.round((summary.totalSpent / summary.totalPlanned) * 100) : 0}%</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setMonth(addMonth(month, -1))} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-base font-semibold min-w-[130px] text-center">{monthLabel}</span>
              <button onClick={() => setMonth(addMonth(month, 1))} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
              {!isCurrentMonth && (
                <button onClick={() => setMonth(fmtMonth(now.getFullYear(), now.getMonth() + 1))}
                  className="text-xs text-muted-foreground hover:text-foreground ml-1 underline underline-offset-2">
                  Back to today
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Budgeted <strong className="text-foreground">£{summary.totalPlanned.toLocaleString()}</strong></span>
              <span className="text-muted-foreground">Spent <strong className={summary.overCount > 0 ? "text-ruby" : "text-emerald"}>£{summary.totalSpent.toLocaleString()}</strong></span>
              {summary.totalPlanned > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  summary.overCount > 0 ? "bg-ruby/10 text-ruby" :
                  summary.totalSpent > summary.totalPlanned * 0.8 ? "bg-topaz/10 text-topaz" :
                  "bg-emerald/10 text-emerald"
                }`}>
                  {summary.overCount > 0 ? `${summary.overCount} over budget` :
                   summary.totalSpent > summary.totalPlanned * 0.8 ? "Nearing limit" : "On track"}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="relative w-full sm:w-40 lg:w-48">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-7 pr-2 rounded-lg bg-secondary/40 border border-transparent text-xs placeholder:text-muted-foreground focus:border-ring focus:outline-none" />
            </div>
            <Button variant="primary" size="pillSm" onClick={() => { setAddTab("budget"); setShowAdd(true); setForm((prev) => ({ ...prev, budget_type: "everyday" })); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
            <Button variant="outlinePill" size="pillSm" onClick={handleCopyPreviousMonth} title="Copy budgets from previous month">
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy Previous
            </Button>
            <Button variant="outlinePill" size="pillSm" onClick={handleSeedDefaults} disabled={seeding || loading}>
              <Download className={`h-3.5 w-3.5 mr-1 ${seeding ? "animate-pulse" : ""}`} /> {seeding ? "..." : "Defaults"}
            </Button>
            <Button variant="outlinePill" size="pillSm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card/80 p-3 sm:p-4 text-center">
          <p className="text-xs text-muted-foreground mb-0.5">Budgets</p>
          <p className="text-xl sm:text-2xl font-semibold">{summary.count}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/80 p-3 sm:p-4 text-center">
          <p className="text-xs text-muted-foreground mb-0.5">Budgeted</p>
          <p className="text-xl sm:text-2xl font-semibold tabular-nums">£{summary.totalPlanned.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/80 p-3 sm:p-4 text-center">
          <p className="text-xs text-muted-foreground mb-0.5">Spent</p>
          <p className={`text-xl sm:text-2xl font-semibold tabular-nums ${summary.overCount > 0 ? "text-ruby" : "text-emerald"}`}>£{summary.totalSpent.toLocaleString()}</p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[...Array(12)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted/40 animate-pulse" />)}
        </div>
      )}

      {/* Bulk actions toolbar */}
      {!loading && bulkSelected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald/5 border border-emerald/20">
          <span className="text-sm text-muted-foreground">{bulkSelected.size} selected</span>
          <button onClick={() => setBulkSelected(new Set())} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
          <div className="ml-auto flex gap-2">
            <Button variant="outlinePill" size="pillSm" onClick={() => {
              if (budgets.length === 0) return;
              const all = new Set(budgets.map((b) => b.budget_id));
              setBulkSelected(all.size === bulkSelected.size ? new Set() : all);
            }}>
              {bulkSelected.size === budgets.length ? "Deselect all" : "Select all"}
            </Button>
            <Button variant="primary" size="pillSm" className="bg-ruby hover:bg-ruby/90" onClick={async () => {
              if (!window.confirm(`Delete ${bulkSelected.size} budget(s)?`)) return;
              try {
                await api.post("/budgets/bulk-delete", { budget_ids: [...bulkSelected] });
                toast.success(`${bulkSelected.size} budget(s) deleted`);
                setBulkSelected(new Set());
                await fetchData();
              } catch { toast.error("Could not delete"); }
            }}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete {bulkSelected.size}
            </Button>
          </div>
        </div>
      )}

      {!loading && budgets.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-emerald/10 text-emerald">
            <Wallet className="h-7 w-7" />
          </div>
          <h3 className="text-xl font-medium">No budgets yet</h3>
          <p className="text-sm text-muted-foreground mt-1.5 mb-6 max-w-sm mx-auto">Create your first spending limit or planned event to start tracking.</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="primary" size="pill" onClick={() => { setAddTab("budget"); setShowAdd(true); }}>
              <Plus className="h-4 w-4 mr-1.5" /> Create budget
            </Button>
            <Button variant="outlinePill" size="pill" onClick={handleSeedDefaults} disabled={seeding}>
              <Download className={`h-4 w-4 mr-1.5 ${seeding ? "animate-pulse" : ""}`} /> {seeding ? "Loading..." : "Load defaults"}
            </Button>
          </div>
        </div>
      )}

      {!loading && budgets.length > 0 && (
        <>
          {/* Budget Sections */}
          <section>
            {Object.entries(sectionsForDisplay).length === 0 && searchQuery.trim() && (
              <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
                <p className="text-sm text-muted-foreground">No budgets match "{searchQuery}"</p>
              </div>
            )}
            {Object.entries(sectionsForDisplay).map(([section, items]) => (
              <div key={section} className="mb-6">
                <div className="flex items-center justify-between mb-3 bg-secondary/30 px-4 py-2 rounded-xl border border-border/50">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    {section}
                    <span className="text-[10px] font-normal text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">
                      {items.length} items · £{items.reduce((s, b) => s + Number(b.limit || 0), 0).toFixed(0)}
                    </span>
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                  {items.map((b) => renderBudgetCard(b))}
                  <button onClick={() => { setAddTab("budget"); setShowAdd(true); setForm((prev) => ({ ...prev, category: "", limit: "", budget_type: "everyday" })); }}
                    className="rounded-lg border-2 border-dashed border-border/50 hover:border-emerald/40 hover:bg-emerald/5 hover:text-emerald text-muted-foreground/60 transition-all flex flex-col items-center justify-center p-2.5 h-[88px] w-full">
                    <Plus className="h-4 w-4 mb-1" />
                    <span className="text-[10px] font-medium">Add {section}</span>
                  </button>
                </div>
              </div>
            ))}
          </section>

          {/* Upcoming Event Groups */}
          {upcomingEventGroups.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Upcoming Events
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setAddTab("budget"); setShowAdd(true); setForm((prev) => ({ ...prev, budget_type: "event", event_group_id: "", event_group_name: "" })); }}
                    className="h-6 w-6 rounded-full bg-topaz/10 text-topaz hover:bg-topaz/20 flex items-center justify-center transition-all" aria-label="Add event">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs text-muted-foreground">{upcomingEventGroups.length} events</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {upcomingEventGroups.map((g) => renderEventGroup(g))}
              </div>
            </section>
          )}

          {/* Past event groups */}
          {pastEventGroups.length > 0 && isCurrentMonth && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Past Events
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {pastEventGroups.map((g) => renderEventGroup(g))}
              </div>
            </section>
          )}

          {Object.keys(eventGroups).length > 0 && upcomingEventGroups.length === 0 && pastEventGroups.length === 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Planned Events
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {Object.values(eventGroups).filter((g) => !g.event_date).map((g) => renderEventGroup(g))}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {insights.map((ins) => {
                const hasBudget = ins.current_budget > 0;
                const needsChange = ins.suggested_budget !== ins.current_budget;
                return (
                  <div key={ins.category} className="rounded-xl border border-border bg-card/50 p-4">
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

      {/* Bottom sheet — mobile sheet, desktop centered dialog */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:flex lg:items-start lg:justify-center lg:pt-[10vh]" onClick={() => { setShowAdd(false); resetForm(); resetQuickForm(); if (addTab === "budget") setForm((prev) => ({ ...prev, event_group_id: "", event_group_name: "" })); }}>
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
                    onClick={() => setForm({ ...form, budget_type: "everyday", event_date: "", event_group_id: "", event_group_name: "" })}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${form.budget_type === "everyday" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
                    <ShoppingCart className="h-3.5 w-3.5 inline mr-1.5" /> Monthly
                  </button>
                  <button type="button"
                    onClick={() => { setForm({ ...form, budget_type: "event" }); setBudgetAdded(false); }}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${form.budget_type === "event" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
                    <Calendar className="h-3.5 w-3.5 inline mr-1.5" /> Event
                  </button>
                </div>

                {form.budget_type === "everyday" ? (
                  <>
                    {budgetAdded && (
                      <div className="flex items-center gap-2 p-2 mb-3 rounded-xl bg-emerald/10 border border-emerald/20">
                        <Check className="h-4 w-4 text-emerald" />
                        <span className="text-sm text-emerald font-medium">Budget added — enter another below</span>
                      </div>
                    )}
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <CategoryCombobox
                          value={form.category}
                          onChange={(val) => { setForm({ ...form, category: val }); setBudgetAdded(false); }}
                          categories={allCats}
                          placeholder="Category"
                          onCategoryCreated={fetchCategories}
                        />
                      </div>
                      <div className="w-28">
                        <Input type="number" step="0.01" min="0" placeholder="£0.00" value={form.limit}
                          onChange={(e) => { setForm({ ...form, limit: e.target.value }); setBudgetAdded(false); }} required className="text-right" />
                      </div>
                      <Button type="submit" variant="primary" size="pill" className="shrink-0 h-11 px-4">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {!form.event_group_id ? (
                      <>
                        <div className="flex items-end gap-3">
                          <div className="flex-[2]">
                            <Input placeholder="Event name (e.g. Pesach 2026)" value={form.event_group_name}
                              onChange={(e) => setForm({ ...form, event_group_name: e.target.value })} required />
                          </div>
                          <div className="w-auto">
                            <Input type="date" value={form.event_date}
                              onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                              className="text-sm" />
                          </div>
                        </div>
                        <div className="mt-3 p-3 rounded-xl bg-secondary/20 border border-border">
                          <p className="text-xs text-muted-foreground mb-2">First budget item</p>
                          <div className="flex items-end gap-3">
                            <div className="flex-1">
                              <CategoryCombobox
                                value={form.category}
                                onChange={(val) => setForm({ ...form, category: val })}
                                categories={allCats}
                                placeholder="Item category"
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
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 p-2 rounded-xl bg-secondary/20 border border-border mb-3">
                          <span className="text-xs text-muted-foreground">Adding to:</span>
                          <span className="text-sm font-medium">{form.event_group_name}</span>
                          <button type="button" onClick={() => { setForm({ category: "", limit: "", budget_type: "event", event_date: "", event_group_id: "", event_group_name: "" }); }}
                            className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                            New event
                          </button>
                        </div>
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <CategoryCombobox
                              value={form.category}
                              onChange={(val) => setForm({ ...form, category: val })}
                              categories={allCats}
                              placeholder="Item category"
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
                      </>
                    )}
                  </>
                )}

                <div className="flex justify-end gap-2 mt-2">
                  <button type="button" onClick={() => { setShowAdd(false); resetForm(); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                  {form.budget_type === "event" && form.event_group_id && (
                    <button type="button" onClick={() => { setShowAdd(false); resetForm(); }}
                      className="text-xs font-medium text-emerald hover:text-emerald/80 transition-colors">
                      Done — close
                    </button>
                  )}
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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { format, parseISO, isBefore, startOfMonth, endOfMonth } from "date-fns";
import {
  RefreshCw, Wallet, ShoppingCart, Calendar, Plus, Trash2, Pencil,
  Check, X, PiggyBank, Target, TrendingDown, PlusCircle,
} from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { PageHeader, SectionCard, MetricCard } from "../components/ui/layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import ConfirmModal from "../components/ui/ConfirmModal";

const TABS = [
  { value: "overview", label: "This Month", icon: Wallet },
  { value: "everyday", label: "Everyday Spending", icon: ShoppingCart },
  { value: "events", label: "Planned Events", icon: Calendar },
];

function groupBySection(cats, hierarchy) {
  const grouped = {};
  if (hierarchy && Object.keys(hierarchy).length > 0) {
    for (const [section, names] of Object.entries(hierarchy)) {
      const sectionCats = names.map(n => cats.find(c => c.name === n)).filter(Boolean);
      if (sectionCats.length > 0) {
        grouped[section] = sectionCats;
      }
    }
  }
  // Add uncategorised remaining
  const used = new Set(Object.values(grouped).flat().map(c => c.name));
  for (const c of cats) {
    if (!used.has(c.name)) {
      const section = c.section || "Other";
      if (!grouped[section]) grouped[section] = [];
      grouped[section].push(c);
    }
  }
  return grouped;
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = parseISO(dateStr);
  const now = new Date();
  return d >= startOfMonth(now) && d <= endOfMonth(now);
}

export default React.memo(function BudgetPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || "overview";
  const validTab = TABS.find((t) => t.value === tabFromUrl) ? tabFromUrl : "overview";
  const [activeTab, setActiveTab] = useState(validTab);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Categories loaded from API
  const [categories, setCategories] = useState([]);
  const [hierarchy, setHierarchy] = useState({});
  const [catsLoading, setCatsLoading] = useState(true);

  // Add form state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "", limit: "", budget_type: "everyday", event_date: "" });

  const setTab = useCallback((tab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/budgets");
      setBudgets(data.budgets || []);
    } catch {
      toast.error("Failed to load budgets");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCats = useCallback(async () => {
    setCatsLoading(true);
    try {
      const { data } = await api.get("/categories");
      setCategories(data.categories || []);
      setHierarchy(data.hierarchy || {});
    } catch {
      // Fallback: use a minimal built-in set if API fails
      setCategories([]);
      setHierarchy({});
    } finally {
      setCatsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { loadCats(); }, [loadCats]);

  // Build grouped categories for the datalist/optgroup
  const groupedCategories = useMemo(() => {
    return groupBySection(categories, hierarchy);
  }, [categories, hierarchy]);

  // Build a flat list of unique category names for datalist
  const allCategoryNames = useMemo(() => {
    const names = new Set();
    for (const cats of Object.values(groupedCategories)) {
      for (const c of cats) {
        names.add(c.name);
      }
    }
    return Array.from(names).sort();
  }, [groupedCategories]);

  // Budgets filtered by type
  const everyday = useMemo(() => budgets.filter((b) => (b.budget_type || "everyday") === "everyday"), [budgets]);
  const events = useMemo(() => budgets.filter((b) => b.budget_type === "event"), [budgets]);
  const thisMonthEvents = useMemo(() => events.filter((b) => isThisMonth(b.event_date)), [events]);
  const upcomingEvents = useMemo(() => events.filter((b) => b.event_date && !isThisMonth(b.event_date) && !isBefore(parseISO(b.event_date), new Date())), [events]);

  const summary = useMemo(() => {
    const totalPlanned = budgets.reduce((s, b) => s + (Number(b.limit) || 0), 0);
    const totalSpent = budgets.reduce((s, b) => s + (Number(b.spent) || 0), 0);
    const overCount = budgets.filter((b) => (b.progress_pct || 0) >= 100).length;
    const adherence = totalPlanned > 0 ? Math.max(0, 1 - totalSpent / totalPlanned) * 100 : 100;
    return { count: budgets.length, totalPlanned, totalSpent, overCount, adherence: Math.round(adherence * 10) / 10 };
  }, [budgets]);

  // CRUD
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
      setShowForm(false);
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

  // Render a single budget row
  const renderBudget = (b, showDate = false) => {
    const over = (b.progress_pct || 0) >= 100;
    const isEditing = editingId === b.budget_id;
    return (
      <div key={b.budget_id} className="rounded-xl border border-border bg-card/50 p-3 sm:p-4">
        {isEditing ? (
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <div className="flex-1 w-full">
              <Input list="edit-category-list" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full" />
              <datalist id="edit-category-list">
                {allCategoryNames.map(cat => <option key={cat} value={cat} />)}
              </datalist>
            </div>
            <Input type="number" step="0.01" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} className="w-full sm:w-28" />
            {showDate && <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className="w-full sm:w-36" />}
            <div className="flex gap-1 shrink-0">
              <button onClick={() => handleUpdate(b.budget_id)} className="h-8 w-8 rounded-lg bg-emerald text-white grid place-items-center"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={cancelEdit} className="h-8 w-8 rounded-lg border border-border grid place-items-center text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium capitalize truncate">{b.category}</span>
                {showDate && b.event_date && <span className="text-xs text-muted-foreground shrink-0">{format(parseISO(b.event_date), "d MMM")}</span>}
                {over && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ruby/10 text-ruby shrink-0">Over</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs tabular-nums text-muted-foreground">£{b.spent} / £{b.limit}</span>
                <button onClick={() => startEdit(b)} className="p-1 rounded hover:bg-secondary text-muted-foreground"><Pencil className="h-3 w-3" /></button>
                <button onClick={() => setConfirmDelete(b.budget_id)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-ruby"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted/50 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${over ? "bg-ruby" : "bg-emerald"}`} style={{ width: `${Math.min(100, b.progress_pct || 0)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>£{(b.spent || 0).toFixed(2)} spent</span>
              <span>£{Math.max(0, b.remaining || 0).toFixed(2)} remaining</span>
            </div>
          </div>
        )}
      </div>
    );
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

      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl -mx-4 sm:-mx-6 px-4 sm:px-6 pb-2">
          <TabsList className="w-full sm:w-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-1 sm:flex-initial gap-1.5">
                <t.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ═══ THIS MONTH ═══ */}
        <TabsContent value="overview" className="space-y-6 mt-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard label="Budgets" value={String(summary.count)} icon={Wallet} tone="emerald" detail="Active budgets" />
            <MetricCard label="Total Planned" value={`£${summary.totalPlanned.toLocaleString()}`} icon={Target} tone="topaz" detail="Monthly limit" />
            <MetricCard label="Spent" value={`£${summary.totalSpent.toLocaleString()}`} icon={TrendingDown} tone="ruby" detail={`${summary.overCount > 0 ? `${summary.overCount} over budget` : "On track"}`} />
            <MetricCard label="Adherence" value={`${summary.adherence}%`} icon={PiggyBank} tone={summary.adherence >= 80 ? "emerald" : summary.adherence >= 50 ? "topaz" : "ruby"} detail="Overall" />
          </div>

          <SectionCard title="Quick Actions" description="Common tasks">
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={() => { setTab("everyday"); setShowForm(true); }}>
                <ShoppingCart className="h-4 w-4 mr-1.5" /> Add everyday budget
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setTab("events"); setShowForm(true); }}>
                <Calendar className="h-4 w-4 mr-1.5" /> Add planned event
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/transactions")}>
                <Plus className="h-4 w-4 mr-1.5" /> Add transaction
              </Button>
            </div>
          </SectionCard>

          {everyday.length > 0 && (
            <SectionCard eyebrow="Overview" title="Everyday Budgets" description="Quick glance at your spending limits.">
              <div className="space-y-2">
                {everyday.slice(0, 5).map((b) => renderBudget(b))}
                {everyday.length > 5 && <p className="text-xs text-muted-foreground text-center pt-1">+{everyday.length - 5} more</p>}
              </div>
            </SectionCard>
          )}
        </TabsContent>

        {/* ═══ EVERYDAY SPENDING ═══ */}
        <TabsContent value="everyday" className="space-y-6 mt-0">
          <SectionCard
            eyebrow="Everyday"
            title="Spending Limits"
            description="Budgets for regular monthly spending categories."
            actions={
              <Button variant="chip" size="sm" onClick={() => setShowForm(!showForm)}>
                <PlusCircle className="h-3.5 w-3.5 mr-1" /> {showForm ? "Close" : "Add"}
              </Button>
            }
          >
            {showForm && (
              <form onSubmit={handleCreate} className="mb-4 flex flex-col sm:flex-row gap-2 p-3 rounded-xl border border-emerald/20 bg-emerald/5">
                <input type="hidden" name="budget_type" value="everyday" />
                <div className="flex-1">
                  <Input
                    list="cats-everyday"
                    placeholder="Category (start typing to see suggestions)"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value, budget_type: "everyday" })}
                    required
                  />
                  <datalist id="cats-everyday">
                    {allCategoryNames.map((c) => <option key={c} value={c} />)}
                  </datalist>
                  {/* Grouped suggestions shown below on desktop */}
                  {!catsLoading && Object.keys(groupedCategories).length > 0 && (
                    <div className="mt-2 hidden sm:block">
                      <p className="text-[11px] text-muted-foreground mb-1">Available categories by section:</p>
                      <div className="max-h-40 overflow-y-auto space-y-1 text-xs text-muted-foreground border border-border rounded-lg p-2">
                        {Object.entries(groupedCategories).map(([section, cats]) => (
                          <div key={section}>
                            <span className="font-medium text-[10px] uppercase tracking-wider">{section}</span>
                            <div className="flex flex-wrap gap-1 mt-0.5 mb-1">
                              {cats.map(c => (
                                <button
                                  key={c.name}
                                  type="button"
                                  onClick={() => setForm({ ...form, category: c.name, budget_type: "everyday" })}
                                  className="px-1.5 py-0.5 rounded bg-secondary/50 hover:bg-secondary text-[11px] transition-colors"
                                >
                                  {c.name.replace(/_/g, " ")}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <Input type="number" step="0.01" min="0" placeholder="Monthly limit £" value={form.limit}
                  onChange={(e) => setForm({ ...form, limit: e.target.value })} required className="w-full sm:w-36" />
                <Button type="submit" variant="primary" size="pill"><Plus className="h-4 w-4" /> Add</Button>
              </form>
            )}

            {loading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />)}</div>
            ) : everyday.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No everyday budgets yet.</p>
                <p className="text-xs mt-1">Click "Add" above to create your first spending limit using any category from your transactions.</p>
              </div>
            ) : (
              <div className="space-y-2">{everyday.map((b) => renderBudget(b))}</div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ═══ PLANNED EVENTS ═══ */}
        <TabsContent value="events" className="space-y-6 mt-0">
          <SectionCard
            eyebrow="Events"
            title="Planned Events & Occasions"
            description="One-time budgets for holidays, simchas, and other events."
            actions={
              <Button variant="chip" size="sm" onClick={() => setShowForm(!showForm)}>
                <PlusCircle className="h-3.5 w-3.5 mr-1" /> {showForm ? "Close" : "Add event"}
              </Button>
            }
          >
            {showForm && (
              <form onSubmit={handleCreate} className="mb-4 flex flex-col sm:flex-row gap-2 p-3 rounded-xl border border-topaz/20 bg-topaz/5">
                <input type="hidden" name="budget_type" value="event" />
                <div className="flex-1">
                  <Input
                    list="cats-events"
                    placeholder="Event name or category"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value, budget_type: "event" })}
                    required
                  />
                  <datalist id="cats-events">
                    {allCategoryNames.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <Input type="number" step="0.01" min="0" placeholder="Budget £" value={form.limit}
                  onChange={(e) => setForm({ ...form, limit: e.target.value })} required className="w-full sm:w-32" />
                <Input type="date" value={form.event_date}
                  onChange={(e) => setForm({ ...form, event_date: e.target.value })} className="w-full sm:w-36" />
                <Button type="submit" variant="primary" size="pill"><Plus className="h-4 w-4" /> Add</Button>
              </form>
            )}

            {loading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />)}</div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No planned events yet.</p>
                <p className="text-xs mt-1">Add a holiday, simcha, or other one-time expense above.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {thisMonthEvents.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" /> This Month
                    </h3>
                    <div className="space-y-2">{thisMonthEvents.map((b) => renderBudget(b, true))}</div>
                  </div>
                )}
                {upcomingEvents.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" /> Upcoming
                    </h3>
                    <div className="space-y-2">{upcomingEvents.sort((a, b) => (a.event_date || "").localeCompare(b.event_date || "")).map((b) => renderBudget(b, true))}</div>
                  </div>
                )}
                {thisMonthEvents.length === 0 && upcomingEvents.length === 0 && events.length > 0 && (
                  <div className="space-y-2">{events.map((b) => renderBudget(b, true))}</div>
                )}
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  RefreshCw, Wallet, ShoppingCart, Calendar, Plus, Trash2, Pencil,
  Check, MoreHorizontal, PiggyBank, PlusCircle,
} from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { PageHeader, SectionCard, EmptyState, MetricCard } from "../components/ui/layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "../components/ui/dropdown-menu";
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from "../components/ui/collapsible";
import ConfirmModal from "../components/ui/ConfirmModal";
import BudgetSummaryCards from "../components/BudgetSummaryCards";
import BudgetAlertBar from "../components/BudgetAlertBar";
import EverydaySpending from "../components/EverydaySpending";
import PlannedEvents from "../components/PlannedEvents";
import { useSwipe } from "../hooks/useSwipe";

const TABS = [
  { value: "overview", label: "This Month", icon: Wallet },
  { value: "spending", label: "Everyday Spending", icon: ShoppingCart },
  { value: "events", label: "Planned Events", icon: Calendar },
];

const CATEGORY_OPTIONS = [
  "groceries", "dining", "transport", "rent", "utilities",
  "subscriptions", "tzedakah", "health", "entertainment",
  "shopping", "insurance", "education", "gifts", "charity",
];

export default React.memo(function BudgetPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || "overview";
  const validTab = TABS.find((t) => t.value === tabFromUrl) ? tabFromUrl : "overview";
  const [activeTab, setActiveTab] = useState(validTab);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const contentRef = useRef(null);

  // Budget CRUD state
  const [budgets, setBudgets] = useState([]);
  const [budgetsLoading, setBudgetsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "", limit: "" });
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const setTab = useCallback((tab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);

  // Fetch this-month summary
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const month = format(now, "yyyy-MM");
      const res = await api.get(`/budget-system/this-month?month=${month}`);
      setData(res.data);
      setAlerts(res.data.alerts || []);
    } catch (err) {
      toast.error("Failed to load budget data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch budgets (simple category+limit model)
  const fetchBudgets = useCallback(async () => {
    setBudgetsLoading(true);
    try {
      const { data } = await api.get("/budgets");
      setBudgets(data.budgets || []);
    } catch {
      // silent
    } finally {
      setBudgetsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); fetchBudgets(); }, [fetchData, fetchBudgets]);

  // Budget CRUD handlers
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.category.trim() || !form.limit) {
      toast.error("Enter a category and limit");
      return;
    }
    try {
      await api.post("/budgets", {
        category: form.category.toLowerCase().trim(),
        limit: parseFloat(form.limit),
      });
      toast.success("Budget created");
      setForm({ category: "", limit: "" });
      setShowForm(false);
      await fetchBudgets();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not create budget");
    }
  };

  const startEdit = (budget) => {
    setEditingId(budget.budget_id);
    setForm({ category: budget.category, limit: String(budget.amount) });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ category: "", limit: "" });
  };

  const handleUpdate = async (id) => {
    if (!form.category.trim() || !form.limit) {
      toast.error("Enter a category and limit");
      return;
    }
    try {
      await api.patch(`/budgets/${id}`, {
        category: form.category.toLowerCase().trim(),
        limit: parseFloat(form.limit),
      });
      toast.success("Budget updated");
      cancelEdit();
      await fetchBudgets();
    } catch {
      toast.error("Could not update budget");
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/budgets/${id}`);
      toast.success("Budget removed");
      setConfirmDelete(null);
      await fetchBudgets();
    } catch {
      toast.error("Could not delete budget");
    }
  };

  const budgetSummary = useMemo(() => ({
    totalLimit: budgets.reduce((s, b) => s + (Number(b.amount) || 0), 0),
    totalSpent: budgets.reduce((s, b) => s + (Number(b.spent) || 0), 0),
    overCount: budgets.filter((b) => (b.progress_pct || 0) >= 100).length,
  }), [budgets]);

  // Swipe for mobile tab navigation
  const swipeHandlers = useSwipe(
    () => { const idx = TABS.findIndex((t) => t.value === activeTab); if (idx < TABS.length - 1) setTab(TABS[idx + 1].value); },
    () => { const idx = TABS.findIndex((t) => t.value === activeTab); if (idx > 0) setTab(TABS[idx - 1].value); },
    50,
  );

  const dismissAlert = useCallback((idx) => {
    setAlerts((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Budgets"
        description="Track spending, plan ahead, and stay in control."
        actions={
          <Button variant="outline" size="sm" onClick={() => { fetchData(); fetchBudgets(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
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

        <div ref={contentRef} {...swipeHandlers} className="min-h-[300px]">

          {/* ═══ THIS MONTH ═══ */}
          <TabsContent value="overview" className="space-y-6 mt-0">
            <BudgetSummaryCards data={data} loading={loading} />
            <BudgetAlertBar alerts={alerts} onDismiss={dismissAlert} />

            {/* Budget management section */}
            <SectionCard title="My Budgets" description="Set spending limits per category.">
              {/* Budget summary */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-xl bg-card border border-border p-3">
                  <p className="label-overline">Categories</p>
                  <p className="text-lg font-semibold mt-1">{budgets.length}</p>
                </div>
                <div className="rounded-xl bg-card border border-border p-3">
                  <p className="label-overline">Total limit</p>
                  <p className="text-lg font-semibold mt-1">£{budgetSummary.totalLimit.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-card border border-border p-3">
                  <p className="label-overline">Over budget</p>
                  <p className={`text-lg font-semibold mt-1 ${budgetSummary.overCount > 0 ? "text-ruby" : ""}`}>{budgetSummary.overCount}</p>
                </div>
              </div>

              {/* Create budget form */}
              <Collapsible open={showForm} onOpenChange={setShowForm} className="border border-border rounded-xl mb-3">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-3 text-left">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <PlusCircle className="h-4 w-4 text-emerald" />
                      Add a budget
                    </span>
                    <span className="text-xs text-muted-foreground">{showForm ? "Hide" : "Show"}</span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 border-t border-border pt-3">
                    <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2">
                      <div className="flex-1">
                        <Input list="budget-cats" placeholder="Category (e.g. groceries)" value={form.category}
                          onChange={(e) => setForm({ ...form, category: e.target.value })} required />
                        <datalist id="budget-cats">
                          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c} />)}
                        </datalist>
                      </div>
                      <div className="w-full sm:w-32">
                        <Input type="number" step="0.01" min="0" placeholder="Limit £" value={form.limit}
                          onChange={(e) => setForm({ ...form, limit: e.target.value })} required />
                      </div>
                      <Button type="submit" variant="primary" size="pill">
                        <Plus className="h-4 w-4" /> Add
                      </Button>
                    </form>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Budget list */}
              {budgetsLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />)}</div>
              ) : budgets.length === 0 ? (
                <EmptyState icon={PiggyBank} title="No budgets" description="Add a budget above to start tracking." className="py-6" />
              ) : (
                <div className="space-y-2">
                  {budgets.map((b) => {
                    const over = (b.progress_pct || 0) >= 100;
                    const isEditing = editingId === b.budget_id;
                    return (
                      <div key={b.budget_id} className="rounded-xl border border-border bg-card/50 p-3">
                        {isEditing ? (
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="flex-1" />
                            <Input type="number" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} className="w-full sm:w-24" />
                            <div className="flex gap-1">
                              <button onClick={() => handleUpdate(b.budget_id)} className="px-3 py-1.5 rounded-lg bg-emerald text-white text-xs font-medium"><Check className="h-3 w-3" /></button>
                              <button onClick={cancelEdit} className="px-3 py-1.5 rounded-lg border border-border text-xs">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium capitalize truncate">{b.category}</span>
                                {over && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ruby/10 text-ruby">Over</span>}
                              </div>
                              <div className="mt-1.5">
                                <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${over ? "bg-ruby" : "bg-emerald"}`}
                                    style={{ width: `${Math.min(100, b.progress_pct || 0)}%` }} />
                                </div>
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                <span>£{(b.spent || 0).toFixed(0)} spent</span>
                                <span>£{(b.remaining || 0).toFixed(0)} left of £{b.amount}</span>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger className="p-1.5 ml-2 rounded-lg hover:bg-secondary text-muted-foreground">
                                <MoreHorizontal className="h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => startEdit(b)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setConfirmDelete(b.budget_id)} className="text-ruby"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* Quick actions */}
            {!loading && data && (
              <SectionCard title="Quick Actions" description="Common tasks">
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" size="sm" onClick={() => setTab("spending")}>
                    <ShoppingCart className="h-4 w-4 mr-1.5" /> View spending
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setTab("events")}>
                    <Calendar className="h-4 w-4 mr-1.5" /> View events
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("/transactions")}>
                    <Plus className="h-4 w-4 mr-1.5" /> Add transaction
                  </Button>
                </div>
              </SectionCard>
            )}
          </TabsContent>

          {/* ═══ EVERYDAY SPENDING ═══ */}
          <TabsContent value="spending" className="space-y-6 mt-0">
            <SectionCard eyebrow="Everyday" title="Spending Categories" description="Day-to-day budget categories and progress.">
              <EverydaySpending data={data?.everyday_spending} loading={loading} />
            </SectionCard>
          </TabsContent>

          {/* ═══ PLANNED EVENTS ═══ */}
          <TabsContent value="events" className="space-y-6 mt-0">
            <SectionCard eyebrow="Planned" title="Events & Occasions" description="Holidays, simchas, and other planned expenses.">
              <PlannedEvents data={data?.events} loading={loading} />
            </SectionCard>
          </TabsContent>

        </div>
      </Tabs>

      {confirmDelete && (
        <ConfirmModal
          title="Remove budget?"
          message="This will permanently delete this budget."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
});

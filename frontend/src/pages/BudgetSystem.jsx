import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  Plus, Trash2, Pencil, X, Check, Loader2, PiggyBank, Calendar, Heart, Star, Plane,
  Package, Wand2, Sparkles, TrendingUp, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState, MetricCard, PageHeader, SectionCard } from "../components/ui/layout";
import { SkeletonCard } from "../components/ui/Skeleton";
import ConfirmModal from "../components/ui/ConfirmModal";

const DAY_TO_DAY_CATS = ["groceries","household","fuel","school","utilities","transport","dining","health","entertainment","clothing","personal","other"];

const CATS = ["groceries","dining","transport","utilities","subscriptions","tzedakah","rent","salary","income","shopping","health","entertainment","insurance","education","transfer","cash","tax","fees","mortgage","uncategorized"];

export default function BudgetSystem() {
  const [activeTab, setActiveTab] = useState("this-month");
  const [loading, setLoading] = useState(true);

  // Confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmCb = useRef(null);
  const showConfirm = (cb) => { confirmCb.current = cb; setConfirmOpen(true); };

  // ── This Month / Overview ──────────────────────────────────────────────
  const [overview, setOverview] = useState(null);
  const [dayOccasions, setDayOccasions] = useState([]);
  const [dayForm, setDayForm] = useState({ category: "", budgeted_amount: "" });
  const [predictions, setPredictions] = useState([]);
  const [predicting, setPredicting] = useState(false);

  // ── Quick transaction ──────────────────────────────────────────────────
  const [quickDesc, setQuickDesc] = useState("");
  const [quickAmount, setQuickAmount] = useState("");
  const [classification, setClassification] = useState(null);
  const [classifying, setClassifying] = useState(false);

  // ── Yom Tov / Holiday / Simcha (carried over from old Budgets) ─────────
  const [jewishHolidays, setJewishHolidays] = useState([]);
  const [holidayBudgets, setHolidayBudgets] = useState([]);
  const [selectedHoliday, setSelectedHoliday] = useState(null);
  const [holidayForm, setHolidayForm] = useState({ category: "", budgeted_amount: "" });
  const [editingBudget, setEditingBudget] = useState(null);
  const [budgetSummary, setBudgetSummary] = useState(null);
  const [newSecularHoliday, setNewSecularHoliday] = useState("");
  const [chasunaItems, setChasunaItems] = useState([]);
  const [chasunaSum, setChasunaSum] = useState(null);
  const [chasunaForm, setChasunaForm] = useState({ category: "", description: "", estimated_cost: "", vendor: "", due_date: "" });
  const [editingChasuna, setEditingChasuna] = useState(null);
  const [showChasunaForm, setShowChasunaForm] = useState(false);
  const [chasunaCategories, setChasunaCategories] = useState([]);

  // ── Other budget ───────────────────────────────────────────────────────
  const [otherOccasions, setOtherOccasions] = useState([]);
  const [otherForm, setOtherForm] = useState({ name: "", estimated_amount: "", event_date: "", notes: "" });
  const [editingOther, setEditingOther] = useState(null);

  // ── LOADERS ────────────────────────────────────────────────────────────

  const loadOverview = useCallback(async () => {
    try {
      const { data } = await api.get("/budget-system/overview");
      setOverview(data);
    } catch { /* overview is secondary */ }
    finally { setLoading(false); }
  }, []);

  const loadDayToDay = useCallback(async () => {
    try {
      const { data } = await api.get("/budget-system/day-to-day");
      setDayOccasions(data.occasions || []);
    } catch { toast.error("Could not load day-to-day budgets"); }
  }, []);

  const loadHolidays = useCallback(async () => {
    try {
      const { data } = await api.get("/jewish/holidays/defaults");
      setJewishHolidays(data.holidays || []);
    } catch { /* optional */ }
  }, []);

  const loadHolidayBudgets = useCallback(async () => {
    try {
      const { data } = await api.get("/jewish/holiday-budgets");
      setHolidayBudgets(data.budgets || []);
    } catch { /* optional */ }
  }, []);

  const loadChasuna = useCallback(async () => {
    try {
      const [items, sum, cats] = await Promise.all([
        api.get("/jewish/chasuna"),
        api.get("/jewish/chasuna/summary"),
        api.get("/jewish/chasuna/categories"),
      ]);
      setChasunaItems(items.data.items || []);
      setChasunaSum(items.data);
      setChasunaCategories(cats.data.categories || []);
    } catch { /* optional */ }
  }, []);

  const loadOther = useCallback(async () => {
    // Phase 1: no dedicated "other" endpoint yet — stub
    setOtherOccasions([]);
  }, []);

  useEffect(() => {
    loadOverview();
    loadDayToDay();
    loadHolidays();
    loadHolidayBudgets();
    loadChasuna();
    loadOther();
  }, [loadOverview, loadDayToDay, loadHolidays, loadHolidayBudgets, loadChasuna, loadOther]);

  // ── QUICK TRANSACTION ──────────────────────────────────────────────────

  const handleClassify = async () => {
    if (!quickDesc.trim() || !quickAmount) return;
    setClassifying(true);
    try {
      const { data } = await api.post("/budget-system/classify", {
        description: quickDesc.trim(),
        amount: parseFloat(quickAmount),
      });
      setClassification(data);
    } catch { toast.error("Classification failed"); }
    finally { setClassifying(false); }
  };

  const handleApprove = async () => {
    if (!classification) return;
    try {
      await api.post("/budget-system/approve", {
        suggestion_id: classification.suggestion_id,
        description: quickDesc.trim(),
        amount: parseFloat(quickAmount),
        budget_type: classification.budget_type,
        occasion: classification.occasion,
        category: classification.category,
      });
      toast.success("Transaction added!");
      setQuickDesc("");
      setQuickAmount("");
      setClassification(null);
      loadOverview();
    } catch { toast.error("Could not add transaction"); }
  };

  const cancelClassification = () => {
    setQuickDesc("");
    setQuickAmount("");
    setClassification(null);
  };

  // ── DAY-TO-DAY ─────────────────────────────────────────────────────────

  const createDayToDay = async (e) => {
    e.preventDefault();
    try {
      await api.post("/budget-system/day-to-day", {
        category: dayForm.category.toLowerCase().trim(),
        budgeted_amount: parseFloat(dayForm.budgeted_amount) || 0,
      });
      toast.success("Budget added");
      setDayForm({ category: "", budgeted_amount: "" });
      loadDayToDay();
      loadOverview();
    } catch { toast.error("Could not add"); }
  };

  const deleteDayToDay = async (id, name) => {
    showConfirm(async () => {
      try {
        await api.delete(`/budget-system/day-to-day/${id}`);
        toast("Budget removed", {
          action: { label: "Undo", onClick: async () => {
            await api.post("/budget-system/day-to-day", { category: name, budgeted_amount: 0 });
            toast.success("Restored");
            loadDayToDay(); loadOverview();
          }},
          duration: 6000,
        });
        loadDayToDay();
        loadOverview();
      } catch { toast.error("Could not delete"); }
    });
  };

  const handlePredict = async () => {
    setPredicting(true);
    try {
      const { data } = await api.get("/budget-system/day-to-day/prediction");
      setPredictions(data.predictions || []);
      if (data.message) toast.info(data.message);
    } catch { toast.error("Prediction failed"); }
    finally { setPredicting(false); }
  };

  // ── YOM TOV / HOLIDAY (carried over) ───────────────────────────────────

  const initHolidayBudget = async (name) => {
    try {
      const { data } = await api.post(`/jewish/holiday-budgets/init/${encodeURIComponent(name)}`);
      toast.success(`Initialised ${name} budget with ${data.count} categories`);
      await loadHolidayBudgets();
    } catch (err) { toast.error(err.response?.data?.detail || "Could not init budget"); }
  };

  const saveBudgetCategory = async () => {
    if (!selectedHoliday || !holidayForm.category) return;
    try {
      await api.post("/jewish/holiday-budgets", {
        holiday_name: selectedHoliday,
        category: holidayForm.category,
        budgeted_amount: parseFloat(holidayForm.budgeted_amount) || 0,
      });
      toast.success("Category added");
      setHolidayForm({ category: "", budgeted_amount: "" });
      await loadHolidayBudgets();
    } catch (err) { toast.error(err.response?.data?.detail || "Could not add category"); }
  };

  const updateBudgetCategory = async (id, updates) => {
    try {
      await api.put(`/jewish/holiday-budgets/${id}`, updates);
      setEditingBudget(null);
      await loadHolidayBudgets();
      if (selectedHoliday) loadBudgetSummary(selectedHoliday);
    } catch { toast.error("Could not update"); }
  };

  const deleteBudgetCategory = async (id) => {
    showConfirm(async () => {
      try {
        await api.delete(`/jewish/holiday-budgets/${id}`);
        await loadHolidayBudgets();
        if (selectedHoliday) loadBudgetSummary(selectedHoliday);
      } catch { toast.error("Could not delete"); }
    });
  };

  const loadBudgetSummary = async (name) => {
    try {
      const { data } = await api.get(`/jewish/holiday-budgets/summary/${encodeURIComponent(name)}`);
      setBudgetSummary(data);
    } catch { setBudgetSummary(null); }
  };

  const viewHoliday = async (name) => {
    setSelectedHoliday(selectedHoliday === name ? null : name);
    if (selectedHoliday !== name) await loadBudgetSummary(name);
  };

  const jewishHolidayNames = useMemo(() => jewishHolidays.map(h => h.holiday), [jewishHolidays]);

  const secularHolidaysList = useMemo(() => {
    const names = new Set(holidayBudgets.map(b => b.holiday_name));
    jewishHolidayNames.forEach(name => names.delete(name));
    return Array.from(names);
  }, [holidayBudgets, jewishHolidayNames]);

  const addSecularHoliday = () => {
    if (!newSecularHoliday.trim()) return;
    viewHoliday(newSecularHoliday.trim());
    setNewSecularHoliday("");
  };

  // ── SIMCHA (carried over) ──────────────────────────────────────────────

  const saveChasuna = async (e) => {
    e.preventDefault();
    try {
      if (editingChasuna) {
        await api.put(`/jewish/chasuna/${editingChasuna}`, chasunaForm);
        setEditingChasuna(null);
      } else {
        await api.post("/jewish/chasuna", chasunaForm);
      }
      setChasunaForm({ category: "", description: "", estimated_cost: "", vendor: "", due_date: "" });
      setShowChasunaForm(false);
      await loadChasuna();
      toast.success(editingChasuna ? "Updated" : "Added");
    } catch (err) { toast.error(err.response?.data?.detail || "Could not save"); }
  };

  const editChasuna = (item) => {
    setEditingChasuna(item.id);
    setChasunaForm({
      category: item.category, description: item.description || "",
      estimated_cost: String(item.estimated_cost || ""),
      vendor: item.vendor || "",
      due_date: item.due_date ? item.due_date.slice(0, 10) : "",
    });
    setShowChasunaForm(true);
  };

  const deleteChasuna = async (id) => {
    showConfirm(async () => {
      try {
        await api.delete(`/jewish/chasuna/${id}`);
        await loadChasuna();
        toast.success("Deleted");
      } catch { toast.error("Could not delete"); }
    });
  };

  // ── OTHER BUDGET ───────────────────────────────────────────────────────

  const createOther = async (e) => {
    e.preventDefault();
    try {
      await api.post("/budget-system/day-to-day", {
        category: otherForm.name.toLowerCase().replace(/\s+/g, "_"),
        budgeted_amount: parseFloat(otherForm.estimated_amount) || 0,
      });
      toast.success("Budget added");
      setOtherForm({ name: "", estimated_amount: "", event_date: "", notes: "" });
      loadOther();
      loadOverview();
    } catch { toast.error("Could not add"); }
  };

  const deleteOther = async (id) => {
    showConfirm(async () => {
      try {
        await api.delete(`/budget-system/day-to-day/${id}`);
        toast.success("Removed");
        loadOther();
        loadOverview();
      } catch { toast.error("Could not delete"); }
    });
  };

  // ── HOLIDAY DETAIL RENDERER (carried over) ─────────────────────────────

  const renderHolidayDetail = () => {
    if (!selectedHoliday) return null;
    const isJewish = jewishHolidayNames.includes(selectedHoliday);
    return (
      <div className="rounded-2xl border-2 border-topaz/30 bg-card p-6 mt-6 animate-[fadeUp_0.3s_ease-out]">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <p className="label-overline">{selectedHoliday} budget</p>
          {isJewish && (
            <button onClick={() => initHolidayBudget(selectedHoliday)} className="text-xs px-3 py-1.5 rounded-full bg-topaz text-white hover:opacity-90">
              Init from defaults
            </button>
          )}
        </div>
        {budgetSummary && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Budgeted" value={`£${budgetSummary.total_budgeted.toFixed(2)}`} accent="topaz" />
            <Stat label="Actual" value={`£${budgetSummary.total_actual.toFixed(2)}`} accent="emerald" />
            <Stat label="Remaining" value={`£${budgetSummary.remaining.toFixed(2)}`} accent={budgetSummary.remaining > 0 ? "emerald" : "ruby"} />
          </div>
        )}
        <div className="flex gap-2 mb-4">
          <input placeholder="Category name" value={holidayForm.category}
                 onChange={e => setHolidayForm({...holidayForm, category: e.target.value})}
                 className="h-10 flex-1 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
          <input placeholder="Budget £" type="number" value={holidayForm.budgeted_amount}
                 onChange={e => setHolidayForm({...holidayForm, budgeted_amount: e.target.value})}
                 className="h-10 w-28 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
          <button onClick={saveBudgetCategory} className="btn-pill gradient-topaz text-white text-sm">
            <Plus className="h-4 w-4 mr-1" /> Add
          </button>
        </div>
        {holidayBudgets.filter(b => b.holiday_name === selectedHoliday).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No categories added yet.</p>
        ) : (
          holidayBudgets.filter(b => b.holiday_name === selectedHoliday).map(b => (
            <div key={b.holiday_name + b.hebrew_year}>
              {b.categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  {editingBudget === cat.id ? (
                    <div className="flex gap-2 w-full">
                      <input type="number" defaultValue={cat.budgeted_amount} id={`budget-${cat.id}`}
                             className="h-9 w-28 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
                      <input type="number" defaultValue={cat.actual_amount} id={`actual-${cat.id}`}
                             className="h-9 w-28 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
                      <button onClick={() => updateBudgetCategory(cat.id, {
                        budgeted_amount: parseFloat(document.getElementById(`budget-${cat.id}`).value) || 0,
                        actual_amount: parseFloat(document.getElementById(`actual-${cat.id}`).value) || 0,
                      })} className="text-xs px-3 py-1.5 rounded-full bg-emerald text-white">Save</button>
                      <button onClick={() => setEditingBudget(null)} className="text-xs px-3 py-1.5 rounded-full border border-border">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{cat.category}</p>
                        <p className="text-xs text-muted-foreground">Budget: £{cat.budgeted_amount.toFixed(2)} · Actual: £{cat.actual_amount.toFixed(2)}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEditingBudget(cat.id)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteBudgetCategory(cat.id)} className="p-2 rounded-lg hover:bg-secondary text-ruby"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    );
  };

  // ── TABS ───────────────────────────────────────────────────────────────

  const tabs = [
    { key: "this-month", label: "This Month", icon: Sparkles },
    { key: "day-to-day", label: "Day-to-Day", icon: PiggyBank },
    { key: "yomtov", label: "Yom Tov", icon: Star },
    { key: "holiday", label: "Holiday", icon: Plane },
    { key: "simcha", label: "Simcha", icon: Heart },
    { key: "other", label: "Other", icon: Package },
  ];

  // ── RENDER ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" data-testid="budget-system-root">
      <PageHeader
        eyebrow="Money"
        title="Budgets & Planning"
        description="Master dashboard, day-to-day budgets, Yom Tov, holidays, Simchas, and other expenses."
      />

      {/* Quick transaction bar */}
      <div className="rounded-2xl border border-border bg-card/80 p-4 flex flex-wrap items-center gap-3">
        <Sparkles className="h-5 w-5 text-topaz shrink-0" />
        <input placeholder="Description (e.g. Tesco £84)" value={quickDesc}
               onChange={e => setQuickDesc(e.target.value)}
               onKeyDown={e => e.key === "Enter" && handleClassify()}
               className="h-10 flex-1 min-w-[200px] px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none text-sm" />
        <input placeholder="Amount" type="number" value={quickAmount}
               onChange={e => setQuickAmount(e.target.value)}
               className="h-10 w-28 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none text-sm" />
        <button onClick={handleClassify} disabled={classifying || !quickDesc.trim() || !quickAmount}
                className="btn-pill gradient-emerald text-white text-sm disabled:opacity-50">
          {classifying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wand2 className="h-4 w-4 mr-1" />}
          Classify
        </button>
      </div>

      {/* AI Classification result */}
      {classification && (
        <div className="rounded-2xl border-2 border-emerald/30 bg-card p-5 animate-[fadeUp_0.3s_ease-out]">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-emerald" />
            <p className="label-overline">AI Classification</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald/10 text-emerald ml-auto">
              {Math.round(classification.confidence * 100)}% confident
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Budget Type</p>
              <p className="font-medium capitalize">{classification.budget_type.replace(/_/g, " ")}</p>
            </div>
            <div className="rounded-xl bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Occasion</p>
              <p className="font-medium">{classification.occasion}</p>
            </div>
            <div className="rounded-xl bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Category</p>
              <p className="font-medium capitalize">{classification.category}</p>
            </div>
            <div className="rounded-xl bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Merchant</p>
              <p className="font-medium">{classification.merchant || "—"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleApprove} className="btn-pill gradient-emerald text-white text-sm">
              <Check className="h-4 w-4 mr-1" /> Approve & Add
            </button>
            <button onClick={cancelClassification} className="text-sm px-4 py-2 rounded-full border border-border">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap border-b border-border pb-2">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedHoliday(null); }}
            className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-t-lg transition-colors capitalize ${
              activeTab === tab.key ? "bg-card border-b-2 border-emerald font-medium" : "text-muted-foreground hover:text-foreground"
            }`}>
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: THIS MONTH (Master Dashboard) ──────────────────────────── */}
      {activeTab === "this-month" && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease-out]">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[1,2,3,4,5].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : overview ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <MetricCard label="Budgeted" value={`£${overview.summary.total_budgeted.toLocaleString()}`} icon={PiggyBank} tone="emerald" />
                <MetricCard label="Predicted" value={`£${overview.summary.total_forecast.toLocaleString()}`} icon={TrendingUp} tone="topaz" />
                <MetricCard label="Actual Spend" value={`£${overview.summary.total_actual_spend.toLocaleString()}`} icon={TrendingUp} tone="ruby" />
                <MetricCard label="Remaining" value={`£${overview.summary.remaining_budget.toLocaleString()}`} icon={PiggyBank} tone={overview.summary.remaining_budget > 0 ? "emerald" : "ruby"} />
                <MetricCard label="Projected Balance" value={`£${overview.summary.projected_month_end.toLocaleString()}`} icon={Sparkles} tone={overview.summary.projected_month_end > 0 ? "emerald" : "ruby"} />
              </div>

              {/* AI Forecast placeholder */}
              <SectionCard eyebrow="Smart Forecast" title="AI predictions & warnings" contentClassName="pt-0">
                <div className="p-6 text-center">
                  <Sparkles className="h-8 w-8 text-topaz mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">AI forecast will appear here once there's enough transaction data.</p>
                </div>
              </SectionCard>

              {/* Day-to-day breakdown */}
              {overview.day_to_day?.categories?.length > 0 && (
                <SectionCard eyebrow="Day-to-Day" title="Budget vs Actual" contentClassName="p-0">
                  <div className="divide-y divide-border">
                    {overview.day_to_day.categories.map(cat => {
                      const diff = cat.difference;
                      return (
                        <div key={cat.id || cat.name} className="flex items-center justify-between px-6 py-4">
                          <div>
                            <p className="text-sm font-medium capitalize">{cat.name}</p>
                            <p className="text-xs text-muted-foreground">{cat.occasion}</p>
                          </div>
                          <div className="flex items-center gap-4 text-sm tabular-nums">
                            <span>£{cat.budgeted.toFixed(0)}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className={cat.actual > cat.budgeted ? "text-ruby" : "text-emerald"}>£{cat.actual.toFixed(0)}</span>
                            <span className="text-xs text-muted-foreground">/ £{cat.forecast.toFixed(0)}</span>
                            <span className={`text-xs font-medium ${diff >= 0 ? "text-emerald" : "text-ruby"}`}>
                              {diff >= 0 ? "+" : ""}£{diff.toFixed(0)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}
            </>
          ) : (
            <EmptyState icon={Sparkles} title="No budget data" description="Add day-to-day budgets to see your overview." />
          )}
        </div>
      )}

      {/* ── TAB: DAY-TO-DAY ─────────────────────────────────────────────── */}
      {activeTab === "day-to-day" && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease-out]">
          <SectionCard eyebrow="Create" title="Day-to-day budget category">
            <form onSubmit={createDayToDay} className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[160px]">
                <label className="label-overline">Category</label>
                <input list="dd-cats" required value={dayForm.category}
                       onChange={e => setDayForm({...dayForm, category: e.target.value})}
                       placeholder="groceries" className="mt-1 w-full control-shell" />
                <datalist id="dd-cats">{DAY_TO_DAY_CATS.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="label-overline">Monthly budget (£)</label>
                <input required type="number" step="0.01" value={dayForm.budgeted_amount}
                       onChange={e => setDayForm({...dayForm, budgeted_amount: e.target.value})}
                       placeholder="300" className="mt-1 w-full control-shell" />
              </div>
              <button className="btn-pill gradient-emerald text-white text-sm">
                <Plus className="h-4 w-4 mr-2" /> Add
              </button>
            </form>
          </SectionCard>

          {/* AI Prediction */}
          <SectionCard eyebrow="AI Forecast" title="Predicted month-end spending">
            <p className="text-sm text-muted-foreground mb-4">AI analyses your last 3 months to predict each category.</p>
            <button onClick={handlePredict} disabled={predicting} className="btn-pill border border-topaz text-topaz text-sm">
              {predicting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {predicting ? "Predicting…" : "Run prediction"}
            </button>
            {predictions.length > 0 && (
              <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {predictions.map((p, i) => (
                  <div key={i} className="rounded-xl border border-border bg-secondary/20 p-4">
                    <p className="text-sm font-medium capitalize">{p.category}</p>
                    <p className="text-2xl font-semibold text-emerald mt-1">£{p.predicted_monthly?.toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Confidence: {Math.round((p.confidence || 0) * 100)}%
                    </p>
                    {p.rationale && <p className="text-xs text-muted-foreground mt-2">{p.rationale}</p>}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Category list */}
          <div className="space-y-3">
            {dayOccasions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No budgets yet. Add a category above.</p>
            ) : (
              dayOccasions.map(occ => (
                <div key={occ.id}>
                  <p className="label-overline mb-2">{occ.name}</p>
                  {occ.categories.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between py-3 px-4 rounded-xl border border-border mb-2 bg-card">
                      <div>
                        <p className="font-medium capitalize">{cat.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Budget: £{cat.budgeted.toFixed(0)} · Actual: £{cat.actual.toFixed(0)} · Forecast: £{cat.forecast.toFixed(0)}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-sm font-medium ${cat.difference >= 0 ? "text-emerald" : "text-ruby"}`}>
                          {cat.difference >= 0 ? "+" : ""}£{cat.difference.toFixed(0)}
                        </span>
                        <button onClick={() => deleteDayToDay(cat.id, cat.name)} className="p-2 rounded-lg hover:bg-secondary text-ruby">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── TAB: YOM TOV (carried over) ─────────────────────────────────── */}
      {activeTab === "yomtov" && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease-out]">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4"><Calendar className="h-4 w-4 text-topaz" /><p className="label-overline">Yom Tov budget forecast</p></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {jewishHolidays.map(h => (
                <div key={h.holiday} className="rounded-xl border border-border p-4 hover:border-topaz transition-colors cursor-pointer" onClick={() => viewHoliday(h.holiday)}>
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{h.holiday}</p>
                    <span className="text-xs px-2 py-1 rounded-full bg-secondary">{h.month}</span>
                  </div>
                  <p className="text-2xl tracking-tight font-medium text-topaz mt-2">+{h.uplift_pct}% uplift</p>
                  <p className="text-xs text-muted-foreground mt-2">{h.categories?.length} categories</p>
                  <button className="mt-3 text-xs px-3 py-1 rounded-full border border-border hover:border-topaz hover:text-topaz">
                    {selectedHoliday === h.holiday ? "Close" : "Budget"}
                  </button>
                </div>
              ))}
            </div>
          </div>
          {renderHolidayDetail()}
        </div>
      )}

      {/* ── TAB: HOLIDAY (carried over) ─────────────────────────────────── */}
      {activeTab === "holiday" && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease-out]">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4"><Plane className="h-4 w-4 text-topaz" /><p className="label-overline">Vacation & Secular Holidays</p></div>
            <div className="flex gap-2 mb-6">
              <input placeholder="New holiday name (e.g. Summer Trip)" value={newSecularHoliday}
                     onChange={e => setNewSecularHoliday(e.target.value)}
                     className="h-10 flex-1 max-w-sm px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
              <button onClick={addSecularHoliday} className="btn-pill gradient-emerald text-white text-sm">
                <Plus className="h-4 w-4 mr-1" /> Add Holiday
              </button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {secularHolidaysList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 col-span-full">No custom holidays yet. Create one above.</p>
              ) : secularHolidaysList.map(hName => (
                <div key={hName} className="rounded-xl border border-border p-4 hover:border-topaz transition-colors cursor-pointer" onClick={() => viewHoliday(hName)}>
                  <p className="font-medium">{hName}</p>
                  <button className="mt-3 text-xs px-3 py-1 rounded-full border border-border hover:border-topaz hover:text-topaz">
                    {selectedHoliday === hName ? "Close" : "Budget"}
                  </button>
                </div>
              ))}
            </div>
          </div>
          {renderHolidayDetail()}
        </div>
      )}

      {/* ── TAB: SIMCHA (carried over) ──────────────────────────────────── */}
      {activeTab === "simcha" && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease-out]">
          <div className="rounded-2xl border-2 border-topaz/30 bg-card p-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-ruby" />
                <p className="text-lg tracking-tight font-medium">Simcha Planner</p>
              </div>
              <button onClick={() => { setShowChasunaForm(!showChasunaForm); setEditingChasuna(null); setChasunaForm({ category: "", description: "", estimated_cost: "", vendor: "", due_date: "" }); }}
                      className="btn-pill gradient-topaz text-white text-sm">
                <Plus className="h-4 w-4 mr-1" /> Add item
              </button>
            </div>
            {chasunaSum && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <Stat label="Total estimated" value={`£${chasunaSum.total_estimated?.toFixed(2) || "0.00"}`} accent="topaz" />
                <Stat label="Total spent" value={`£${chasunaSum.total_actual?.toFixed(2) || "0.00"}`} accent="emerald" />
                <Stat label="Deposits paid" value={`£${chasunaSum.total_deposit_paid?.toFixed(2) || "0.00"}`} accent="emerald" />
                <Stat label="Remaining" value={`£${chasunaSum.remaining?.toFixed(2) || "0.00"}`} accent={chasunaSum.remaining > 0 ? "ruby" : "emerald"} />
              </div>
            )}
            {chasunaSum?.total_estimated > 0 && (
              <div className="mb-6">
                <div className="flex justify-between text-xs mb-1">
                  <span>Progress</span>
                  <span>{chasunaSum.progress_pct?.toFixed(1) || 0}%</span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald to-topaz rounded-full transition-all" style={{ width: `${Math.min(100, chasunaSum.progress_pct || 0)}%` }} />
                </div>
              </div>
            )}
            {showChasunaForm && (
              <form onSubmit={saveChasuna} className="mb-6 p-4 rounded-xl bg-secondary/20 border border-border space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <select value={chasunaForm.category} onChange={e => setChasunaForm({...chasunaForm, category: e.target.value})} required
                          className="h-10 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm">
                    <option value="">Select category</option>
                    {chasunaCategories.map(c => <option key={c} value={c}>{c.replace("-", " ")}</option>)}
                  </select>
                  <input placeholder="Description" value={chasunaForm.description}
                         onChange={e => setChasunaForm({...chasunaForm, description: e.target.value})}
                         className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input placeholder="Estimated cost £" type="number" value={chasunaForm.estimated_cost}
                         onChange={e => setChasunaForm({...chasunaForm, estimated_cost: e.target.value})}
                         className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
                  <input placeholder="Vendor" value={chasunaForm.vendor}
                         onChange={e => setChasunaForm({...chasunaForm, vendor: e.target.value})}
                         className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
                  <input placeholder="Due date" type="date" value={chasunaForm.due_date}
                         onChange={e => setChasunaForm({...chasunaForm, due_date: e.target.value})}
                         className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-pill gradient-emerald text-white text-sm">
                    {editingChasuna ? "Update" : "Add to plan"}
                  </button>
                  <button type="button" onClick={() => { setShowChasunaForm(false); setEditingChasuna(null); }}
                          className="text-xs px-4 py-2 rounded-full border border-border">Cancel</button>
                </div>
              </form>
            )}
            {chasunaItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No items yet. Add your first simcha expense above.</p>
            ) : (
              <div className="space-y-2">
                {chasunaItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-3 px-4 rounded-xl bg-secondary/20 border border-border">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${item.status === "paid" ? "bg-emerald" : item.status === "booked" ? "bg-topaz" : "bg-muted-foreground"}`} />
                        <p className="text-sm font-medium truncate">{item.category.replace("-", " ")}</p>
                        {item.description && <span className="text-xs text-muted-foreground truncate">· {item.description}</span>}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        <span>Est: £{item.estimated_cost?.toFixed(2) || "0.00"}</span>
                        {item.actual_cost > 0 && <span>Actual: £{item.actual_cost.toFixed(2)}</span>}
                        {item.deposit_paid > 0 && <span>Deposit: £{item.deposit_paid.toFixed(2)}</span>}
                        {item.vendor && <span>· {item.vendor}</span>}
                        {item.due_date && <span>· Due: {item.due_date.slice(0, 10)}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-3">
                      <button onClick={() => editChasuna(item)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteChasuna(item.id)} className="p-2 rounded-lg hover:bg-secondary text-ruby"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: OTHER ──────────────────────────────────────────────────── */}
      {activeTab === "other" && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease-out]">
          <SectionCard eyebrow="Create" title="One-time expense">
            <form onSubmit={createOther} className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[160px]">
                <label className="label-overline">Name</label>
                <input required value={otherForm.name}
                       onChange={e => setOtherForm({...otherForm, name: e.target.value})}
                       placeholder="Car purchase" className="mt-1 w-full control-shell" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="label-overline">Budget (£)</label>
                <input required type="number" step="0.01" value={otherForm.estimated_amount}
                       onChange={e => setOtherForm({...otherForm, estimated_amount: e.target.value})}
                       placeholder="5000" className="mt-1 w-full control-shell" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="label-overline">Date</label>
                <input type="date" value={otherForm.event_date}
                       onChange={e => setOtherForm({...otherForm, event_date: e.target.value})}
                       className="mt-1 w-full control-shell" />
              </div>
              <button className="btn-pill gradient-emerald text-white text-sm">
                <Plus className="h-4 w-4 mr-2" /> Add
              </button>
            </form>
          </SectionCard>

          <div className="space-y-3">
            {otherOccasions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No other budgets yet.</p>
            ) : (
              otherOccasions.map(occ => (
                <div key={occ.id} className="flex items-center justify-between py-3 px-4 rounded-xl border border-border bg-card">
                  <div>
                    <p className="font-medium">{occ.name}</p>
                    <p className="text-xs text-muted-foreground">£{occ.estimated_amount?.toFixed(0) || "0"}</p>
                  </div>
                  <button onClick={() => deleteOther(occ.id)} className="p-2 rounded-lg hover:bg-secondary text-ruby">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Confirm delete"
        message="Are you sure you want to delete this item?"
        onConfirm={() => { confirmCb.current?.(); setConfirmOpen(false); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

const Stat = ({ label, value, accent }) => (
  <div className="rounded-xl bg-secondary/40 p-4">
    <p className="label-overline">{label}</p>
    <p className={`text-2xl tracking-tight font-medium mt-1 ${accent === "ruby" ? "text-ruby" : accent === "topaz" ? "text-topaz" : "text-emerald"}`}>{value}</p>
  </div>
);

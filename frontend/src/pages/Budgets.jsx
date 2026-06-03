import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { Plus, Trash2, Pencil, X, Check, Loader2, PiggyBank, Calendar, Heart, Star, Plane } from "lucide-react";
import { toast } from "sonner";
import AIInsightPanel from "../components/AIInsightPanel";
import { EmptyState, MetricCard, PageHeader, SectionCard } from "../components/ui/layout";
import { SkeletonCard } from "../components/ui/Skeleton";
import ConfirmModal from "../components/ui/ConfirmModal";

const CATS = ["groceries","dining","transport","utilities","subscriptions","tzedakah","rent","salary","income","shopping","health","entertainment","insurance","education","transfer","cash","tax","fees","mortgage","uncategorized"];

export default function Budgets() {
  const [activeTab, setActiveTab] = useState("monthly");

  // Confirm Modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmCb = useRef(null);
  const showConfirm = (cb) => {
    confirmCb.current = cb;
    setConfirmOpen(true);
  };

  // --- MONTHLY BUDGET STATE ---
  const [budgets, setBudgets] = useState([]);
  const [form, setForm] = useState({ category: "", limit: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ category: "", limit: "" });
  const [loading, setLoading] = useState(true);

  // --- HOLIDAY / YOM TOV STATE ---
  const [jewishHolidays, setJewishHolidays] = useState([]);
  const [holidayBudgets, setHolidayBudgets] = useState([]);
  const [selectedHoliday, setSelectedHoliday] = useState(null);
  const [holidayForm, setHolidayForm] = useState({ category: "", budgeted_amount: "" });
  const [editingBudget, setEditingBudget] = useState(null);
  const [budgetSummary, setBudgetSummary] = useState(null);
  const [newSecularHoliday, setNewSecularHoliday] = useState("");

  // --- CHASUNA / SIMCHA STATE ---
  const [chasunaItems, setChasunaItems] = useState([]);
  const [chasunaSum, setChasunaSum] = useState(null);
  const [chasunaForm, setChasunaForm] = useState({ category: "", description: "", estimated_cost: "", vendor: "", due_date: "" });
  const [editingChasuna, setEditingChasuna] = useState(null);
  const [showChasunaForm, setShowChasunaForm] = useState(false);
  const [chasunaCategories, setChasunaCategories] = useState([]);

  // --- LOADERS ---
  const loadMonthly = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/budgets");
      setBudgets(data.budgets);
    } catch { toast.error("Could not load budgets"); }
    finally { setLoading(false); }
  }, []);

  const loadHolidays = useCallback(async () => {
    try {
      const { data } = await api.get("/jewish/holidays/defaults");
      setJewishHolidays(data.holidays || []);
    } catch (err) {
      if (err?.response?.status !== 404) toast.error("Could not load holiday defaults");
    }
  }, []);

  const loadHolidayBudgets = useCallback(async () => {
    try {
      const { data } = await api.get("/jewish/holiday-budgets");
      setHolidayBudgets(data.budgets || []);
    } catch (err) {
      if (err?.response?.status !== 404) toast.error("Could not load holiday budgets");
    }
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
    } catch (err) {
      toast.error("Could not load simcha data");
    }
  }, []);

  useEffect(() => { loadMonthly(); loadHolidays(); loadHolidayBudgets(); loadChasuna(); }, [loadMonthly, loadHolidays, loadHolidayBudgets, loadChasuna]);

  // --- MONTHLY LOGIC ---
  const summary = useMemo(() => {
    const totalLimit = budgets.reduce((sum, budget) => sum + Number(budget.limit || 0), 0);
    const totalSpent = budgets.reduce((sum, budget) => sum + Number(budget.spent || 0), 0);
    const overCount = budgets.filter((budget) => Number(budget.progress_pct || 0) >= 100).length;
    return { totalLimit, totalSpent, overCount };
  }, [budgets]);

  const createMonthly = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/budgets", { category: form.category.toLowerCase(), limit: parseFloat(form.limit) });
      toast("Budget created", {
        action: { label: "Undo", onClick: async () => { await api.delete(`/budgets/${data.budget_id}`); toast.success("Undone"); await loadMonthly(); } },
        duration: 6000,
      });
      setForm({ category: "", limit: "" });
      await loadMonthly();
    } catch { toast.error("Could not create"); }
  };

  const delMonthly = async (id) => {
    const budget = budgets.find(b => b.budget_id === id);
    try {
      await api.delete(`/budgets/${id}`);
      toast("Budget removed", {
        action: { label: "Undo", onClick: async () => { await api.post("/budgets", { category: budget.category, limit: Number(budget.limit) }); toast.success("Restored"); await loadMonthly(); } },
        duration: 6000,
      });
      await loadMonthly();
    } catch { toast.error("Could not delete"); }
  };

  const startEditMonthly = (b) => {
    setEditingId(b.budget_id);
    setEditForm({ category: b.category, limit: String(b.limit) });
  };
  const cancelEditMonthly = () => {
    setEditingId(null);
    setEditForm({ category: "", limit: "" });
  };
  const saveEditMonthly = async (id) => {
    try {
      await api.patch(`/budgets/${id}`, { category: editForm.category.toLowerCase(), limit: parseFloat(editForm.limit) });
      toast.success("Budget updated");
      cancelEditMonthly();
      await loadMonthly();
    } catch { toast.error("Could not update"); }
  };

  // --- HOLIDAY / YOM TOV LOGIC ---
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
    } catch (err) { toast.error("Could not update"); }
  };

  const deleteBudgetCategory = async (id) => {
    showConfirm(async () => {
      try {
        await api.delete(`/jewish/holiday-budgets/${id}`);
        await loadHolidayBudgets();
        if (selectedHoliday) loadBudgetSummary(selectedHoliday);
      } catch (err) { toast.error("Could not delete"); }
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

  // --- SIMCHA (CHASUNA) LOGIC ---
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
      category: item.category,
      description: item.description || "",
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
      } catch (err) { toast.error("Could not delete"); }
    });
  };

  // Helper renderer for Holiday/YomTov detail panel
  const renderHolidayDetail = () => {
    if (!selectedHoliday) return null;
    const isJewish = jewishHolidayNames.includes(selectedHoliday);
    return (
      <div className="rounded-2xl border-2 border-topaz/30 bg-card p-6 mt-6 animate-[fadeUp_0.3s_ease-out]">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <p className="label-overline">{selectedHoliday} budget</p>
          <div className="flex gap-2">
            {isJewish && (
              <button onClick={() => initHolidayBudget(selectedHoliday)} className="text-xs px-3 py-1.5 rounded-full bg-topaz text-white hover:opacity-90">
                Init from defaults
              </button>
            )}
          </div>
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

        {holidayBudgets.filter(b => b.holiday_name === selectedHoliday).map(b => (
          <div key={b.holiday_name + b.hebrew_year}>
            {b.categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                {editingBudget === cat.id ? (
                  <div className="flex gap-2 w-full">
                    <input type="number" defaultValue={cat.budgeted_amount}
                           id={`budget-${cat.id}`} className="h-9 w-28 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
                    <input type="number" defaultValue={cat.actual_amount}
                           id={`actual-${cat.id}`} className="h-9 w-28 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
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
        ))}
        {holidayBudgets.filter(b => b.holiday_name === selectedHoliday).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No categories added yet.</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6" data-testid="budgets-root">
      <PageHeader
        eyebrow="Money"
        title="Budgets & Planning"
        description="Track monthly limits, Yom Tov expenses, vacations, and Simchas all in one place."
      />

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap border-b border-border pb-2">
        {[
          { key: "monthly", label: "Monthly Budget", icon: PiggyBank },
          { key: "yomtov", label: "Yom Tov", icon: Star },
          { key: "holiday", label: "Holiday", icon: Plane },
          { key: "simcha", label: "Simcha", icon: Heart },
        ].map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedHoliday(null); }}
            className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-t-lg transition-colors capitalize ${activeTab === tab.key ? "bg-card border-b-2 border-emerald font-medium" : "text-muted-foreground hover:text-foreground"}`}>
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* --- MONTHLY TAB --- */}
      {activeTab === "monthly" && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease-out]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard label="Budgets" value={budgets.length.toString()} />
            <MetricCard label="Total limit" value={`£${summary.totalLimit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            <MetricCard label="Over budget" value={summary.overCount.toString()} tone={summary.overCount ? "ruby" : "emerald"} />
          </div>

          <SectionCard eyebrow="AI coach" title="Smart limits based on your spending" contentClassName="pt-0">
            <AIInsightPanel
              title="AI Budget Coach"
              subtitle="Smart limits based on your spending"
              endpoint="/ai/insights/budget"
              render={(d) => (
                <div className="mt-5 space-y-5">
                  {d.summary && <p className="text-base font-medium">{d.summary}</p>}
                  {d.recommendations?.length > 0 && (
                    <div>
                      <p className="label-overline mb-2">Suggested budgets</p>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {d.recommendations.map((r, i) => (
                          <div key={i} className="rounded-xl border border-border bg-secondary/30 p-4">
                            <p className="text-xs text-muted-foreground capitalize">{r.category}</p>
                            <p className="text-2xl tracking-tight font-medium text-emerald mt-1">£{r.suggested_monthly_limit}<span className="text-xs text-muted-foreground"> /mo</span></p>
                            <p className="text-xs mt-2 text-muted-foreground leading-snug">{r.rationale}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {d.categories_to_reduce?.length > 0 && (
                    <div>
                      <p className="label-overline mb-2">Easy wins</p>
                      <div className="space-y-2">
                        {d.categories_to_reduce.map((c, i) => (
                          <div key={i} className="flex gap-3 items-start p-3 rounded-lg bg-topaz/5 border border-topaz/20">
                            <span className="text-topaz font-semibold">−£{c.potential_monthly_saving}</span>
                            <div className="flex-1">
                              <p className="text-sm font-medium capitalize">{c.category}</p>
                              <p className="text-xs text-muted-foreground">{c.tip}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            />
          </SectionCard>

          <SectionCard eyebrow="Create" title="New monthly budget">
            <div id="budget-form" className="scroll-mt-24">
              <form onSubmit={createMonthly} className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[160px]">
                  <label className="label-overline">Category</label>
                  <input list="bud-cats" required value={form.category} onChange={(e)=>setForm({...form, category:e.target.value})} placeholder="groceries" className="mt-1 w-full control-shell" />
                  <datalist id="bud-cats">{CATS.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="label-overline">Monthly limit (£)</label>
                  <input required type="number" step="0.01" value={form.limit} onChange={(e)=>setForm({...form, limit:e.target.value})} placeholder="300" className="mt-1 w-full control-shell" />
                </div>
                <button className="btn-pill gradient-emerald text-white text-sm"><Plus className="h-4 w-4 mr-2"/>Add budget</button>
              </form>
            </div>
          </SectionCard>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {budgets.length === 0 ? (
              <EmptyState icon={PiggyBank} title="No budgets yet" description="Add your first monthly budget to start tracking spending." className="col-span-full" />
            ) : (
              budgets.map((b) => {
                const over = b.progress_pct >= 100;
                const isEditing = editingId === b.budget_id;
                return (
                  <div key={b.budget_id} className="section-shell p-5">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div>
                          <label className="label-overline">Category</label>
                          <input value={editForm.category} onChange={(e)=>setEditForm({...editForm, category:e.target.value})} className="mt-1 w-full control-shell text-sm" />
                        </div>
                        <div>
                          <label className="label-overline">Monthly limit (£)</label>
                          <input type="number" step="0.01" value={editForm.limit} onChange={(e)=>setEditForm({...editForm, limit:e.target.value})} className="mt-1 w-full control-shell text-sm" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={()=>saveEditMonthly(b.budget_id)} className="flex-1 h-9 rounded-full bg-emerald text-white text-xs inline-flex items-center justify-center gap-1"><Check className="h-3 w-3"/>Save</button>
                          <button onClick={cancelEditMonthly} className="flex-1 h-9 rounded-full border border-border text-xs inline-flex items-center justify-center gap-1"><X className="h-3 w-3"/>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="font-medium capitalize">{b.category}</p>
                          <div className="flex items-center gap-2">
                            <button onClick={()=>startEditMonthly(b)} className="p-2 text-muted-foreground hover:text-emerald" title="Edit"><Pencil className="h-4 w-4"/></button>
                            <button onClick={()=>delMonthly(b.budget_id)} className="p-2 text-muted-foreground hover:text-ruby" title="Delete"><Trash2 className="h-4 w-4"/></button>
                          </div>
                        </div>
                        <p className="text-2xl tracking-tight font-semibold mt-3">£{b.spent} <span className="text-sm text-muted-foreground">/ £{b.limit}</span></p>
                        <div className="mt-4 h-2 bg-secondary rounded-full overflow-hidden">
                          <div className={`h-full ${over ? "bg-ruby" : "gradient-emerald"}`} style={{width: `${Math.min(100, b.progress_pct)}%`}} />
                        </div>
                        <p className={`text-xs mt-2 ${over ? "text-ruby" : "text-muted-foreground"}`}>
                          {over ? `Over by £${Math.abs(b.remaining).toFixed(2)}` : `£${b.remaining.toFixed(2)} remaining`}
                        </p>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
          )}
        </div>
      )}

      {/* --- YOM TOV TAB --- */}
      {activeTab === "yomtov" && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease-out]">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4"><Calendar className="h-4 w-4 text-topaz" /><p className="label-overline">Yom Tov budget forecast</p></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {jewishHolidays.map((h) => (
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

      {/* --- HOLIDAY (SECULAR) TAB --- */}
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
              ) : (
                secularHolidaysList.map((hName) => (
                  <div key={hName} className="rounded-xl border border-border p-4 hover:border-topaz transition-colors cursor-pointer" onClick={() => viewHoliday(hName)}>
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{hName}</p>
                    </div>
                    <button className="mt-3 text-xs px-3 py-1 rounded-full border border-border hover:border-topaz hover:text-topaz">
                      {selectedHoliday === hName ? "Close" : "Budget"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          {renderHolidayDetail()}
        </div>
      )}

      {/* --- SIMCHA (CHASUNA) TAB --- */}
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
                  <div className="h-full bg-gradient-to-r from-emerald to-topaz rounded-full transition-all"
                       style={{ width: `${Math.min(100, chasunaSum.progress_pct || 0)}%` }} />
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  Plus, Trash2, Pencil, X, Check, Loader2, PiggyBank, Calendar, Heart, Star, Plane,
  Package, Wand2, Sparkles, TrendingUp, AlertTriangle, Gauge, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState, MetricCard, PageHeader, SectionCard } from "../components/ui/layout";
import { SkeletonCard } from "../components/ui/Skeleton";
import ConfirmModal from "../components/ui/ConfirmModal";

const DAY_TO_DAY_CATS = ["groceries","household","fuel","school","utilities","transport","dining","health","entertainment","clothing","personal","other"];

const CATS = ["groceries","dining","transport","utilities","subscriptions","tzedakah","rent","salary","income","shopping","health","entertainment","insurance","education","transfer","cash","tax","fees","mortgage","uncategorized"];
const DEFAULT_SIMCHA_CATEGORIES = ["hall","catering","music","clothing","gifts","photography"];
const MONTHS = [
  {value:1,label:"January"},{value:2,label:"February"},{value:3,label:"March"},
  {value:4,label:"April"},{value:5,label:"May"},{value:6,label:"June"},
  {value:7,label:"July"},{value:8,label:"August"},{value:9,label:"September"},
  {value:10,label:"October"},{value:11,label:"November"},{value:12,label:"December"},
];

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

  // ── Yom Tov / Holiday (carried over) ────────────────────────────────────
  const [jewishHolidays, setJewishHolidays] = useState([]);
  const [holidayBudgets, setHolidayBudgets] = useState([]);
  const [selectedHoliday, setSelectedHoliday] = useState(null);
  const [holidayForm, setHolidayForm] = useState({ category: "", budgeted_amount: "" });
  const [editingBudget, setEditingBudget] = useState(null);
  const [budgetSummary, setBudgetSummary] = useState(null);
  const [newSecularHoliday, setNewSecularHoliday] = useState("");

  // ── Phase 2: Yom Tov auto-create + estimate ──────────────────────────
  const [autoCreating, setAutoCreating] = useState(false);
  const [autoCreateResult, setAutoCreateResult] = useState(null);
  const [estimatingYomTov, setEstimatingYomTov] = useState(null);
  const [yomTovEstimates, setYomTovEstimates] = useState({});

  // ── Phase 2: Enhanced Holiday ─────────────────────────────────────────
  const [holidayName, setHolidayName] = useState("");
  const [holidayDestination, setHolidayDestination] = useState("");
  const [holidayStartDate, setHolidayStartDate] = useState("");
  const [holidayEndDate, setHolidayEndDate] = useState("");
  const [estimatingHoliday, setEstimatingHoliday] = useState(false);
  const [holidayEstimate, setHolidayEstimate] = useState(null);

  // ── Chasuna (wedding planner, carried over) ───────────────────────────
  const [chasunaItems, setChasunaItems] = useState([]);
  const [chasunaSum, setChasunaSum] = useState(null);
  const [chasunaForm, setChasunaForm] = useState({ category: "", description: "", estimated_cost: "", vendor: "", due_date: "" });
  const [editingChasuna, setEditingChasuna] = useState(null);
  const [showChasunaForm, setShowChasunaForm] = useState(false);
  const [chasunaCategories, setChasunaCategories] = useState([]);

  // ── Simcha (Phase 3) ──────────────────────────────────────────────────
  const [simchaOccasions, setSimchaOccasions] = useState([]);
  const [simchaForm, setSimchaForm] = useState({
    name: "", event_date: "", estimated_amount: "",
    cat_hall: "", cat_catering: "", cat_music: "", cat_clothing: "",
    cat_gifts: "", cat_photography: "",
  });
  const [editingSimcha, setEditingSimcha] = useState(null);
  const [showSimchaForm, setShowSimchaForm] = useState(false);

  // ── Other budget (Phase 3) ───────────────────────────────────────────
  const [otherOccasions, setOtherOccasions] = useState([]);
  const [otherForm, setOtherForm] = useState({ name: "", estimated_amount: "", event_date: "", notes: "", categories: "" });
  const [editingOther, setEditingOther] = useState(null);

  // ── Phase 4: Smart Features ──────────────────────────────────────────
  const [healthScore, setHealthScore] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [upcomingExpenses, setUpcomingExpenses] = useState([]);
  const [detectingPatterns, setDetectingPatterns] = useState(false);
  const [patternsDetected, setPatternsDetected] = useState(null);

  const now = new Date();
  const [reviewYear, setReviewYear] = useState(now.getFullYear());
  const [reviewMonth, setReviewMonth] = useState(now.getMonth() + 1);
  const [reviewData, setReviewData] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewNarrative, setReviewNarrative] = useState(null);

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
    try {
      const { data } = await api.get("/budget-system/other");
      setOtherOccasions(data.occasions || []);
    } catch { /* optional */ }
  }, []);

  const loadSimcha = useCallback(async () => {
    try {
      const { data } = await api.get("/budget-system/simcha");
      setSimchaOccasions(data.occasions || []);
    } catch { /* optional */ }
  }, []);

  const loadHealthScore = useCallback(async () => {
    try {
      const { data } = await api.get("/budget-system/health-score");
      setHealthScore(data);
    } catch { /* optional */ }
  }, []);

  const loadAlertsData = useCallback(async () => {
    try {
      const { data } = await api.get("/budget-system/alerts");
      setAlerts(data.alerts || []);
    } catch { /* optional */ }
  }, []);

  const loadUpcomingExpenses = useCallback(async () => {
    try {
      const { data } = await api.get("/budget-system/upcoming");
      setUpcomingExpenses(data.upcoming || []);
    } catch { /* optional */ }
  }, []);

  useEffect(() => {
    loadOverview();
    loadDayToDay();
    loadHolidays();
    loadHolidayBudgets();
    loadChasuna();
    loadOther();
    loadSimcha();
    loadHealthScore();
    loadAlertsData();
    loadUpcomingExpenses();
  }, [loadOverview, loadDayToDay, loadHolidays, loadHolidayBudgets, loadChasuna, loadOther, loadSimcha, loadHealthScore, loadAlertsData, loadUpcomingExpenses]);

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

  // ── YOM TOV AUTO-CREATE + ESTIMATE ────────────────────────────────────

  const handleAutoCreateYomTov = async () => {
    const names = jewishHolidayNames;
    if (names.length === 0) { toast.info("No Yom Tov holidays loaded."); return; }
    setAutoCreating(true);
    try {
      const { data } = await api.post("/budget-system/yom-tov/auto-create", { holiday_names: names });
      setAutoCreateResult(data);
      toast.success(`Created ${data.count} Yom Tov budgets`);
      loadOverview();
    } catch { toast.error("Auto-create failed"); }
    finally { setAutoCreating(false); }
  };

  const handleEstimateYomTov = async (holidayName) => {
    setEstimatingYomTov(holidayName);
    try {
      const { data } = await api.post("/budget-system/yom-tov/estimate", { holiday_name: holidayName });
      setYomTovEstimates(prev => ({ ...prev, [holidayName]: data.estimates }));
      toast.success(`AI estimate for ${holidayName} complete`);
    } catch (err) { toast.error(err.response?.data?.detail || "Estimate failed"); }
    finally { setEstimatingYomTov(null); }
  };

  // ── HOLIDAY (enhanced) AI ESTIMATE ────────────────────────────────────

  const handleHolidayEstimate = async () => {
    if (!holidayName.trim() || !holidayStartDate || !holidayEndDate) {
      toast.error("Name, start date, and end date required"); return;
    }
    setEstimatingHoliday(true);
    try {
      const { data } = await api.post("/budget-system/holiday/estimate", {
        name: holidayName.trim(),
        destination: holidayDestination.trim() || null,
        start_date: holidayStartDate,
        end_date: holidayEndDate,
      });
      setHolidayEstimate(data);
      toast.success(`Estimated: £${data.total_estimated.toFixed(0)}`);
      loadOverview();
    } catch (err) { toast.error(err.response?.data?.detail || "Estimate failed"); }
    finally { setEstimatingHoliday(false); }
  };

  const clearHolidayEstimate = () => {
    setHolidayName("");
    setHolidayDestination("");
    setHolidayStartDate("");
    setHolidayEndDate("");
    setHolidayEstimate(null);
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

  // ── SIMCHA (Phase 3) ──────────────────────────────────────────────────

  const SIMCHA_CATS = DEFAULT_SIMCHA_CATEGORIES;

  const createSimcha = async (e) => {
    e.preventDefault();
    try {
      const cats = SIMCHA_CATS
        .filter(cat => parseFloat(simchaForm[`cat_${cat}`]) > 0)
        .map(cat => ({ name: cat, budgeted_amount: parseFloat(simchaForm[`cat_${cat}`]) }));
      const payload = {
        name: simchaForm.name.trim(),
        event_date: simchaForm.event_date || null,
        estimated_amount: parseFloat(simchaForm.estimated_amount) || 0,
        categories: cats,
      };
      if (editingSimcha) {
        await api.put(`/budget-system/simcha/${editingSimcha}`, payload);
        setEditingSimcha(null);
        toast.success("Updated");
      } else {
        await api.post("/budget-system/simcha", payload);
        toast.success("Simcha created");
      }
      setSimchaForm({ name: "", event_date: "", estimated_amount: "",
        cat_hall: "", cat_catering: "", cat_music: "", cat_clothing: "",
        cat_gifts: "", cat_photography: "",
      });
      setShowSimchaForm(false);
      loadSimcha();
      loadOverview();
    } catch { toast.error("Could not save simcha"); }
  };

  const editSimcha = (occ) => {
    setEditingSimcha(occ.id);
    const catMap = {};
    (occ.categories || []).forEach(c => { catMap[`cat_${c.name}`] = String(c.budgeted); });
    setSimchaForm({
      name: occ.name,
      event_date: occ.event_date ? occ.event_date.slice(0, 10) : "",
      estimated_amount: String(occ.estimated_amount || ""),
      cat_hall: catMap.cat_hall || "",
      cat_catering: catMap.cat_catering || "",
      cat_music: catMap.cat_music || "",
      cat_clothing: catMap.cat_clothing || "",
      cat_gifts: catMap.cat_gifts || "",
      cat_photography: catMap.cat_photography || "",
    });
    setShowSimchaForm(true);
  };

  const deleteSimcha = async (id) => {
    showConfirm(async () => {
      try {
        await api.delete(`/budget-system/simcha/${id}`);
        toast.success("Simcha deleted");
        loadSimcha();
        loadOverview();
      } catch { toast.error("Could not delete"); }
    });
  };

  // ── OTHER BUDGET (Phase 3) ────────────────────────────────────────────

  const createOther = async (e) => {
    e.preventDefault();
    try {
      const cats = otherForm.categories
        ? otherForm.categories.split(",").map(s => s.trim()).filter(Boolean).map(name => ({ name, budgeted_amount: 0 }))
        : [];
      const payload = {
        name: otherForm.name.trim(),
        event_date: otherForm.event_date || null,
        estimated_amount: parseFloat(otherForm.estimated_amount) || 0,
        notes: otherForm.notes || null,
        categories: cats,
      };
      if (editingOther) {
        await api.put(`/budget-system/other/${editingOther}`, payload);
        setEditingOther(null);
        toast.success("Updated");
      } else {
        await api.post("/budget-system/other", payload);
        toast.success("Budget added");
      }
      setOtherForm({ name: "", estimated_amount: "", event_date: "", notes: "", categories: "" });
      loadOther();
      loadOverview();
    } catch { toast.error("Could not add"); }
  };

  const deleteOther = async (id) => {
    showConfirm(async () => {
      try {
        await api.delete(`/budget-system/other/${id}`);
        toast.success("Removed");
        loadOther();
        loadOverview();
      } catch { toast.error("Could not delete"); }
    });
  };

  const updateOther = async (id, data) => {
    try {
      await api.put(`/budget-system/other/${id}`, data);
      setEditingOther(null);
      toast.success("Updated");
      loadOther();
      loadOverview();
    } catch { toast.error("Could not update"); }
  };

  // ── Phase 4: Monthly Review ─────────────────────────────────────────-

  const handleGenerateReview = async () => {
    setReviewLoading(true);
    setReviewData(null);
    setReviewNarrative(null);
    try {
      const { data } = await api.post("/budget-system/monthly-review", { year: reviewYear, month: reviewMonth });
      setReviewData(data);
      // Also fetch AI narrative
      try {
        const { data: narrativeData } = await api.post("/ai/insights/report", { year: reviewYear, month: reviewMonth });
        setReviewNarrative(narrativeData);
      } catch { /* narrative is optional */ }
      toast.success("Review generated");
    } catch (err) { toast.error(err.response?.data?.detail || "Could not generate review"); }
    finally { setReviewLoading(false); }
  };

  const handleDetectPatterns = async () => {
    setDetectingPatterns(true);
    setPatternsDetected(null);
    try {
      const { data } = await api.post("/budget-system/detect-patterns");
      setPatternsDetected(data);
      if (data.patterns_detected > 0) {
        toast.success(`Detected ${data.patterns_detected} recurring patterns`);
        loadUpcomingExpenses();
      } else {
        toast.info("No new patterns found");
      }
    } catch (err) { toast.error(err.response?.data?.detail || "Pattern detection failed"); }
    finally { setDetectingPatterns(false); }
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
    { key: "monthly-review", label: "Monthly Review", icon: CalendarDays },
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
              {/* Health Score */}
              {healthScore && (
                <div className="rounded-2xl border border-border bg-card p-6 flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="relative w-20 h-20">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke={
                          healthScore.score >= 70 ? "hsl(var(--emerald))" : healthScore.score >= 40 ? "hsl(var(--topaz))" : "hsl(var(--ruby))"
                        } strokeWidth="3" strokeDasharray={`${healthScore.score * 0.31} 31`} strokeLinecap="round" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold">{healthScore.score}</span>
                    </div>
                    <div>
                      <p className="label-overline">Budget Health Score</p>
                      <p className="text-sm text-muted-foreground">
                        {healthScore.score >= 70 ? "Great shape" : healthScore.score >= 40 ? "Needs attention" : "Critical"}
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-4 min-w-[200px]">
                    {Object.entries(healthScore.breakdown || {}).map(([key, val]) => (
                      <div key={key}>
                        <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
                        <p className="text-lg font-semibold">{val}/{key === "budget_adherence" ? 40 : key === "savings_rate" ? 30 : 30}</p>
                        <div className="w-full h-1.5 bg-secondary rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-ruby via-topaz to-emerald rounded-full transition-all"
                               style={{ width: `${(val / (key === "budget_adherence" ? 40 : 30)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Smart Alerts */}
              {alerts.filter(a => a.severity !== "info").length > 0 && (
                <div className="space-y-2">
                  {alerts.filter(a => a.severity !== "info").slice(0, 4).map((a, i) => (
                    <div key={i} className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm ${
                      a.severity === "critical" ? "bg-ruby/10 border border-ruby/30 text-ruby" : "bg-topaz/10 border border-topaz/30 text-topaz"
                    }`}>
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{a.message}</span>
                    </div>
                  ))}
                </div>
              )}

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

              {/* Yom Tov section */}
              {overview.yom_tov?.occasions?.length > 0 && (
                <SectionCard eyebrow="Yom Tov" title="Active this month" contentClassName="p-0">
                  <div className="divide-y divide-border">
                    {overview.yom_tov.occasions.map(occ => (
                      <div key={occ.name} className="px-6 py-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium">{occ.name}</p>
                          <span className="text-sm font-medium">£{occ.total_budgeted?.toFixed(0)}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {occ.categories?.map(cat => (
                            <span key={cat.name} className="text-xs px-2 py-1 rounded-full bg-secondary/50">
                              {cat.name}: £{cat.budgeted?.toFixed(0)} / £{cat.actual?.toFixed(0)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Holiday section */}
              {overview.holidays?.occasions?.length > 0 && (
                <SectionCard eyebrow="Holidays" title="Active this month" contentClassName="p-0">
                  <div className="divide-y divide-border">
                    {overview.holidays.occasions.map(occ => (
                      <div key={occ.id || occ.name} className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{occ.name}</p>
                            {occ.date && <p className="text-xs text-muted-foreground">{occ.date.slice(0, 10)}</p>}
                          </div>
                          <span className="text-sm font-medium">£{occ.estimated_amount?.toFixed(0)}</span>
                        </div>
                        {occ.categories?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {occ.categories.map(cat => (
                              <span key={cat.name} className="text-xs px-2 py-1 rounded-full bg-secondary/50 capitalize">
                                {cat.name}: £{cat.budgeted?.toFixed(0)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Simcha section */}
              {overview.simcha?.occasions?.length > 0 && (
                <SectionCard eyebrow="Simcha" title="Active this month" contentClassName="p-0">
                  <div className="divide-y divide-border">
                    {overview.simcha.occasions.map(occ => (
                      <div key={occ.id || occ.name} className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{occ.name}</p>
                            {occ.date && <p className="text-xs text-muted-foreground">{occ.date.slice(0, 10)}</p>}
                          </div>
                          <span className="text-sm font-medium">£{occ.estimated_amount?.toFixed(0)}</span>
                        </div>
                        {occ.categories?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {occ.categories.map(cat => (
                              <span key={cat.name} className="text-xs px-2 py-1 rounded-full bg-secondary/50 capitalize">
                                {cat.name}: £{cat.budgeted?.toFixed(0)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Other section */}
              {overview.other?.occasions?.length > 0 && (
                <SectionCard eyebrow="Other" title="Active this month" contentClassName="p-0">
                  <div className="divide-y divide-border">
                    {overview.other.occasions.map(occ => (
                      <div key={occ.id || occ.name} className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{occ.name}</p>
                            {occ.date && <p className="text-xs text-muted-foreground">{occ.date.slice(0, 10)}</p>}
                          </div>
                          <span className="text-sm font-medium">£{occ.estimated_amount?.toFixed(0)}</span>
                        </div>
                        {occ.categories?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {occ.categories.map(cat => (
                              <span key={cat.name} className="text-xs px-2 py-1 rounded-full bg-secondary/50 capitalize">
                                {cat.name}: £{cat.budgeted?.toFixed(0)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Upcoming Expenses */}
              {upcomingExpenses.length > 0 && (
                <SectionCard eyebrow="Upcoming" title="Known expenses ahead" contentClassName="p-0">
                  <div className="divide-y divide-border">
                    {(() => {
                      const now2 = new Date();
                      const in7 = new Date(now2.getTime() + 7 * 86400000);
                      const in30 = new Date(now2.getTime() + 30 * 86400000);
                      const groups = [
                        { label: "Next 7 days", items: upcomingExpenses.filter(e => e.date && new Date(e.date) <= in7) },
                        { label: "Next 30 days", items: upcomingExpenses.filter(e => e.date && new Date(e.date) > in7 && new Date(e.date) <= in30) },
                        { label: "Next 90 days", items: upcomingExpenses.filter(e => !e.date || new Date(e.date) > in30) },
                      ];
                      return groups.map(group => group.items.length > 0 && (
                        <div key={group.label} className="px-6 py-3">
                          <p className="text-xs text-muted-foreground font-medium mb-2">{group.label}</p>
                          {group.items.map((e, i) => (
                            <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{e.name}</span>
                                {e.frequency && <span className="text-xs text-muted-foreground">({e.frequency})</span>}
                              </div>
                              <span className="font-medium tabular-nums">£{e.estimated_amount?.toFixed(0)}</span>
                            </div>
                          ))}
                        </div>
                      ));
                    })()}
                  </div>
                  <div className="px-6 py-4 border-t border-border">
                    <button onClick={handleDetectPatterns} disabled={detectingPatterns}
                            className="btn-pill border border-topaz text-topaz text-sm">
                      {detectingPatterns ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                      {detectingPatterns ? "Scanning…" : "Detect recurring patterns"}
                    </button>
                    {patternsDetected && (
                      <span className="ml-3 text-xs text-muted-foreground">
                        {patternsDetected.patterns_detected > 0
                          ? `${patternsDetected.patterns_detected} patterns found and added to recurring`
                          : "No new patterns found"}
                      </span>
                    )}
                  </div>
                </SectionCard>
              )}
            </>
          ) : (
            <EmptyState icon={Sparkles} title="No budget data" description="Add day-to-day budgets to see your overview." />
          )}
        </div>
      )}

      {/* ── TAB: MONTHLY REVIEW (Phase 4) ──────────────────────────────── */}
      {activeTab === "monthly-review" && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease-out]">
          <SectionCard eyebrow="Review" title="Monthly budget review">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="label-overline">Year</label>
                <select value={reviewYear} onChange={e => setReviewYear(parseInt(e.target.value))}
                        className="mt-1 control-shell">
                  {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="label-overline">Month</label>
                <select value={reviewMonth} onChange={e => setReviewMonth(parseInt(e.target.value))}
                        className="mt-1 control-shell">
                  {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <button onClick={handleGenerateReview} disabled={reviewLoading}
                      className="btn-pill gradient-emerald text-white text-sm disabled:opacity-50">
                {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {reviewLoading ? "Loading…" : "Generate Review"}
              </button>
            </div>
          </SectionCard>

          {reviewData && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <MetricCard label="Income" value={`£${reviewData.income.toLocaleString()}`} icon={TrendingUp} tone="emerald" />
                <MetricCard label="Spent" value={`£${reviewData.expenses.toLocaleString()}`} icon={TrendingUp} tone="ruby" />
                <MetricCard label="Saved" value={`£${reviewData.saved.toLocaleString()}`} icon={PiggyBank} tone={reviewData.saved > 0 ? "emerald" : "ruby"} />
                <MetricCard label="Health Score" value={`${reviewData.health_score}/100`} icon={Gauge} tone={reviewData.health_score >= 70 ? "emerald" : reviewData.health_score >= 40 ? "topaz" : "ruby"} />
                <MetricCard label="Savings Rate" value={`${reviewData.savings_rate}%`} icon={TrendingUp} tone={reviewData.savings_rate > 0 ? "emerald" : "ruby"} />
              </div>

              {reviewData.health_breakdown && (
                <SectionCard eyebrow="Health Score" title="Budget health breakdown">
                  <div className="grid sm:grid-cols-3 gap-4">
                    {Object.entries(reviewData.health_breakdown).map(([key, val]) => {
                      const maxVal = key === "budget_adherence" ? 40 : 30;
                      return (
                        <div key={key} className="rounded-xl bg-secondary/20 p-4">
                          <p className="text-xs text-muted-foreground capitalize mb-1">{key.replace(/_/g, " ")}</p>
                          <p className="text-2xl font-semibold">{val}/{maxVal}</p>
                          <div className="w-full h-2 bg-secondary rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-ruby via-topaz to-emerald rounded-full transition-all"
                                 style={{ width: `${(val / maxVal) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              <SectionCard eyebrow="Budget vs Actual" title="By category type" contentClassName="p-0">
                <div className="divide-y divide-border">
                  {Object.entries(reviewData.by_type || {}).map(([key, bt]) => {
                    const diff = bt.budgeted - bt.actual;
                    return (
                      <div key={key} className="flex items-center justify-between px-6 py-4">
                        <p className="font-medium capitalize">{bt.name}</p>
                        <div className="flex items-center gap-4 text-sm tabular-nums">
                          <span>£{bt.budgeted.toFixed(0)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className={bt.actual > bt.budgeted ? "text-ruby" : "text-emerald"}>£{bt.actual.toFixed(0)}</span>
                          <span className={`text-xs font-medium ${diff >= 0 ? "text-emerald" : "text-ruby"}`}>
                            {diff >= 0 ? "+" : ""}£{diff.toFixed(0)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              {reviewData.top_overspends?.length > 0 && (
                <SectionCard eyebrow="Overspends" title="Categories over budget" contentClassName="p-0">
                  <div className="divide-y divide-border">
                    {reviewData.top_overspends.map((os, i) => (
                      <div key={i} className="flex items-center justify-between px-6 py-3">
                        <div>
                          <p className="text-sm font-medium capitalize">{os.category}</p>
                          <p className="text-xs text-muted-foreground">{os.occasion} · {os.type.replace("_", " ")}</p>
                        </div>
                        <div className="text-right text-sm tabular-nums">
                          <p className="text-ruby">£{os.over_by.toFixed(0)} over</p>
                          <p className="text-xs text-muted-foreground">Budget: £{os.budgeted.toFixed(0)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {reviewData.previous_month && (
                <SectionCard eyebrow="Month over Month" title="Comparison with previous month">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-secondary/20 p-4">
                      <p className="text-xs text-muted-foreground">Income</p>
                      <p className="text-lg font-semibold text-emerald">£{reviewData.income.toFixed(0)}</p>
                      {reviewData.income > 0 && reviewData.previous_month.income > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {reviewData.income > reviewData.previous_month.income ? "↑" : "↓"} vs {reviewData.previous_month.month}
                        </p>
                      )}
                    </div>
                    <div className="rounded-xl bg-secondary/20 p-4">
                      <p className="text-xs text-muted-foreground">Spending</p>
                      <p className="text-lg font-semibold text-ruby">£{reviewData.expenses.toFixed(0)}</p>
                      {reviewData.expenses > 0 && reviewData.previous_month.expenses > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {reviewData.expenses < reviewData.previous_month.expenses ? "↓" : "↑"} vs {reviewData.previous_month.month}
                        </p>
                      )}
                    </div>
                  </div>
                </SectionCard>
              )}

              {reviewNarrative && (
                <SectionCard eyebrow="AI Review" title="Monthly analysis">
                  <div className="p-4 rounded-xl bg-secondary/20 border border-border">
                    {reviewNarrative.narrative && (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{reviewNarrative.narrative}</p>
                    )}
                    {reviewNarrative.highlights?.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="label-overline">Highlights</p>
                        {reviewNarrative.highlights.map((h, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <span className={h.type === "positive" ? "text-emerald" : h.type === "negative" ? "text-ruby" : "text-topaz"}>
                              {h.type === "positive" ? "✓" : h.type === "negative" ? "⚠" : "ℹ"}
                            </span>
                            <span>{h.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {reviewNarrative.month_grade && (
                      <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-topaz/10 border border-topaz/30">
                        <span className="text-sm font-medium">Grade: {reviewNarrative.month_grade}</span>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}
            </>
          )}

          {!reviewData && !reviewLoading && (
            <EmptyState icon={CalendarDays} title="No review yet" description="Select a month and generate your budget review." />
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

      {/* ── TAB: YOM TOV (Phase 2 enhanced) ─────────────────────────────── */}
      {activeTab === "yomtov" && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease-out]">
          {/* Auto-create button */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-topaz" />
                <p className="label-overline">Yom Tov Budgets</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleAutoCreateYomTov} disabled={autoCreating}
                        className={`btn-pill text-sm ${autoCreateResult ? "gradient-emerald text-white" : "border border-topaz text-topaz"}`}>
                  {autoCreating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Star className="h-4 w-4 mr-1" />}
                  {autoCreating ? "Creating…" : autoCreateResult ? "Re-create" : "Auto-create upcoming"}
                </button>
              </div>
            </div>

            {autoCreateResult && (
              <div className="mb-4 p-3 rounded-xl bg-emerald/5 border border-emerald/20 text-sm">
                <p className="font-medium text-emerald">{autoCreateResult.count} Yom Tov budgets created</p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {jewishHolidays.map(h => (
                <div key={h.holiday} className="rounded-xl border border-border p-4 hover:border-topaz transition-colors cursor-pointer" onClick={() => viewHoliday(h.holiday)}>
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{h.holiday}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-secondary">{h.month}</span>
                    </div>
                  </div>
                  <p className="text-2xl tracking-tight font-medium text-topaz mt-2">+{h.uplift_pct}% uplift</p>
                  <div className="flex items-center justify-between mt-3">
                    <button className="text-xs px-3 py-1 rounded-full border border-border hover:border-topaz hover:text-topaz">
                      {selectedHoliday === h.holiday ? "Close" : "Budget"}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleEstimateYomTov(h.holiday); }}
                            disabled={estimatingYomTov === h.holiday}
                            className="text-xs px-3 py-1 rounded-full border border-border hover:border-emerald hover:text-emerald">
                      {estimatingYomTov === h.holiday ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : <Sparkles className="h-3 w-3 inline mr-1" />}
                      AI Estimate
                    </button>
                  </div>
                  {yomTovEstimates[h.holiday]?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border space-y-1">
                      {yomTovEstimates[h.holiday].map((est, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="capitalize text-muted-foreground">{est.category}</span>
                          <span className="font-medium">£{est.estimated?.toFixed?.(0) || est.estimated_amount?.toFixed?.(0) || "0"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {renderHolidayDetail()}
        </div>
      )}

      {/* ── TAB: HOLIDAY (Phase 2 enhanced) ──────────────────────────────── */}
      {activeTab === "holiday" && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease-out]">
          {/* AI-powered holiday planner */}
          <div className="rounded-2xl border-2 border-topaz/20 bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Plane className="h-5 w-5 text-topaz" />
              <p className="label-overline">Plan a holiday</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div>
                <label className="label-overline">Holiday name</label>
                <input placeholder="Summer Trip 2026" value={holidayName}
                       onChange={e => setHolidayName(e.target.value)}
                       className="mt-1 w-full control-shell" />
              </div>
              <div>
                <label className="label-overline">Destination</label>
                <input placeholder="Spain, Italy, …" value={holidayDestination}
                       onChange={e => setHolidayDestination(e.target.value)}
                       className="mt-1 w-full control-shell" />
              </div>
              <div>
                <label className="label-overline">Start date</label>
                <input type="date" value={holidayStartDate}
                       onChange={e => setHolidayStartDate(e.target.value)}
                       className="mt-1 w-full control-shell" />
              </div>
              <div>
                <label className="label-overline">End date</label>
                <input type="date" value={holidayEndDate}
                       onChange={e => setHolidayEndDate(e.target.value)}
                       className="mt-1 w-full control-shell" />
              </div>
            </div>

            <button onClick={handleHolidayEstimate} disabled={estimatingHoliday || !holidayName.trim() || !holidayStartDate || !holidayEndDate}
                    className="btn-pill gradient-topaz text-white text-sm disabled:opacity-50">
              {estimatingHoliday ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {estimatingHoliday ? "Estimating…" : "AI — Estimate & Create"}
            </button>
          </div>

          {/* AI estimate result */}
          {holidayEstimate && (
            <div className="rounded-2xl border border-border bg-card p-6 animate-[fadeUp_0.3s_ease-out]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Plane className="h-4 w-4 text-topaz" />
                  <p className="font-medium">{holidayEstimate.name}</p>
                  <span className="text-2xl font-semibold text-topaz">£{holidayEstimate.total_estimated?.toFixed(0)}</span>
                </div>
                <button onClick={clearHolidayEstimate} className="text-xs px-3 py-1 rounded-full border border-border">Clear</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {holidayEstimate.categories?.map((cat, i) => (
                  <div key={i} className="rounded-xl bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground capitalize">{cat.name}</p>
                    <p className="text-lg font-semibold mt-1">£{cat.estimated?.toFixed(0)}</p>
                    {cat.rationale && <p className="text-xs text-muted-foreground mt-1">{cat.rationale}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing holiday budgets */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <p className="label-overline">Existing Holiday Budgets</p>
            </div>
            <div className="flex gap-2 mb-6">
              <input placeholder="Legacy holiday name" value={newSecularHoliday}
                     onChange={e => setNewSecularHoliday(e.target.value)}
                     className="h-10 flex-1 max-w-sm px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
              <button onClick={addSecularHoliday} className="btn-pill border border-emerald text-emerald text-sm">
                <Plus className="h-4 w-4 mr-1" /> Add Legacy
              </button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {secularHolidaysList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 col-span-full">No custom holidays yet.</p>
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

      {/* ── TAB: SIMCHA (Phase 3 enhanced) ──────────────────────────────── */}
      {activeTab === "simcha" && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease-out]">

          {/* Other Simcha creator */}
          <div className="rounded-2xl border-2 border-ruby/20 bg-card p-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-ruby" />
                <p className="text-lg tracking-tight font-medium">Simcha Planner</p>
              </div>
              <button onClick={() => { setShowSimchaForm(!showSimchaForm); setEditingSimcha(null); setSimchaForm({ name: "", event_date: "", estimated_amount: "", cat_hall: "", cat_catering: "", cat_music: "", cat_clothing: "", cat_gifts: "", cat_photography: "" }); }}
                      className="btn-pill gradient-topaz text-white text-sm">
                <Plus className="h-4 w-4 mr-1" /> New simcha
              </button>
            </div>

            {showSimchaForm && (
              <form onSubmit={createSimcha} className="mb-6 p-4 rounded-xl bg-secondary/20 border border-border space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="label-overline">Event name</label>
                    <input required placeholder="Bar Mitzvah, Bris, ..." value={simchaForm.name}
                           onChange={e => setSimchaForm({...simchaForm, name: e.target.value})}
                           className="mt-1 w-full control-shell" />
                  </div>
                  <div>
                    <label className="label-overline">Event date</label>
                    <input type="date" value={simchaForm.event_date}
                           onChange={e => setSimchaForm({...simchaForm, event_date: e.target.value})}
                           className="mt-1 w-full control-shell" />
                  </div>
                  <div>
                    <label className="label-overline">Total budget (£)</label>
                    <input type="number" value={simchaForm.estimated_amount}
                           onChange={e => setSimchaForm({...simchaForm, estimated_amount: e.target.value})}
                           placeholder="5000" className="mt-1 w-full control-shell" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 mb-2">Sub-category estimates (optional):</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {SIMCHA_CATS.map(cat => (
                    <div key={cat}>
                      <label className="label-overline capitalize">{cat}</label>
                      <input type="number" placeholder="£" value={simchaForm[`cat_${cat}`] || ""}
                             onChange={e => setSimchaForm({...simchaForm, [`cat_${cat}`]: e.target.value})}
                             className="mt-1 w-full control-shell" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="submit" className="btn-pill gradient-emerald text-white text-sm">
                    {editingSimcha ? "Update" : "Create simcha"}
                  </button>
                  <button type="button" onClick={() => { setShowSimchaForm(false); setEditingSimcha(null); }}
                          className="text-xs px-4 py-2 rounded-full border border-border">Cancel</button>
                </div>
              </form>
            )}

            {simchaOccasions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No other simcha occasions yet.</p>
            ) : (
              <div className="space-y-2">
                <p className="label-overline">Other Simcha Occasions</p>
                {simchaOccasions.map(occ => (
                  <div key={occ.id} className="flex items-center justify-between py-3 px-4 rounded-xl bg-secondary/20 border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{occ.name}</p>
                      <p className="text-xs text-muted-foreground">
                        £{occ.estimated_amount?.toFixed(0)}
                        {occ.event_date && <> · {occ.event_date.slice(0, 10)}</>}
                        {occ.notes && <> · {occ.notes}</>}
                      </p>
                      {occ.categories?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {occ.categories.map(c => (
                            <span key={c.name} className="text-xs px-2 py-0.5 rounded-full bg-secondary/40 capitalize">
                              {c.name}: £{c.budgeted?.toFixed(0)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 ml-3">
                      <button onClick={() => editSimcha(occ)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteSimcha(occ.id)} className="p-2 rounded-lg hover:bg-secondary text-ruby"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chasuna (wedding) section — preserved */}
          <div className="rounded-2xl border-2 border-topaz/30 bg-card p-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-ruby" />
                <p className="text-lg tracking-tight font-medium">Chasuna / Wedding Planner</p>
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

      {/* ── TAB: OTHER (Phase 3) ────────────────────────────────────────── */}
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
              <div className="w-full sm:w-auto">
                <label className="label-overline">Categories (comma-separated, optional)</label>
                <input value={otherForm.categories}
                       onChange={e => setOtherForm({...otherForm, categories: e.target.value})}
                       placeholder="venue, catering, decor" className="mt-1 w-full control-shell" />
              </div>
              <div className="w-full">
                <label className="label-overline">Notes</label>
                <textarea value={otherForm.notes}
                  onChange={e => setOtherForm({...otherForm, notes: e.target.value})}
                  placeholder="Optional details about this expense" className="mt-1 w-full control-shell resize-none h-20" />
              </div>
              <div className="flex gap-2 w-full">
                <button className="btn-pill gradient-emerald text-white text-sm">
                  <Plus className="h-4 w-4 mr-2" /> Add
                </button>
                {editingOther && (
                  <button type="button" onClick={() => { setEditingOther(null); setOtherForm({ name: "", estimated_amount: "", event_date: "", notes: "", categories: "" }); }}
                          className="text-xs px-4 py-2 rounded-full border border-border">Cancel</button>
                )}
              </div>
            </form>
          </SectionCard>

          <div className="space-y-3">
            <p className="label-overline">Saved one-time budgets</p>
            {otherOccasions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No other budgets yet.</p>
            ) : (
              otherOccasions.map(occ => (
                <div key={occ.id} className="flex items-center justify-between py-3 px-4 rounded-xl border border-border bg-card">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{occ.name}</p>
                    <p className="text-xs text-muted-foreground">
                      £{occ.estimated_amount?.toFixed(0) || "0"}
                      {occ.event_date && <> · {occ.event_date.slice(0, 10)}</>}
                      {occ.notes && <> · {occ.notes}</>}
                    </p>
                    {occ.categories?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {occ.categories.map(c => (
                          <span key={c.name} className="text-xs px-2 py-0.5 rounded-full bg-secondary/40 capitalize">
                            {c.name}: £{c.budgeted?.toFixed(0)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 ml-3">
                    <button onClick={() => { setEditingOther(occ.id); setOtherForm({ name: occ.name, estimated_amount: String(occ.estimated_amount || ""), event_date: occ.event_date ? occ.event_date.slice(0, 10) : "", notes: occ.notes || "", categories: (occ.categories || []).map(c => c.name).join(", ") }); }}
                            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => deleteOther(occ.id)} className="p-2 rounded-lg hover:bg-secondary text-ruby"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
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

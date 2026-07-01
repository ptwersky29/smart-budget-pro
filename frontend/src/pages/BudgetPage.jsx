import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseISO, isBefore, getDaysInMonth, getDate } from "date-fns";
import {
  RefreshCw, Wallet, ShoppingCart, Calendar, Plus, Pencil, Trash2,
  Check, X, Target, TrendingDown, ChevronDown, ChevronUp,
  Sparkles, TrendingUp, Download, Search, Copy, MoreHorizontal,
  Lock, PiggyBank, Home, AlertCircle,
} from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { withUndo } from "../lib/undo";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageHeader } from "../components/ui/layout";
import ConfirmModal from "../components/ui/ConfirmModal";
import CategoryCombobox from "../components/CategoryCombobox";
import MonthPicker, { YIDDISH } from "../components/MonthPicker";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";

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

const PIE_COLORS = ["#30a46c", "#e8a838", "#60a5fa", "#a78bfa", "#f472b6", "#fb923c", "#34d399", "#818cf8", "#f87171", "#2dd4bf", "#fbbf24", "#e879f9"];

const SECTION_ICONS = {
  income: TrendingUp,
  fixed: Lock,
  variable: ShoppingCart,
  savings: PiggyBank,
  other: Home,
};

function ProgressRing({ pct, size = 40, stroke = 3.5, color }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${Math.round(pct)}% used`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/30" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color || (pct >= 100 ? "#e5484d" : "#30a46c")} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.5s ease" }} />
    </svg>
  );
}

const BudgetCard = React.memo(({ budget, isCurrentMonth, currentDay, monthElapsedPct, daysInMonth, editingId, form, cancelEdit, handleUpdate, startEdit, bulkSelected, setBulkSelected, setConfirmDelete }) => {
  const pct = budget.progress_pct || 0;
  const over = pct >= 100;
  const isEditing = editingId === budget.budget_id;
  let paceMessage = null;
  let paceClass = "";
  if (isCurrentMonth && currentDay >= 3 && monthElapsedPct > 0 && budget.limit > 0 && daysInMonth > 0) {
    const projectedSpend = budget.spent / monthElapsedPct;
    const projectedDeficit = projectedSpend - budget.limit;
    if (projectedDeficit > 5 && !over) {
      paceMessage = `Pacing £${Math.round(projectedDeficit)} over`;
      paceClass = "text-ruby";
    } else if (projectedDeficit < -5 && pct < 100) {
      paceMessage = `Pacing £${Math.abs(Math.round(projectedDeficit))} under`;
      paceClass = "text-emerald";
    }
  }
  if (isEditing) {
    return (
      <div key={budget.budget_id} className="rounded-xl border border-border bg-card/50 backdrop-blur-md p-3 space-y-2">
        <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Edit category" className="w-full text-xs rounded border border-border bg-transparent px-2 py-1.5 focus:outline-none focus:border-ring" />
        <input type="number" step="0.01" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} aria-label="Edit limit" className="w-full text-xs rounded border border-border bg-transparent px-2 py-1.5 focus:outline-none focus:border-ring" />
        <div className="flex gap-2 justify-end">
          <button onClick={cancelEdit} className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={() => handleUpdate(budget.budget_id)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald text-white hover:bg-emerald/90 transition-colors">Save</button>
        </div>
      </div>
    );
  }
  const isSelected = bulkSelected.has(budget.budget_id);
  const statusLabel = over ? "Over" : pct >= 80 ? "Nearing" : "On track";
  return (
    <div key={budget.budget_id} className={`rounded-xl border ${isSelected ? "border-emerald bg-emerald/[0.03] ring-1 ring-emerald/30" : "border-border/50 bg-background/40"} backdrop-blur-xl p-3 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-border transition-all duration-300 relative overflow-hidden border-l-[3px] ${over ? "border-l-ruby" : pct >= 80 ? "border-l-topaz" : "border-l-emerald"}`}>
      <div className="flex items-start gap-2.5 mb-2">
        <input type="checkbox" checked={isSelected} onChange={() => {
          const next = new Set(bulkSelected);
          if (isSelected) next.delete(budget.budget_id); else next.add(budget.budget_id);
          setBulkSelected(next);
        }} className="shrink-0 w-4 h-4 rounded border-border text-emerald focus:ring-emerald/30 mt-0.5" />
        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${over ? "from-ruby to-ruby/70" : pct >= 80 ? "from-topaz to-topaz/70" : "from-emerald to-emerald/70"} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
          {budget.category[0].toUpperCase()}
        </div>
        <h3 className="text-sm font-semibold capitalize truncate leading-tight tracking-tight flex-1 pt-0.5">{budget.category}</h3>
        <div className="flex items-center gap-1 mt-1">
          <span className={`w-1.5 h-1.5 rounded-full ${over ? "bg-ruby" : pct >= 80 ? "bg-topaz" : "bg-emerald"} shrink-0`} />
          <span className={`text-[10px] font-semibold ${over ? "text-ruby" : pct >= 80 ? "text-topaz" : "text-emerald"} hidden sm:inline`}>{statusLabel}</span>
        </div>
        <div className="flex gap-0.5">
          <button onClick={() => startEdit(budget)} className="p-1.5 rounded-lg bg-secondary/30 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all" aria-label={`Edit ${budget.category}`}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setConfirmDelete({ type: 'budget', id: budget.budget_id })} className="p-1.5 rounded-lg bg-transparent hover:bg-ruby/10 text-muted-foreground hover:text-ruby transition-all" aria-label={`Delete ${budget.category}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="pl-9 space-y-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-2xl font-bold tabular-nums tracking-tight ${over ? "text-ruby" : "text-foreground"}`}>
            £{budget.spent}
          </span>
          <span className="text-xs text-muted-foreground font-medium">of £{budget.limit}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold tabular-nums ${budget.remaining >= 0 ? "text-emerald" : "text-ruby"}`}>
            £{budget.remaining >= 0 ? `${budget.remaining} left` : `${Math.abs(budget.remaining)} over`}
          </span>
          {paceMessage && (
            <span className={`text-[10px] font-medium ${paceClass}`}>
              · {paceMessage}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2.5 rounded-full bg-secondary/50 overflow-hidden shadow-inner">
            <div className={`h-full rounded-full ${over ? "bg-ruby" : "bg-gradient-to-r from-emerald to-topaz"}`} style={{ width: `${Math.min(100, pct)}%`, transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)" }} />
          </div>
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
        </div>
      </div>
    </div>
  );
});

const EventGroupCard = React.memo(({ group, setConfirmDelete, fetchData }) => {
  const totalLimit = group.total_limit || 0;
  const totalSpent = group.total_spent || 0;
  const pct = totalLimit ? Math.min(100, (totalSpent / totalLimit) * 100) : 0;
  const over = pct >= 100;
  const [showAdd, setShowAdd] = useState(false);
  const parsedDate = group.event_date ? parseISO(group.event_date) : null;
  return (
    <div key={group.event_group_id} className={`rounded-xl border border-border/50 bg-background/40 backdrop-blur-xl p-3 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-border transition-all duration-300 relative overflow-hidden border-l-[3px] ${over ? "border-l-ruby" : pct >= 80 ? "border-l-topaz" : "border-l-emerald"}`}>
      <div className="flex items-start gap-2.5 mb-2">
        {parsedDate ? (
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-muted-foreground/30 to-muted-foreground/10 flex flex-col items-center justify-center text-[8px] font-bold text-muted-foreground leading-tight shrink-0 shadow-sm">
            <span>{parsedDate.toLocaleDateString("en-GB", { month: "short" })}</span>
            <span className="text-[11px]">{parsedDate.getDate()}</span>
          </div>
        ) : (
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${over ? "from-ruby to-ruby/70" : pct >= 80 ? "from-topaz to-topaz/70" : "from-emerald to-emerald/70"} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
            <Calendar className="h-3.5 w-3.5" />
          </div>
        )}
        <h3 className="text-sm font-semibold truncate leading-tight flex-1 pt-0.5">{group.event_group_name || group.category}</h3>
        <div className="flex items-center gap-1 mt-1">
          <span className={`w-1.5 h-1.5 rounded-full ${over ? "bg-ruby" : pct >= 80 ? "bg-topaz" : "bg-emerald"} shrink-0`} />
          <span className={`text-[10px] font-semibold ${over ? "text-ruby" : pct >= 80 ? "text-topaz" : "text-emerald"} hidden sm:inline`}>{over ? "Over" : pct >= 80 ? "Nearing" : "On track"}</span>
        </div>
        <button onClick={() => setConfirmDelete({ type: 'group', id: group.event_group_id })} className="p-1.5 rounded-lg bg-transparent hover:bg-ruby/10 text-muted-foreground hover:text-ruby transition-all shrink-0" aria-label={`Delete event ${group.event_group_name}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="pl-9 space-y-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-2xl font-bold tabular-nums tracking-tight ${over ? "text-ruby" : "text-foreground"}`}>
            £{totalSpent.toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground font-medium">of £{totalLimit.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2.5 rounded-full bg-secondary/50 overflow-hidden shadow-inner">
            <div className={`h-full rounded-full ${over ? "bg-ruby" : "bg-gradient-to-r from-emerald to-topaz"}`} style={{ width: `${Math.min(100, pct)}%`, transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)" }} />
          </div>
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
        </div>
      </div>
      {group.items && group.items.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/40 space-y-0.5 pl-9">
          {group.items.map((item) => {
            const itemPct = item.limit ? Math.min(100, (item.spent / item.limit) * 100) : 0;
            return (
              <div key={item.budget_id} className="flex items-center gap-2 text-[11px] py-1">
                <div className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
                <span className="flex-1 truncate text-muted-foreground">{item.category}</span>
                <span className="tabular-nums text-muted-foreground font-medium">£{item.spent.toFixed(2)}</span>
                <div className="w-12 h-1 rounded-full bg-muted/40 overflow-hidden shrink-0">
                  <div className={`h-full rounded-full ${itemPct >= 100 ? "bg-ruby" : "bg-gradient-to-r from-emerald to-topaz"}`} style={{ width: `${Math.min(100, itemPct)}%` }} />
                </div>
                <button onClick={() => setConfirmDelete({ type: 'budget', id: item.budget_id })} className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-ruby transition-colors" aria-label={`Remove ${item.category} from event`}><X className="h-3 w-3" /></button>
              </div>
            );
          })}
        </div>
      )}
      <div className={group.items && group.items.length > 0 ? "mt-2" : "mt-2 pl-9"}>
        {showAdd ? (
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
                event_date: group.event_date,
                event_group_id: group.event_group_id,
                event_group_name: group.event_group_name,
              });
              toast.success("Item added");
              input.value = ""; amt.value = "";
              setShowAdd(false);
              await fetchData();
            } catch { toast.error("Could not add item"); }
          }} className="flex items-end gap-1.5">
            <div className="flex-1">
              <input name="newItemCat" placeholder="Item name" aria-label="New item category" className="w-full h-7 rounded bg-secondary/30 border border-transparent px-2 text-[11px] placeholder:text-muted-foreground focus:border-ring focus:outline-none" />
            </div>
            <div className="w-16">
              <input name="newItemAmt" type="number" step="0.01" min="0.01" placeholder="£0" aria-label="New item amount" className="w-full h-7 rounded bg-secondary/30 border border-transparent px-2 text-[11px] text-right placeholder:text-muted-foreground focus:border-ring focus:outline-none" />
            </div>
            <button type="submit" className="h-7 w-7 rounded bg-emerald text-white hover:bg-emerald/90 flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setShowAdd(false)} className="h-7 px-2 rounded bg-secondary text-muted-foreground hover:text-foreground text-[11px]">Cancel</button>
          </form>
        ) : (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1.5 rounded-lg hover:bg-secondary/50">
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
        )}
      </div>
    </div>
  );
});

export default React.memo(function BudgetPage() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    let id = setInterval(() => {
      setNow((prev) => {
        const next = new Date();
        return prev.getDate() === next.getDate() && prev.getMonth() === next.getMonth() && prev.getFullYear() === next.getFullYear() ? prev : next;
      });
    }, 60000);
    return () => clearInterval(id);
  }, []);
  const [month, setMonth] = useState(fmtMonth(now.getFullYear(), now.getMonth() + 1));
  const [budgets, setBudgets] = useState([]);
  const budgetsRef = useRef(budgets);
  budgetsRef.current = budgets;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'budget'|'group', id }
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [allCats, setAllCats] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addTab, setAddTab] = useState("expense");
  const [form, setForm] = useState({ category: "", limit: "", budget_type: "everyday", event_date: "", event_group_id: "", event_group_name: "" });
  const [quickForm, setQuickForm] = useState({ amount: "", description: "", category: "", showDesc: false });
  const [budgetAdded, setBudgetAdded] = useState(false);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [applyingInsight, setApplyingInsight] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [copying, setCopying] = useState(false);
  const [eventGroups, setEventGroups] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState("progress");
  const [sortOrder, setSortOrder] = useState("desc");
  const [categoryHierarchy, setCategoryHierarchy] = useState({});
  const [hebrewMonths, setHebrewMonths] = useState([]);
  const [selectedHebrewMonth, setSelectedHebrewMonth] = useState(null);
  const [categorySpend, setCategorySpend] = useState([]);

  useEffect(() => {
    api.get("/jewish/hebcal/months")
      .then(({ data }) => {
        const ms = data.months || [];
        setHebrewMonths(ms);
        const current = ms.find((m) => m.is_current);
        if (current) setSelectedHebrewMonth(current);
      })
      .catch(() => { console.warn("[budgets] failed to load Hebrew months"); });
  }, []);

  const currentHebrewMonth = selectedHebrewMonth;

  const gregMonth = currentHebrewMonth ? currentHebrewMonth.gregorian_start.slice(0, 7) : month;
  const { year, month: mNum } = parseMonth(gregMonth);
  const monthLabel = mNum >= 1 && mNum <= 12 ? `${MONTH_NAMES[mNum - 1]} ${year}` : gregMonth;
  const isCurrentMonth = currentHebrewMonth ? currentHebrewMonth.is_current : month === fmtMonth(now.getFullYear(), now.getMonth() + 1);
  const daysInMonth = useMemo(() => getDaysInMonth(new Date(year, mNum - 1)), [year, mNum]);

  const hebrewLabel = currentHebrewMonth ? (
    <span>
      <span dir="rtl" lang="he" className="inline-block">{YIDDISH[currentHebrewMonth.month_name] || currentHebrewMonth.month_name}</span>
      {" "}{currentHebrewMonth.hebrew_year}
    </span>
  ) : null;

  const monthLabelWithHebrew = currentHebrewMonth ? (
    <span className="inline-flex items-center gap-1.5">
      {isCurrentMonth && <span className="h-2 w-2 rounded-full bg-emerald animate-pulse shrink-0" />}
      <span className="text-xs font-normal text-muted-foreground mr-1">{monthLabel} ·</span>
      {hebrewLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5">
      {isCurrentMonth && <span className="h-2 w-2 rounded-full bg-emerald animate-pulse shrink-0" />}
      {monthLabel}
    </span>
  );
  const currentDay = isCurrentMonth ? getDate(now) : daysInMonth;
  const monthElapsedPct = daysInMonth ? currentDay / daysInMonth : 1;

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
    const totalRemaining = budgets.reduce((s, b) => s + (Number(b.remaining) || 0), 0);
    const overCount = budgets.filter((b) => (b.progress_pct || 0) >= 100).length;
    return { count: budgets.length, totalPlanned, totalSpent, totalRemaining, overCount };
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
    const sorted = [...items].sort((a, b) => {
      let cmp = 0;
      if (sortOption === "name") cmp = a.category.localeCompare(b.category);
      else if (sortOption === "limit") cmp = (Number(a.limit) || 0) - (Number(b.limit) || 0);
      else if (sortOption === "spent") cmp = (Number(a.spent) || 0) - (Number(b.spent) || 0);
      else if (sortOption === "remaining") cmp = (Number(a.remaining) || 0) - (Number(b.remaining) || 0);
      else if (sortOption === "progress") cmp = (Number(a.progress_pct) || 0) - (Number(b.progress_pct) || 0);
      return sortOrder === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [everyday, searchQuery, sortOption, sortOrder]);

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

  const unbudgetedCategories = useMemo(() => {
    if (!categorySpend.length) return [];
    const budgetedCats = new Set(budgets.map((b) => b.category.toLowerCase().trim()));
    return categorySpend
      .filter((c) => c.name && c.value > 0 && !budgetedCats.has(c.name.toLowerCase().trim()))
      .sort((a, b) => b.value - a.value);
  }, [categorySpend, budgets]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let params;
      if (currentHebrewMonth) {
        params = { date_from: currentHebrewMonth.gregorian_start, date_to: currentHebrewMonth.gregorian_end };
      } else {
        params = { month };
      }
      const { data } = await api.get("/budgets", { params });
      setBudgets(data.budgets || []);
      setEventGroups(data.event_groups || {});
      setLoadError(null);
      // Fetch category spend data for unbudgeted detection
      const overviewParams = currentHebrewMonth
        ? { date_from: currentHebrewMonth.gregorian_start, date_to: currentHebrewMonth.gregorian_end }
        : { date_from: `${month}-01`, date_to: `${month}-${getDaysInMonth(new Date(parseInt(month.slice(0, 4), 10), parseInt(month.slice(5, 7), 10) - 1))}` };
      api.get("/dashboard/overview", { params: overviewParams })
        .then((res) => setCategorySpend(res.data.categories || []))
        .catch(() => {});
    } catch (err) {
      setLoadError(err.response?.data?.detail || "Failed to load budgets");
    } finally {
      setLoading(false);
    }
  }, [month, currentHebrewMonth]);

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await api.get("/categories");
      setAllCats(data.categories || []);
      setCategoryHierarchy(data.hierarchy || {});
    } catch { console.warn("[budgets] failed to load categories"); }
  }, []);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const { data } = await api.get("/budgets/insights");
      setInsights(data.insights || []);
    } catch { console.warn("[budgets] failed to load insights"); } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchCategories(); }, []);
  useEffect(() => { fetchInsights(); }, []);

  const resetForm = () => setForm({ category: "", limit: "", budget_type: "everyday", event_date: "", event_group_id: "", event_group_name: "" });
  const resetQuickForm = () => setQuickForm({ amount: "", description: "", category: "", showDesc: false });
  const openAddBudget = (budgetType = "everyday", category = "") => {
    resetForm();
    setAddTab("budget");
    setForm((prev) => ({ ...prev, budget_type: budgetType, category }));
    setShowAdd(true);
  };
  const openAddExpense = () => {
    resetQuickForm();
    setAddTab("expense");
    setShowAdd(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.category.trim() || !form.limit) { toast.error("Enter a category and amount"); return; }
    const cat = form.category.toLowerCase().trim();
    const dup = budgets.find((b) => {
      if (b.category.toLowerCase().trim() !== cat) return false;
      if (form.budget_type === "event") return b.event_group_id === form.event_group_id;
      return (b.budget_type || "everyday") !== "event";
    });
    if (dup) { toast.error(`Budget for "${cat}" already exists`); return; }
    const payload = {
      category: cat,
      limit: parseFloat(form.limit),
      period: "monthly",
      budget_type: form.budget_type,
      month: selectedHebrewMonth ? selectedHebrewMonth.gregorian_start.slice(0, 7) : month,
    };
    if (form.budget_type === "event") {
      if (form.event_date) payload.event_date = form.event_date;
      if (form.event_group_id) payload.event_group_id = form.event_group_id;
      if (form.event_group_name) payload.event_group_name = form.event_group_name.trim();
      delete payload.month;
    }
    const optimisticBudget = { budget_id: `optimistic-${Date.now()}`, ...payload, spent: 0, progress_pct: 0 };
    setBudgets(prev => [...prev, optimisticBudget]);
    try {
      await api.post("/budgets", payload);
      setBudgetAdded(form.budget_type !== "event");
      setForm((prev) => ({ ...prev, category: "", limit: "" }));
      toast.success(form.budget_type === "event" ? "Item added to event" : "Budget added");
      await fetchData();
    } catch (err) {
      setBudgets(prev => prev.filter(b => b.budget_id !== optimisticBudget.budget_id));
      toast.error(err.response?.data?.detail || "Could not save");
    }
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
      const existing = budgetsRef.current.find((b) => b.category === insight.category);
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
    const payload = { category: form.category.toLowerCase().trim(), limit: parseFloat(form.limit) };
    if (form.budget_type === "event") payload.event_date = form.event_date || null;
    const old = budgetsRef.current.find(b => b.budget_id === id);
    setBudgets(prev => prev.map(b => b.budget_id === id ? { ...b, ...payload } : b));
    cancelEdit();
    withUndo({
      action: () => api.patch(`/budgets/${id}`, payload),
      undo: async () => {
        if (old) setBudgets(prev => prev.map(b => b.budget_id === id ? old : b));
        await fetchData();
      },
      onError: () => { if (old) setBudgets(prev => prev.map(b => b.budget_id === id ? old : b)); },
      successMsg: "Budget updated",
      errorMsg: "Could not update",
    });
  };

  const handleDelete = async (item) => {
    if (item.type === "group") {
      setConfirmDelete(null);
      try {
        await api.delete(`/budgets/group/${item.id}`);
        toast.success("Event deleted");
        await fetchData();
      } catch { toast.error("Could not delete event"); }
      return;
    }
    const old = budgetsRef.current.find(b => b.budget_id === item.id);
    if (!old) return;
    setBudgets(prev => prev.filter(b => b.budget_id !== item.id));
    setConfirmDelete(null);
    withUndo({
      action: () => api.delete(`/budgets/${item.id}`),
      undo: async () => {
        setBudgets(prev => [...prev, old]);
        await api.post("/budgets", old);
      },
      onError: () => setBudgets(prev => [...prev, old]),
      successMsg: "Budget removed",
      errorMsg: "Could not delete",
    });
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const { data } = await api.post("/budgets/seed-defaults");
      toast.success(data.message || "Default budgets loaded");
      await fetchData();
      await fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not load defaults");
    } finally {
      setSeeding(false);
    }
  };

  const handleCopyPreviousMonth = async () => {
    setCopying(true);
    try {
      let prevBudgets;
      const currentMonthStr = selectedHebrewMonth ? selectedHebrewMonth.gregorian_start.slice(0, 7) : month;
      if (selectedHebrewMonth && hebrewMonths.length) {
        const idx = hebrewMonths.findIndex((m) => m.hebrew_month === selectedHebrewMonth.hebrew_month && m.hebrew_year === selectedHebrewMonth.hebrew_year);
        if (idx <= 0) { toast.info("No previous month to copy from"); setCopying(false); return; }
        const prevMonth = hebrewMonths[idx - 1];
        const { data } = await api.get("/budgets", {
          params: { date_from: prevMonth.gregorian_start, date_to: prevMonth.gregorian_end }
        });
        prevBudgets = (data.budgets || []).filter((b) => (b.budget_type || "everyday") !== "event");
      } else {
        const prevMonth = addMonth(month, -1);
        const { data } = await api.get("/budgets", { params: { month: prevMonth } });
        prevBudgets = (data.budgets || []).filter((b) => (b.budget_type || "everyday") !== "event");
      }
      let copied = 0;
      let errors = 0;
      for (const b of prevBudgets) {
        const existing = budgetsRef.current.find((eb) => eb.category === b.category);
        if (existing) continue;
        try {
          await api.post("/budgets", {
            category: b.category,
            limit: Number(b.limit),
            period: "monthly",
            budget_type: "everyday",
            month: currentMonthStr,
          });
          copied++;
        } catch {
          errors++;
        }
      }
      if (copied > 0) {
        toast.success(errors > 0 ? `Copied ${copied} budget(s), ${errors} failed` : `Copied ${copied} budget(s)`);
        await fetchData();
      } else if (errors > 0) {
        toast.error("Could not copy any budgets");
      } else {
        toast.info("No budgets to copy from previous month");
      }
    } catch {
      toast.error("Could not copy budgets");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="space-y-5">

      {/* Dashboard overview */}
      <div className="sticky top-0 z-20 -mx-4 px-4 sm:-mx-8 sm:px-8 bg-background/70 backdrop-blur-xl border-b border-border/40 pb-4 pt-2 shadow-sm transition-all duration-300">
        <PageHeader eyebrow="Budgets" title="Budgets" titleClassName="text-2xl" hideDivider>
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 mt-2 pt-2">
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
                <MonthPicker
                  label={monthLabelWithHebrew}
                  onPrev={() => {
                    if (selectedHebrewMonth && hebrewMonths.length) {
                      const idx = hebrewMonths.findIndex((m) => m.hebrew_month === selectedHebrewMonth.hebrew_month && m.hebrew_year === selectedHebrewMonth.hebrew_year);
                      if (idx > 0) setSelectedHebrewMonth(hebrewMonths[idx - 1]);
                    } else {
                      setMonth(addMonth(month, -1));
                    }
                  }}
                  onNext={() => {
                    if (selectedHebrewMonth && hebrewMonths.length) {
                      const idx = hebrewMonths.findIndex((m) => m.hebrew_month === selectedHebrewMonth.hebrew_month && m.hebrew_year === selectedHebrewMonth.hebrew_year);
                      if (idx < hebrewMonths.length - 1) setSelectedHebrewMonth(hebrewMonths[idx + 1]);
                    } else {
                      setMonth(addMonth(month, 1));
                    }
                  }}
                  onToday={() => {
                    const current = hebrewMonths.find((m) => m.is_current);
                    if (current) setSelectedHebrewMonth(current);
                    else setMonth(fmtMonth(now.getFullYear(), now.getMonth() + 1));
                  }}
                  isToday={isCurrentMonth}
                />
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
            <div className="relative w-full sm:w-36 lg:w-44 group/search">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none transition-transform duration-200 group-focus-within/search:scale-110" />
              <input type="search" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search budgets"
                className="w-full h-8 pl-8 pr-3 rounded-full bg-secondary/40 border border-transparent text-xs placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/30 focus:outline-none transition-all" />
            </div>
            <div className="flex items-center gap-0.5">
              <select value={sortOption} onChange={(e) => setSortOption(e.target.value)} aria-label="Sort budgets"
                className="h-8 px-2 rounded-lg bg-secondary/50 border border-border/50 text-[11px] font-medium focus:outline-none focus:border-ring">
                <option value="progress">Progress</option>
                <option value="name">Name</option>
                <option value="limit">Limit</option>
                <option value="spent">Spent</option>
                <option value="remaining">Remaining</option>
              </select>
              <button onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                className="h-8 w-7 grid place-items-center rounded-lg bg-secondary/50 border border-border/50 hover:bg-secondary/80 transition-colors" aria-label={`Sort ${sortOrder === "desc" ? "ascending" : "descending"}`}>
                {sortOrder === "desc" ? <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" /> : <ChevronUp className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
              </button>
            </div>
            <Button variant="primary" size="sm" onClick={() => openAddBudget("everyday")}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-8 w-8 rounded-full grid place-items-center text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-all duration-200">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleCopyPreviousMonth} disabled={copying}>
                  <Copy className={`h-4 w-4 mr-2 ${copying ? "animate-pulse" : ""}`} /> {copying ? "Copying..." : "Copy Previous"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSeedDefaults} disabled={seeding || loading}>
                  <Download className={`h-4 w-4 mr-2 ${seeding ? "animate-pulse" : ""}`} /> {seeding ? "Loading..." : "Load Defaults"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={fetchData} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        </PageHeader>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10">
        <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-background/80 to-emerald/[0.02] backdrop-blur-sm p-4 text-center hover:scale-[1.02] hover:shadow-md transition-all duration-300">
          <div className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-full bg-emerald/10 text-emerald"><Wallet className="h-4 w-4" /></div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Budgets</p>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight">{summary.count}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-background/80 to-primary/[0.02] backdrop-blur-sm p-4 text-center hover:scale-[1.02] hover:shadow-md transition-all duration-300">
          <div className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary"><Target className="h-4 w-4" /></div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Budgeted</p>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">£{summary.totalPlanned.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-background/80 to-ruby/[0.02] backdrop-blur-sm p-4 text-center hover:scale-[1.02] hover:shadow-md transition-all duration-300">
          <div className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-full bg-ruby/10 text-ruby"><TrendingDown className="h-4 w-4" /></div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Spent</p>
          <p className={`text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${summary.overCount > 0 ? "text-ruby" : "text-emerald"}`}>£{summary.totalSpent.toLocaleString()}</p>
        </div>
        <div className={`rounded-2xl border border-border/50 bg-gradient-to-br from-background/80 to-emerald/[0.02] backdrop-blur-sm p-4 text-center hover:scale-[1.02] hover:shadow-md transition-all duration-300 ${summary.totalRemaining < 0 ? "border-ruby/20" : ""}`}>
          <div className={`mx-auto mb-2 grid h-8 w-8 place-items-center rounded-full ${summary.totalRemaining < 0 ? "bg-ruby/10 text-ruby" : "bg-emerald/10 text-emerald"}`}><PiggyBank className="h-4 w-4" /></div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Remaining</p>
          <p className={`text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${summary.totalRemaining < 0 ? "text-ruby" : "text-emerald"}`}>£{Math.abs(summary.totalRemaining).toLocaleString()}</p>
        </div>
      </div>

      {/* Spend breakdown pie chart */}
      {!loading && categorySpend.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-muted/70"><TrendingDown className="h-3 w-3 text-muted-foreground/80" /></span>
              Spend breakdown
            </h3>
            <span className="text-xs text-muted-foreground">{categorySpend.length} categories</span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative shrink-0" style={{ width: 220, height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categorySpend} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} strokeWidth={0}>
                    {categorySpend.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "13px" }}
                    labelStyle={{ fontWeight: 600 }}
                    formatter={(value) => [`£${Number(value).toLocaleString()}`, "Spent"]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-2xl font-bold tabular-nums tracking-tight">£{categorySpend.reduce((s, c) => s + (c.value || 0), 0).toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total spent</p>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-full">
              {categorySpend.slice(0, 8).map((cat, i) => (
                <div key={cat.name} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg hover:bg-secondary/50 transition-colors">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="flex-1 truncate capitalize text-muted-foreground">{cat.name}</span>
                  <span className="font-semibold tabular-nums text-foreground">£{Number(cat.value).toLocaleString()}</span>
                </div>
              ))}
              {categorySpend.length > 8 && (
                <div className="text-[11px] text-muted-foreground text-center col-span-2 pt-1">+{categorySpend.length - 8} more</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted/40 animate-pulse" />)}
        </div>
      )}

      {/* Error */}
      {!loading && loadError && (
        <div className="rounded-2xl border border-ruby/20 bg-ruby/5 p-8 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-ruby/10 text-ruby">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-medium">Failed to load budgets</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-5">{loadError}</p>
          <Button variant="primary" size="pill" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Try again
          </Button>
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
            <Button variant="primary" size="pillSm" className="bg-ruby hover:bg-ruby/90" onClick={() => setConfirmBulkDelete(true)}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete {bulkSelected.size}
            </Button>
          </div>
        </div>
      )}

      {!loading && !loadError && budgets.length === 0 && (
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

      {!loading && !loadError && budgets.length > 0 && (
        <>
          {/* Budget Sections */}
          <section>
            {Object.entries(sectionsForDisplay).length === 0 && upcomingEventGroups.length === 0 && searchQuery.trim() && (
              <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
                <p className="text-sm text-muted-foreground">No budgets match "{searchQuery}"</p>
              </div>
            )}
            {Object.entries(sectionsForDisplay).map(([section, items]) => {
              const SecIcon = SECTION_ICONS[section.toLowerCase()] || Home;
              const totalRemaining = items.reduce((s, b) => s + Number(b.remaining || 0), 0);
              return (
              <div key={section} className="mb-5">
                <div className="sticky top-[115px] z-10 flex items-center justify-between mb-3 bg-gradient-to-r from-secondary/70 via-secondary/40 to-transparent backdrop-blur-md px-4 py-2 rounded-xl border border-border/50 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-md bg-muted/70"><SecIcon className="h-3 w-3 text-muted-foreground/80" /></span>
                    {section}
                    <span className="text-[10px] font-normal text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded-full">
                      {items.length} · £{items.reduce((s, b) => s + Number(b.limit || 0), 0).toFixed(0)}
                    </span>
                  </h3>
                  <span className={`text-[10px] tabular-nums font-medium ${totalRemaining < 0 ? "text-ruby" : "text-emerald"}`}>
                    £{totalRemaining >= 0 ? `${totalRemaining} left` : `${Math.abs(totalRemaining)} over`}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((b) => <BudgetCard key={b.budget_id} budget={b} isCurrentMonth={isCurrentMonth} currentDay={currentDay} monthElapsedPct={monthElapsedPct} daysInMonth={daysInMonth} editingId={editingId} form={form} cancelEdit={cancelEdit} handleUpdate={handleUpdate} startEdit={startEdit} bulkSelected={bulkSelected} setBulkSelected={setBulkSelected} setConfirmDelete={setConfirmDelete} />)}
                  <button onClick={() => openAddBudget("everyday")}
                    className="rounded-xl border-2 border-dashed border-border/40 hover:border-emerald/40 hover:bg-emerald/5 hover:text-emerald hover:scale-[1.02] active:scale-[0.98] text-muted-foreground/50 transition-all duration-200 flex flex-col items-center justify-center p-3 w-full group/add">
                    <Plus className="h-5 w-5 mb-1.5 group-hover/add:rotate-90 transition-transform duration-300" />
                    <span className="text-xs font-medium">Add {section}</span>
                  </button>
                </div>
              </div>
              );
            })}
          </section>

          {/* Unbudgeted categories */}
          {unbudgetedCategories.length > 0 && (
            <section className="mb-5">
              <div className="sticky top-[115px] z-10 flex items-center justify-between mb-3 bg-gradient-to-r from-topaz/10 via-topaz/5 to-transparent backdrop-blur-md px-4 py-2 rounded-xl border border-topaz/20 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-topaz flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-topaz/20"><AlertCircle className="h-3 w-3 text-topaz" /></span>
                  Unbudgeted
                  <span className="text-[10px] font-normal text-topaz/60 bg-topaz/10 px-1.5 py-0.5 rounded-full">{unbudgetedCategories.length}</span>
                </h2>
                <span className="text-[10px] text-topaz font-medium">Categories with spend, no budget</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {unbudgetedCategories.map((cat) => (
                  <div key={cat.name} className="rounded-xl border border-dashed border-topaz/30 bg-background/40 backdrop-blur-xl p-3 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-topaz/50 transition-all duration-300 relative overflow-hidden border-l-[3px] border-l-topaz">
                    <div className="flex items-start gap-2.5 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-topaz to-topaz/70 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
                        {cat.name[0].toUpperCase()}
                      </div>
                      <h3 className="text-sm font-semibold capitalize truncate leading-tight flex-1 pt-0.5">{cat.name}</h3>
                      <button onClick={() => openAddBudget("everyday", cat.name)} className="p-1.5 rounded-lg bg-emerald/10 hover:bg-emerald/20 text-emerald transition-all" aria-label={`Create budget for ${cat.name}`}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="pl-9 space-y-1.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold tabular-nums tracking-tight text-ruby">£{cat.value}</span>
                        <span className="text-xs text-muted-foreground font-medium">no budget</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2.5 rounded-full bg-secondary/50 overflow-hidden shadow-inner">
                          <div className="h-full rounded-full bg-topaz/60" style={{ width: "100%" }} />
                        </div>
                        <span className="text-[11px] font-bold tabular-nums text-topaz">—%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Upcoming Event Groups */}
          {upcomingEventGroups.length > 0 && (
            <section>
              <div className="sticky top-[115px] z-10 flex items-center justify-between mb-3 bg-gradient-to-r from-secondary/70 via-secondary/40 to-transparent backdrop-blur-md px-4 py-2 rounded-xl border border-border/50 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-muted/70"><Calendar className="h-3 w-3 text-muted-foreground/80" /></span>
                  Upcoming Events
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => openAddBudget("event")}
                    className="h-6 w-6 rounded-full bg-topaz/10 text-topaz hover:bg-topaz/20 hover:scale-110 active:scale-95 flex items-center justify-center transition-all duration-200" aria-label="Add event">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">{upcomingEventGroups.length}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {upcomingEventGroups.map((g) => <EventGroupCard key={g.event_group_id} group={g} setConfirmDelete={setConfirmDelete} fetchData={fetchData} />)}
              </div>
            </section>
          )}

          {/* Past event groups */}
          {pastEventGroups.length > 0 && isCurrentMonth && (
            <section>
              <div className="sticky top-[115px] z-10 flex items-center justify-between mb-3 bg-gradient-to-r from-secondary/70 via-secondary/40 to-transparent backdrop-blur-md px-4 py-2 rounded-xl border border-border/50 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-muted/70"><Calendar className="h-3 w-3 text-muted-foreground/80" /></span>
                  Past Events
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pastEventGroups.map((g) => <EventGroupCard key={g.event_group_id} group={g} setConfirmDelete={setConfirmDelete} fetchData={fetchData} />)}
              </div>
            </section>
          )}

          {Object.keys(eventGroups).length > 0 && upcomingEventGroups.length === 0 && pastEventGroups.length === 0 && (
            <section>
              <div className="sticky top-[115px] z-10 flex items-center justify-between mb-3 bg-gradient-to-r from-secondary/70 via-secondary/40 to-transparent backdrop-blur-md px-4 py-2 rounded-xl border border-border/50 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-muted/70"><Calendar className="h-3 w-3 text-muted-foreground/80" /></span>
                  Planned Events
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.values(eventGroups).filter((g) => !g.event_date).map((g) => <EventGroupCard key={g.event_group_id} group={g} setConfirmDelete={setConfirmDelete} fetchData={fetchData} />)}
              </div>
            </section>
          )}
        </>
      )}

      {/* AI Budget Insights */}
      {!loading && (insights.length > 0) && (
        <section className="mt-8 mb-6">
          <div className="rounded-2xl border border-topaz/20 bg-gradient-to-br from-topaz/5 via-background to-background p-1 shadow-sm relative overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-topaz/10 rounded-full blur-3xl pointer-events-none" />
            
            <button
              onClick={() => setShowInsights(!showInsights)}
              className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-secondary/30 transition-colors text-left relative z-10"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-topaz/20 flex items-center justify-center shrink-0 border border-topaz/30 shadow-inner">
                  <Sparkles className={`h-5 w-5 text-topaz ${insightsLoading ? "animate-pulse" : ""}`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    FinanceAI Coach
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">I have {insights.length} personalized suggestions to improve your cash flow.</p>
                </div>
              </div>
              <div className="shrink-0 text-muted-foreground">
                {showInsights ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </button>
            
            {showInsights && (
              <div className="p-4 pt-2 relative z-10 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                  {insights.map((ins) => {
                    const hasBudget = ins.current_budget > 0;
                    const needsChange = ins.suggested_budget !== ins.current_budget;
                    return (
                      <div key={ins.category} className="rounded-xl border border-topaz/20 bg-card/60 backdrop-blur-md p-4 shadow-sm hover:border-topaz/40 transition-colors group">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <h4 className="text-sm font-semibold capitalize text-foreground">{ins.category}</h4>
                          {!hasBudget && <span className="text-[10px] px-2 py-0.5 rounded-full bg-topaz/10 border border-topaz/20 text-topaz font-medium shrink-0">No budget</span>}
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1.5 mb-4">
                          <p className="flex justify-between"><span>Current spend:</span> <strong className="text-foreground">£{ins.current_spent}</strong></p>
                          <p className="flex justify-between"><span>3-month avg:</span> <strong className="text-foreground">£{ins.avg_spent_3m}</strong></p>
                          {hasBudget && <p className="flex justify-between"><span>Current limit:</span> <strong className="text-foreground">£{ins.current_budget}</strong></p>}
                          
                          <div className="mt-3 p-2.5 rounded-lg bg-topaz/10 text-topaz-dark dark:text-topaz border border-topaz/10 leading-relaxed font-medium">
                            "{ins.reason}"
                          </div>
                        </div>
                        {needsChange ? (
                          <Button
                            variant="primary"
                            size="pill"
                            className="w-full bg-topaz text-topaz-foreground hover:bg-topaz/90 shadow-sm"
                            onClick={() => handleApplyInsight(ins)}
                            disabled={applyingInsight === ins.category}
                          >
                            {applyingInsight === ins.category ? "Applying..." : `Update to £${ins.suggested_budget}`}
                          </Button>
                        ) : hasBudget ? (
                          <div className="py-2 text-center rounded-lg bg-emerald/10 border border-emerald/20 text-emerald text-xs font-medium">
                            Looks perfectly calibrated ✓
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
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
                      onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })} required autoFocus className="text-right" aria-label="Expense amount" />
                  </div>
                  <Button type="submit" variant="primary" size="pill" className="shrink-0 h-11 px-4">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {quickForm.showDesc && (
                  <div className="mt-2">
                    <Input placeholder="Description (optional)" value={quickForm.description || ""}
                      onChange={(e) => setQuickForm({ ...quickForm, description: e.target.value })} aria-label="Expense description" />
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <button type="button" onClick={() => setQuickForm({ ...quickForm, showDesc: !quickForm.showDesc, description: quickForm.showDesc ? "" : quickForm.description })}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {quickForm.showDesc ? "Remove description" : "+ Add description"}
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
                          onChange={(e) => { setForm({ ...form, limit: e.target.value }); setBudgetAdded(false); }} required className="text-right" aria-label="Budget limit" />
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
                              onChange={(e) => setForm({ ...form, event_group_name: e.target.value })} required aria-label="Event name" />
                          </div>
                          <div className="w-auto">
                            <Input type="date" value={form.event_date}
                              onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                              className="text-sm" aria-label="Event date" />
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
                                onChange={(e) => setForm({ ...form, limit: e.target.value })} required className="text-right" aria-label="Item budget limit" />
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
                                onChange={(e) => setForm({ ...form, limit: e.target.value })} required className="text-right" aria-label="Item budget limit" />
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
        title={confirmDelete?.type === "group" ? "Delete this event?" : "Remove this budget?"}
        message={confirmDelete?.type === "group" ? "This will permanently delete this entire event and all its items." : "This will permanently delete this budget item."}
        confirmLabel="Yes, remove"
        onConfirm={() => handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
      <ConfirmModal
        open={confirmBulkDelete}
        title={`Delete ${bulkSelected.size} budget(s)?`}
        message="This will permanently delete all selected budget items."
        confirmLabel="Yes, delete all"
        onConfirm={async () => {
          setConfirmBulkDelete(false);
          try {
            await api.post("/budgets/bulk-delete", { budget_ids: [...bulkSelected] });
            toast.success(`${bulkSelected.size} budget(s) deleted`);
            setBulkSelected(new Set());
            await fetchData();
          } catch { toast.error("Could not delete"); }
        }}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
});

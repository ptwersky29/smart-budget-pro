import PenniSelect from "../components/PenniSelect";
import { useActions } from "../contexts/ActionContext";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseISO, isBefore, getDaysInMonth, getDate, format } from "date-fns";
import {
  RefreshCw, Wallet, ShoppingCart, Calendar, Plus, Pencil, Trash2,
  Check, X, Target, TrendingDown, ChevronDown, ChevronUp,
  Sparkles, TrendingUp, Download, Search, Copy, MoreHorizontal,
  Lock, PiggyBank, Home, AlertCircle, ExternalLink,
  Car, Utensils, Zap, Gift, Film, Heart, BookOpen,
  Shirt, Gamepad2, Plane, Coffee, Briefcase, Smartphone,
  ArrowUpRight,
  List, LayoutGrid, Bell, FolderCog, BarChart3,
} from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { withUndo } from "../lib/undo";
import { Button } from "../components/ui/button";
import { PageHeader } from "../components/ui/page";
import { Input } from "../components/ui/input";
import ConfirmModal from "../components/ui/ConfirmModal";
import CategoryCombobox from "../components/CategoryCombobox";
import MonthPicker from "../components/MonthPicker";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import TransactionForm from "../components/TransactionForm";
import CategoryPieChart from "../components/CategoryPieChart";
import TransactionInspectorPanel from "../components/TransactionInspectorPanel";
import { WorkspaceHeader, WorkspaceMetric, WorkspaceMetrics, WorkspaceTabs, WorkspaceViewToggle, WorkspaceBlank, WorkspaceSkeleton } from "../components/ui/workspace";

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

const SECTION_ICONS = {
  income: TrendingUp,
  fixed: Lock,
  variable: ShoppingCart,
  savings: PiggyBank,
  other: Home,
};

const CATEGORY_ICONS = {
  food: ShoppingCart, groceries: ShoppingCart,
  dining: Utensils, restaurant: Utensils, takeaway: Utensils,
  transport: Car, fuel: Car, petrol: Car, parking: Car,
  housing: Home, rent: Home, mortgage: Home,
  utilities: Zap, electricity: Zap, gas: Zap, water: Zap,
  entertainment: Film, leisure: Film,
  shopping: ShoppingCart, clothing: Shirt, fashion: Shirt,
  health: Heart, medical: Heart, pharmacy: Heart,
  education: BookOpen,
  subscriptions: Smartphone, phone: Smartphone,
  travel: Plane, holiday: Plane, vacation: Plane,
  gifts: Gift, charity: Gift, donation: Gift,
  general: Briefcase, business: Briefcase,
  coffee: Coffee, snacks: Coffee,
  gaming: Gamepad2, games: Gamepad2,
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

const BudgetCard = React.memo(({ budget, isCurrentMonth, currentDay, monthElapsedPct, daysInMonth, startEdit, bulkSelected, setBulkSelected, setConfirmDelete, openBudgetTransactions }) => {
  const pct = budget.progress_pct || 0;
  const over = pct >= 100;
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
  const isSelected = bulkSelected.has(budget.budget_id);
  const statusLabel = over ? "Over" : pct >= 80 ? "Nearing" : "On track";
  const handleCardClick = (e) => {
    if (e.target.closest("button, input, select, a")) return;
    openBudgetTransactions(budget);
  };
  const CatIcon = CATEGORY_ICONS[budget.category.toLowerCase().trim()] || (pct >= 100 ? TrendingDown : Target);
  return (
    <div key={budget.budget_id} role="button" tabIndex={0} aria-label={`View ${budget.category} budget transactions`} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) { event.preventDefault(); openBudgetTransactions(budget); } }} onClick={handleCardClick} className={`group rounded-xl border ${isSelected ? "border-emerald bg-emerald/[0.03] ring-1 ring-emerald/30" : "border-border/50 bg-background/40"} backdrop-blur-xl p-3 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-border transition-all duration-300 relative overflow-hidden border-l-[3px] cursor-pointer ${over ? "border-l-ruby" : pct >= 80 ? "border-l-topaz" : "border-l-emerald"}`}>
      <div className="flex items-start gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${over ? "from-ruby to-ruby/70" : pct >= 80 ? "from-topaz to-topaz/70" : "from-emerald to-emerald/70"} flex items-center justify-center text-white shrink-0 shadow-sm`}>
          <CatIcon className="h-3.5 w-3.5" />
        </div>
        <h3 className="text-sm font-semibold capitalize truncate leading-tight tracking-tight flex-1 pt-0.5">{budget.category}</h3>
        <input type="checkbox" checked={isSelected} onChange={() => {
          const next = new Set(bulkSelected);
          if (isSelected) next.delete(budget.budget_id); else next.add(budget.budget_id);
          setBulkSelected(next);
        }} className="shrink-0 w-3.5 h-3.5 rounded border-border text-emerald focus:ring-emerald/30 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity mt-1" onClick={(e) => e.stopPropagation()} />
        <div className="flex items-center gap-1 mt-1">
          <span className={`w-1.5 h-1.5 rounded-full ${over ? "bg-ruby" : pct >= 80 ? "bg-topaz" : "bg-emerald"} shrink-0`} />
          <span className={`text-[10px] font-semibold ${over ? "text-ruby" : pct >= 80 ? "text-topaz" : "text-emerald"} hidden sm:inline`}>{statusLabel}</span>
        </div>
        <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => startEdit(budget)} className="p-1.5 rounded-lg bg-secondary/30 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all" aria-label={`Edit ${budget.category}`}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setConfirmDelete({ type: 'budget', id: budget.budget_id })} className="p-1.5 rounded-lg bg-transparent hover:bg-ruby/10 text-muted-foreground hover:text-ruby transition-all" aria-label={`Delete ${budget.category}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
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
          <div className="flex-1 h-2 rounded-full bg-secondary/50 overflow-hidden shadow-inner">
            <div className={`h-full rounded-full ${over ? "bg-ruby" : "bg-gradient-to-r from-emerald to-topaz"}`} style={{ width: `${Math.min(100, pct)}%`, transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)" }} />
          </div>
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-emerald/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-1">
        <span className="text-[10px] font-medium text-emerald flex items-center gap-0.5">
          View transactions <ArrowUpRight className="h-2.5 w-2.5" />
        </span>
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
            <button type="submit" aria-label="Add event budget item" className="h-7 w-7 rounded bg-emerald text-white hover:bg-emerald/90 flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></button>
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

const BudgetReferenceDesktop = React.memo(function BudgetReferenceDesktop({
  monthControl, summary, everyday, atRiskCount, budgetTableRows, budgetView, setBudgetView,
  categorySpend, recentTransactions, onAdd, onRefresh, onCopyPrevious, onViewAll, openBudgetTransactions,
  startEdit, displayMode, setDisplayMode, onManageCategories, onViewReports, onAlerts,
  searchQuery, setSearchQuery, sortOption, setSortOption, sortOrder, setSortOrder,
  loading, loadError, onRetry, onSeedDefaults, unbudgetedCategories, eventGroups,
  onDeleteEvent, monthlyTrend, insights, onApplyInsight, applyingInsight,
}) {
  const statCards = [
    { label: "Total Budgeted", value: `£${summary.totalPlanned.toFixed(2)}`, note: `${summary.count} categories`, icon: Target, tone: "emerald" },
    { label: "Total Spent", value: `£${summary.totalSpent.toFixed(2)}`, note: `${summary.totalPlanned ? Math.round((summary.totalSpent / summary.totalPlanned) * 100) : 0}% of budget`, icon: TrendingDown, tone: "ruby", progress: summary.totalPlanned ? (summary.totalSpent / summary.totalPlanned) * 100 : 0 },
    { label: summary.totalRemaining < 0 ? "Over budget" : "Remaining", value: `£${Math.abs(summary.totalRemaining).toFixed(2)}`, note: summary.totalPlanned ? `${Math.round(Math.abs(summary.totalRemaining / summary.totalPlanned) * 100)}% ${summary.totalRemaining < 0 ? "over" : "left"}` : "No budget set", icon: PiggyBank, tone: summary.totalRemaining < 0 ? "ruby" : "emerald", progress: summary.totalPlanned ? Math.abs(summary.totalRemaining / summary.totalPlanned) * 100 : 0 },
    { label: "At Risk", value: String(atRiskCount), note: atRiskCount ? `${atRiskCount} categories over 80% spent` : "All budgets on track", icon: AlertCircle, tone: "topaz" },
  ];
  const tabs = [
    { key: "all", label: "All Categories", count: everyday.length },
    { key: "track", label: "On Track", count: everyday.filter((b) => (Number(b.progress_pct) || 0) < 80).length },
    { key: "risk", label: "At Risk", count: atRiskCount },
    { key: "exceeded", label: "Exceeded", count: summary.overCount },
  ];

  return (
    <div className="budget-workspace hidden xl:flex xl:flex-col">
      <div className="shrink-0 px-[14px]">
        <WorkspaceHeader title="Budgets" description="Track your spending, set budgets and stay in control."
          actions={<>
            {monthControl}
            <button type="button" onClick={() => onAdd()} className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-emerald px-4 text-[12px] font-semibold text-white shadow-[0_6px_16px_hsl(var(--emerald)/0.18)]"><Plus className="h-3.5 w-3.5" /> Add budget</button>
            <DropdownMenu><DropdownMenuTrigger asChild><button aria-label="More budget actions" className="grid h-9 w-9 place-items-center rounded-[10px] border border-border bg-card text-muted-foreground"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem onClick={onCopyPrevious}><Copy className="mr-2 h-4 w-4" /> Copy previous month</DropdownMenuItem><DropdownMenuItem onClick={onRefresh}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</DropdownMenuItem><DropdownMenuItem onClick={onSeedDefaults}><Download className="mr-2 h-4 w-4" /> Load defaults</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </>} />
      </div>
      <div className="mt-4 px-[14px]"><WorkspaceMetrics columns={4}>
        {statCards.map(({ label, value, note, icon, tone, progress }) => <WorkspaceMetric key={label} label={label} value={value} note={note} icon={icon} tone={tone} progress={progress} />)}
      </WorkspaceMetrics></div>
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(305px,32%)] gap-4 px-[14px]">
        <div className="budget-primary flex min-h-0 min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <WorkspaceTabs tabs={tabs} active={budgetView} onChange={setBudgetView} label="Budget category status" />
            <WorkspaceViewToggle value={displayMode} onChange={setDisplayMode} label="Budget view" />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <label className="relative min-w-[130px] flex-1" aria-label="Search budgets">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search categories and budgets" className="h-9 w-full rounded-[9px] border border-border bg-card pl-8 pr-3 text-[12px] outline-none focus:border-emerald/40" />
            </label>
            <PenniSelect value={sortOption} onChange={(e) => setSortOption(e.target.value)}
              aria-label="Sort budgets" className="h-9 min-w-[130px] rounded-[9px] border border-border bg-card px-3 text-xs">
              <option value="progress">Sort: Progress</option><option value="name">Sort: Name</option>
              <option value="limit">Sort: Budget</option><option value="spent">Sort: Spent</option><option value="remaining">Sort: Remaining</option>
            </PenniSelect>
            <button type="button" onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")} aria-label="Reverse sort" className="grid h-9 w-9 place-items-center rounded-[9px] border border-border bg-card">
              {sortOrder === "desc" ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </div>
          {loading ? <WorkspaceSkeleton /> : loadError ? <WorkspaceBlank title="Could not load budgets" description={loadError} error action={<button onClick={onRetry} className="rounded-lg bg-emerald px-3 py-2 text-xs font-semibold text-white">Try again</button>} /> : displayMode === "list" ? (<div data-testid="budget-list" className="workspace-table-panel budget-ledger-scroll surface min-h-0 flex-1 overflow-auto rounded-[16px]"><table className="workspace-table w-full text-left"><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-[11px] font-medium text-muted-foreground"><th className="px-4 py-3">Category</th><th className="px-3 py-3 text-right">Spent</th><th className="px-3 py-3 text-right">Budget</th><th className="w-[180px] px-3 py-3">Progress</th><th className="px-3 py-3">Status</th><th className="w-[90px]" /></tr></thead><tbody>{budgetTableRows.map((budget) => { const pct = Number(budget.progress_pct) || 0; const risk = pct >= 80; const over = pct >= 100; const Icon = CATEGORY_ICONS[budget.category.toLowerCase().trim()] || Target; return <tr key={budget.budget_id} onClick={() => openBudgetTransactions(budget)} className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-secondary/30"><td className="px-4 py-2.5"><span className="flex items-center gap-2.5"><span className={`grid h-8 w-8 place-items-center rounded-xl ${over ? "bg-ruby/10 text-ruby" : risk ? "bg-topaz/10 text-topaz" : "bg-emerald/10 text-emerald"}`}><Icon className="h-4 w-4" /></span><span className="text-[12px] font-medium capitalize">{budget.category}</span></span></td><td className="money-tabular px-3 py-2.5 text-right text-[12px]">£{Number(budget.spent || 0).toFixed(2)}</td><td className="money-tabular px-3 py-2.5 text-right text-[12px] text-muted-foreground">£{Number(budget.limit || 0).toFixed(2)}</td><td className="px-3 py-2.5"><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${over ? "bg-ruby" : risk ? "bg-gradient-to-r from-topaz to-ruby/70" : "bg-gradient-to-r from-emerald to-sky"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div><span className="w-7 text-right text-[10px] text-muted-foreground">{Math.round(pct)}%</span></div></td><td className="px-3 py-2.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${over ? "bg-ruby/10 text-ruby" : risk ? "bg-topaz/10 text-topaz" : "bg-emerald/10 text-emerald"}`}>{over ? "Exceeded" : risk ? "At risk" : "On track"}</span></td><td className="px-3 py-2.5"><button type="button" aria-label={`Edit ${budget.category} budget`} onClick={(event) => { event.stopPropagation(); startEdit(budget); }} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-medium text-foreground hover:bg-secondary"><Pencil className="h-3 w-3" />Edit</button></td></tr>; })}</tbody></table>{budgetTableRows.length === 0 ? <WorkspaceBlank title={searchQuery || budgetView !== "all" ? "No matching budgets" : "No budgets yet"} description={searchQuery || budgetView !== "all" ? "Try clearing your search or changing the status tab." : "Create a budget to track spending, or choose a category from the unbudgeted list."} action={!searchQuery && budgetView === "all" ? <button type="button" onClick={() => onAdd()} className="rounded-lg bg-emerald px-3 py-2 text-xs font-semibold text-white">Create budget</button> : null} /> : null}</div> ) : (
            <div data-testid="budget-grid" className="budget-ledger-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {budgetTableRows.map((budget) => {
                  const pct = Number(budget.progress_pct) || 0;
                  const over = pct >= 100;
                  const risk = pct >= 80;
                  const Icon = CATEGORY_ICONS[budget.category.toLowerCase().trim()] || Target;
                  return (
                    <article key={budget.budget_id} className="surface rounded-[16px] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${over ? "bg-ruby/10 text-ruby" : risk ? "bg-topaz/10 text-topaz" : "bg-emerald/10 text-emerald"}`}><Icon className="h-4 w-4" /></span>
                          <h3 className="truncate text-sm font-semibold capitalize">{budget.category}</h3>
                        </div>
                        <button type="button" aria-label={`Edit ${budget.category} budget`} onClick={() => startEdit(budget)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-medium hover:bg-secondary"><Pencil className="h-3.5 w-3.5" />Edit</button>
                      </div>
                      <button type="button" onClick={() => openBudgetTransactions(budget)} className="mt-4 w-full text-left" aria-label={`View transactions for ${budget.category}`}>
                        <div className="flex items-baseline justify-between gap-2"><span className="text-xl font-semibold tabular-nums">£{Number(budget.spent || 0).toFixed(2)}</span><span className="text-xs text-muted-foreground">of £{Number(budget.limit || 0).toFixed(2)}</span></div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${over ? "bg-ruby" : risk ? "bg-topaz" : "bg-emerald"}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">{Math.round(pct)}% used</span><span className={over ? "text-ruby" : risk ? "text-topaz" : "text-emerald"}>{over ? "Exceeded" : risk ? "At risk" : "On track"}</span></div>
                      </button>
                    </article>
                  );
                })}
              </div>
              {budgetTableRows.length === 0 ? <WorkspaceBlank title="No budgets in this view" description="Try another filter or create a budget." /> : null}
            </div>
          )}

        </div>
        <aside className="budget-insights-sidebar subtle-scroll min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain pb-2 pr-1">
          {unbudgetedCategories?.length > 0 && <section className="surface rounded-[16px] p-4">
            <h2 className="text-[14px] font-semibold">Unbudgeted spending</h2>
            <p className="mt-1 text-xs text-muted-foreground">Spending in categories without a budget</p>
            <div className="mt-3 space-y-1">
              {unbudgetedCategories.map(category => <div key={category.name} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-2 text-xs">
                <span className="min-w-0 truncate capitalize">{category.name} · £{Number(category.value||0).toFixed(2)}</span>
                <button type="button" onClick={() => onAdd(category.name)} className="shrink-0 rounded-lg bg-emerald/10 px-2 py-1.5 font-semibold text-emerald" aria-label={`Create budget for ${category.name}`}>Add budget</button>
              </div>)}
            </div>
          </section>}
          <section className="surface rounded-[16px] p-4">
            <div className="flex items-center justify-between gap-2"><h2 className="text-[14px] font-semibold">Spending by Category</h2><span className="rounded-lg bg-secondary px-2.5 py-1 text-[10px] text-muted-foreground">This month</span></div>
            {categorySpend.length ? <CategoryPieChart data={categorySpend.slice(0, 7)} /> : <WorkspaceBlank title="No category spending" description="Spending will appear here as transactions are added." />}
          </section>
          <section className="surface rounded-[16px] p-4">
            <div className="flex items-center justify-between gap-2"><h2 className="text-[14px] font-semibold">Monthly Trend</h2><span className="text-[10px] text-muted-foreground">Last 6 months</span></div>
            {monthlyTrend?.length ? <>
              <div className="mt-5 flex h-[120px] items-end gap-2" role="img" aria-label="Monthly budget versus spending for the last six months">
                {monthlyTrend.map(point => {
                  const peak = Math.max(1,...monthlyTrend.flatMap(item => [item.budgeted,item.spent]));
                  return <div key={point.month} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-[92px] w-full items-end justify-center gap-1">
                      <div className="w-[35%] min-w-[4px] rounded-t bg-emerald/75" style={{height:`${Math.max(point.budgeted ? 3 : 0,point.budgeted/peak*100)}%`}} title={`Budget ${point.month}: £${point.budgeted.toFixed(2)}`} />
                      <div className="w-[35%] min-w-[4px] rounded-t bg-topaz/80" style={{height:`${Math.max(point.spent ? 3 : 0,point.spent/peak*100)}%`}} title={`Spent ${point.month}: £${point.spent.toFixed(2)}`} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{point.label}</span>
                  </div>;
                })}
              </div>
              <div className="mt-2 flex justify-center gap-4 text-[10px] text-muted-foreground"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald/75" />Budget</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-topaz/80" />Spent</span></div>
            </> : <WorkspaceBlank title="Trend unavailable" description="Historical monthly budget figures could not be loaded." />}
          </section>
          <section className="surface rounded-[16px] p-4">
            <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-[14px] font-semibold">Recent Budget Activity</h2><button type="button" onClick={onViewAll} className="text-xs font-semibold text-emerald hover:underline">View all</button></div>
            {recentTransactions.length ? <div className="divide-y divide-border/70">
              {recentTransactions.map(tx => <div key={tx.transaction_id} className="flex items-center justify-between gap-2 py-2 text-xs"><div className="min-w-0"><p className="truncate font-medium">{tx.description||tx.merchant||"Transaction"}</p><p className="text-[10px] text-muted-foreground">{tx.date?.slice(0,10)||"No date"} · {tx.category||"Uncategorised"}</p></div><span className={`money-tabular shrink-0 text-xs font-semibold ${Number(tx.amount)<0?"text-ruby":"text-emerald"}`}>{Number(tx.amount)<0?"−":"+"}£{Math.abs(Number(tx.amount)||0).toFixed(2)}</span></div>)}
            </div> : <p className="py-4 text-center text-xs text-muted-foreground">No recent activity.</p>}
          </section>
          {Object.values(eventGroups || {}).length > 0 && <section className="surface rounded-[16px] p-3">
            <h2 className="mb-2 px-1 text-[14px] font-semibold">Event budgets</h2>
            <div className="space-y-2">{Object.values(eventGroups).map(group => <EventGroupCard key={group.event_group_id} group={group} setConfirmDelete={onDeleteEvent} fetchData={onRetry} />)}</div>
          </section>}
          {insights?.length > 0 && <section className="surface rounded-[16px] p-4">
            <h2 className="mb-1 text-[14px] font-semibold">Penni Coach</h2><p className="mb-3 text-xs text-muted-foreground">Budget suggestions based on your spending</p>
            <div className="space-y-2">{insights.map(insight => <div key={insight.category} className="rounded-lg border border-border/70 p-3 text-xs">
              <p className="font-semibold capitalize">{insight.category}</p><p className="mt-1 text-muted-foreground">{insight.reason}</p>
              {insight.current_budget !== insight.suggested_budget && <button type="button" disabled={applyingInsight===insight.category} onClick={() => onApplyInsight(insight)} className="mt-2 rounded-lg bg-emerald/10 px-2.5 py-1.5 font-semibold text-emerald disabled:opacity-50">{applyingInsight===insight.category?"Updating…":`Update to £${insight.suggested_budget}`}</button>}
            </div>)}</div>
          </section>}
          <section className="surface rounded-[16px] p-4"><h2 className="text-[14px] font-semibold">Quick Actions</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[{label:"Add Budget",icon:Plus,action:()=>onAdd()}, {label:"Manage Categories",icon:FolderCog,action:onManageCategories}, {label:"View Reports",icon:BarChart3,action:onViewReports},{label:"Set Alerts",icon:Bell,action:onAlerts}].map(({label,icon:Icon,action})=><button key={label} onClick={action} className="flex flex-col items-start gap-2 rounded-xl border border-border/70 p-3 text-left text-[11px] font-medium hover:bg-secondary/40"><Icon className="h-4 w-4 text-emerald" />{label}</button>)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
});

export default React.memo(function BudgetPage() {
  const { openAction } = useActions();
  useEffect(() => { document.title = "Budgets | Penni"; }, []);
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
  const { year, month: mNum } = parseMonth(month);

  const [categoryHierarchy, setCategoryHierarchy] = useState({});
  const [categorySpend, setCategorySpend] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [budgetView, setBudgetView] = useState("all");
  const [displayMode, setDisplayMode] = useState("list");

  // Transaction sheet state
  const [budgetTxOpen, setBudgetTxOpen] = useState(false);
  const [budgetTxCategory, setBudgetTxCategory] = useState("");
  const [budgetTxList, setBudgetTxList] = useState([]);
  const [budgetTxLoading, setBudgetTxLoading] = useState(false);
  const [inspectedBudgetTx, setInspectedBudgetTx] = useState(null);
  const [accountOptions, setAccountOptions] = useState([]);
  const [txEditForm, setTxEditForm] = useState(null);
  const [txEditId, setTxEditId] = useState(null);

  const openBudgetTransactions = useCallback(async (budget) => {
    setBudgetTxCategory(budget.category);
    setBudgetTxOpen(true);
    setBudgetTxLoading(true);
    try {
      const lastDay = getDaysInMonth(new Date(budget.month ? parseInt(budget.month.slice(0, 4), 10) : year, budget.month ? parseInt(budget.month.slice(5, 7), 10) - 1 : mNum - 1));
      const txMonth = budget.month || month;
      const { data } = await api.get("/transactions", {
        params: { category: budget.category, date_from: `${txMonth}-01`, date_to: `${txMonth}-${String(lastDay).padStart(2, "0")}` },
      });
      setBudgetTxList(data.transactions || []);
    } catch { setBudgetTxList([]); }
    finally { setBudgetTxLoading(false); }
  }, [month, year, mNum]);

  const openTxEdit = useCallback((tx) => {
    setBudgetTxOpen(false);
    setTxEditId(tx.transaction_id);
    setTxEditForm({
      description: tx.description || "",
      date: tx.date?.slice(0, 10) || "",
      amount: String(Math.abs(tx.amount)),
      category: tx.category || "",
      account_id: tx.account_id || "",
      entry_mode: "standard",
      is_income: tx.amount > 0,
      is_transfer: false,
      exclude_from_maaser: tx.exclude_from_maaser || false,
      budget_type: "",
      occasion: "",
      merchant: tx.merchant || "",
      notes: tx.notes || "",
    });
  }, []);

  const closeTxEdit = useCallback(() => {
    setTxEditId(null);
    setTxEditForm(null);
    setBudgetTxOpen(true);
  }, []);
  const monthLabel = `${MONTH_NAMES[mNum - 1]} ${year}`;
  const isCurrentMonth = month === fmtMonth(now.getFullYear(), now.getMonth() + 1);
  const daysInMonth = useMemo(() => getDaysInMonth(new Date(year, mNum - 1)), [year, mNum]);

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

  const atRiskCount = useMemo(
    () => everyday.filter((budget) => {
      const pct = Number(budget.progress_pct) || 0;
      return pct >= 80 && pct < 100;
    }).length,
    [everyday],
  );

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

  const budgetTableRows = useMemo(() => {
    const matchesView = (budget) => {
      const pct = Number(budget.progress_pct) || 0;
      if (budgetView === "track") return pct < 80;
      if (budgetView === "risk") return pct >= 80 && pct < 100;
      if (budgetView === "exceeded") return pct >= 100;
      return true;
    };
    return filteredEveryday.filter(matchesView);
  }, [filteredEveryday, budgetView]);

  const sectionsForDisplay = useMemo(() => {
    const groups = {};
    budgetTableRows.forEach((b) => {
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
  }, [budgetTableRows, sectionForCategory, categoryHierarchy]);

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
      const { data } = await api.get("/budgets", { params: { month } });
      setBudgets(data.budgets || []);
      setEventGroups(data.event_groups || {});
      setLoadError(null);
      // Fetch category spend data for unbudgeted detection
      const lastDay = getDaysInMonth(new Date(parseInt(month.slice(0, 4), 10), parseInt(month.slice(5, 7), 10) - 1));
      api.get("/dashboard/overview", { params: { date_from: `${month}-01`, date_to: `${month}-${String(lastDay).padStart(2, "0")}` } })
        .then((res) => setCategorySpend(res.data.categories || []))
        .catch(() => {});
      api.get("/transactions", { params: { date_from: `${month}-01`, date_to: `${month}-${String(lastDay).padStart(2, "0")}`, limit: 4, sort: "date", order: "desc" } })
        .then((res) => setRecentTransactions(res.data.transactions || []))
        .catch(() => setRecentTransactions([]));
    } catch (err) {
      setLoadError(err.response?.data?.detail || "Failed to load budgets");
    } finally {
      setLoading(false);
    }
  }, [month]);

  const handleTxEditSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!txEditForm || !txEditId) return;
    const payload = {
      description: txEditForm.description,
      amount: txEditForm.is_income ? Math.abs(parseFloat(txEditForm.amount)) : -Math.abs(parseFloat(txEditForm.amount)),
      category: txEditForm.category,
      date: txEditForm.date,
      merchant: txEditForm.merchant || undefined,
      notes: txEditForm.notes || undefined,
      is_income: txEditForm.is_income,
      account_id: txEditForm.account_id || undefined,
    };
    try {
      await api.patch(`/transactions/${txEditId}`, payload);
      toast.success("Transaction updated");
      closeTxEdit();
      const lastDay = getDaysInMonth(new Date(year, mNum - 1));
      const { data } = await api.get("/transactions", {
        params: { category: budgetTxCategory, date_from: `${month}-01`, date_to: `${month}-${String(lastDay).padStart(2, "0")}` },
      });
      setBudgetTxList(data.transactions || []);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not update");
    }
  }, [txEditForm, txEditId, budgetTxCategory, month, year, mNum, closeTxEdit, fetchData]);

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
  useEffect(() => {
    const onChanged = () => fetchData();
    window.addEventListener("penni:data-changed", onChanged);
    return () => window.removeEventListener("penni:data-changed", onChanged);
  }, [fetchData]);
  useEffect(() => {
    let active = true;
    // Build a real six-month history; categories in one month are not a time series.
    const months = Array.from({ length: 6 }, (_, index) => addMonth(month, index - 5));
    Promise.all(months.map(async key => {
      try {
        const { data } = await api.get("/budgets", { params: { month: key } });
        const rows = (data.budgets || []).filter(b => (b.budget_type || "everyday") !== "event");
        return { month: key, label: MONTH_NAMES[Number(key.slice(5))-1].slice(0,3), budgeted: rows.reduce((n,b)=>n+(Number(b.limit)||0),0), spent: rows.reduce((n,b)=>n+(Number(b.spent)||0),0) };
      } catch { return null; }
    })).then(rows => { if (active) setMonthlyTrend(rows.filter(Boolean)); });
    return () => { active = false; };
  }, [month]);
  useEffect(() => { fetchCategories(); }, []);
  useEffect(() => { api.get("/accounts").then(({data}) => setAccountOptions(data.accounts||[])).catch(() => {}); }, []);
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
    const currentMonth = month;
    const dup = budgets.find((b) => {
      if (b.category.toLowerCase().trim() !== cat) return false;
      if (form.budget_type === "event") return b.event_group_id === form.event_group_id;
      if (b.month && b.month !== currentMonth) return false;
      return (b.budget_type || "everyday") !== "event";
    });
    if (dup) { toast.error(`Budget for "${cat}" already exists`); return; }
    const payload = {
      category: cat,
      limit: parseFloat(form.limit),
      period: "monthly",
      budget_type: form.budget_type,
      month,
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

  const startEdit = useCallback((b) => {
    setEditingId(b.budget_id);
    setForm({
      category: b.category,
      limit: String(b.limit),
      budget_type: b.budget_type || "everyday",
      event_date: b.event_date ? b.event_date.slice(0, 10) : "",
      event_group_id: b.event_group_id || "",
      event_group_name: b.event_group_name || "",
    });
  }, []);

  const cancelEdit = useCallback(() => { setEditingId(null); resetForm(); }, []);

  const handleUpdate = useCallback(async (id) => {
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
  }, [form, cancelEdit, fetchData]);

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
      const currentMonthStr = month;
      const prevMonth = addMonth(month, -1);
      const { data } = await api.get("/budgets", { params: { month: prevMonth } });
      const prevBudgets = (data.budgets || []).filter((b) => (b.budget_type || "everyday") !== "event");
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
    <div className="budgets-route page-stack pb-4">

      <BudgetReferenceDesktop
        monthControl={<MonthPicker label={monthLabel} onPrev={() => setMonth(addMonth(month, -1))} onNext={() => setMonth(addMonth(month, 1))} onToday={() => setMonth(fmtMonth(now.getFullYear(), now.getMonth() + 1))} isToday={isCurrentMonth} />}
        summary={summary}
        everyday={everyday}
        atRiskCount={atRiskCount}
        budgetTableRows={budgetTableRows}
        budgetView={budgetView}
        setBudgetView={setBudgetView}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        categorySpend={categorySpend}
        recentTransactions={recentTransactions}
        onAdd={(category = "") => openAddBudget("everyday", category)}
        onRefresh={fetchData}
        onCopyPrevious={handleCopyPreviousMonth}
        onViewAll={() => openAction("transaction-search", { month })}
        onManageCategories={() => openAction("categories")}
        onViewReports={() => openAction("reports")}
        onAlerts={() => openAction("alerts")}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortOption={sortOption}
        setSortOption={setSortOption}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        loading={loading}
        loadError={loadError}
        onRetry={fetchData}
        onSeedDefaults={handleSeedDefaults}
        unbudgetedCategories={unbudgetedCategories}
        eventGroups={eventGroups}
        onDeleteEvent={setConfirmDelete}
        monthlyTrend={monthlyTrend}
        insights={insights}
        onApplyInsight={handleApplyInsight}
        applyingInsight={applyingInsight}
        openBudgetTransactions={openBudgetTransactions}
        startEdit={startEdit}
      />

      <div className="xl:hidden">

      <WorkspaceHeader
        title="Budgets"
        description="Track your spending, set budgets and stay in control."
        actions={<>
          <MonthPicker label={monthLabel} onPrev={() => setMonth(addMonth(month, -1))} onNext={() => setMonth(addMonth(month, 1))}
            onToday={() => setMonth(fmtMonth(now.getFullYear(), now.getMonth() + 1))} isToday={isCurrentMonth} />
          <Button variant="primary" size="sm" onClick={() => openAddBudget("everyday")}><Plus className="mr-1 h-4 w-4" /> Add budget</Button>
          <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="More budget actions" className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem onClick={handleCopyPreviousMonth}>Copy previous month</DropdownMenuItem>
            <DropdownMenuItem onClick={handleSeedDefaults}>Load defaults</DropdownMenuItem><DropdownMenuItem onClick={fetchData}>Refresh</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </>}
      />
      <WorkspaceMetrics columns={4}>
        <WorkspaceMetric label="Total Budgeted" value={`£${summary.totalPlanned.toFixed(2)}`} note={`${summary.count} categories`} icon={Target} />
        <WorkspaceMetric label="Total Spent" value={`£${summary.totalSpent.toFixed(2)}`} note={summary.totalPlanned ? `${Math.round(summary.totalSpent/summary.totalPlanned*100)}% of budget` : "No budget set"} icon={TrendingDown} tone="ruby" progress={summary.totalPlanned ? summary.totalSpent/summary.totalPlanned*100 : 0} />
        <WorkspaceMetric label={summary.totalRemaining < 0 ? "Over budget" : "Remaining"} value={`£${Math.abs(summary.totalRemaining).toFixed(2)}`} note={summary.totalPlanned ? "Across your budgets" : "No budget set"} icon={PiggyBank} tone={summary.totalRemaining < 0 ? "ruby" : "emerald"} />
        <WorkspaceMetric label="At Risk" value={String(atRiskCount)} note={atRiskCount ? "Categories over 80% spent" : "All budgets on track"} icon={AlertCircle} tone="topaz" />
      </WorkspaceMetrics>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"/>
          <input type="search" placeholder="Search budgets..." value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)}
            aria-label="Search budgets" className="h-9 w-full rounded-[9px] border border-border bg-card pl-8 pr-3 text-xs outline-none focus:border-emerald/40" />
        </label>
        <PenniSelect value={sortOption} onChange={(e)=>setSortOption(e.target.value)} aria-label="Sort budgets" className="h-9 min-w-[112px] rounded-[9px] border border-border bg-card px-3 text-xs">
          <option value="progress">Progress</option><option value="name">Name</option>
          <option value="limit">Budget</option><option value="spent">Spent</option><option value="remaining">Remaining</option>
        </PenniSelect>
        <button type="button" onClick={()=>setSortOrder(sortOrder==="desc"?"asc":"desc")} aria-label="Reverse budget sort" className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card">
          {sortOrder==="desc" ? <ChevronDown className="h-4 w-4"/> : <ChevronUp className="h-4 w-4"/>}
        </button>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <WorkspaceTabs tabs={[
          {key:"all",label:"All Categories",count:everyday.length},
          {key:"track",label:"On Track",count:everyday.filter(b=>(Number(b.progress_pct)||0)<80).length},
          {key:"risk",label:"At Risk",count:atRiskCount},
          {key:"exceeded",label:"Exceeded",count:summary.overCount},
        ]} active={budgetView} onChange={setBudgetView} label="Budget status"/>
        <WorkspaceViewToggle value={displayMode} onChange={setDisplayMode} label="Budget view"/>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card/90 backdrop-blur-xl p-3 shadow-sm animate-pulse">
              <div className="flex items-start gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-muted/60" />
                <div className="flex-1">
                  <div className="h-3 w-24 bg-muted/60 rounded-full" />
                </div>
                <div className="h-3 w-14 bg-muted/40 rounded-full" />
              </div>
              <div className="space-y-2 pl-9">
                <div className="h-6 w-20 bg-muted/60 rounded" />
                <div className="h-3 w-32 bg-muted/40 rounded-full" />
                <div className="h-2 bg-muted/40 rounded-full" />
              </div>
            </div>
          ))}
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
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald/5 border border-emerald/20 animate-in slide-in-from-top-2 duration-200">
          <span className="bg-emerald/10 text-emerald text-xs font-medium px-2 py-0.5 rounded-full tabular-nums">{bulkSelected.size} selected</span>
          <button onClick={() => setBulkSelected(new Set())} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
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
              <div className="rounded-2xl border border-dashed border-border bg-card/60 backdrop-blur-xl p-10 text-center">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-muted/60 text-muted-foreground">
                  <Search className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium">No budgets match "<span className="text-foreground">{searchQuery}</span>"</p>
                <button onClick={() => setSearchQuery("")} className="mt-3 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">Clear search</button>
              </div>
            )}
            {Object.entries(sectionsForDisplay).map(([section, items]) => {
              const SecIcon = SECTION_ICONS[section.toLowerCase()] || Home;
              const totalRemaining = items.reduce((s, b) => s + Number(b.remaining || 0), 0);
              return (
              <div key={section} className="mb-5">
                <div className="flex items-center justify-between mb-3 px-1">
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
                <div className={`grid gap-3 ${displayMode === "list" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
                  {items.map((b, idx) => <div key={b.budget_id} className={`fade-up delay-${Math.min(idx, 5)}`}><BudgetCard budget={b} isCurrentMonth={isCurrentMonth} currentDay={currentDay} monthElapsedPct={monthElapsedPct} daysInMonth={daysInMonth} startEdit={startEdit} bulkSelected={bulkSelected} setBulkSelected={setBulkSelected} setConfirmDelete={setConfirmDelete} openBudgetTransactions={openBudgetTransactions} /></div>)}
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
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-topaz flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-topaz/20"><AlertCircle className="h-3 w-3 text-topaz" /></span>
                  Unbudgeted
                  <span className="text-[10px] font-normal text-topaz/60 bg-topaz/10 px-1.5 py-0.5 rounded-full">{unbudgetedCategories.length}</span>
                </h2>
                <span className="text-[10px] text-topaz font-medium">Categories with spend, no budget</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {unbudgetedCategories.map((cat, idx) => {
                  const UnCatIcon = CATEGORY_ICONS[cat.name.toLowerCase().trim()] || AlertCircle;
                  return (
                  <div key={cat.name} className={`rounded-xl border border-dashed border-topaz/30 bg-background/40 backdrop-blur-xl p-3 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-topaz/50 transition-all duration-300 relative overflow-hidden border-l-[3px] border-l-topaz fade-up delay-${Math.min(idx, 5)}`}>
                    <div className="flex items-start gap-2.5 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-topaz to-topaz/70 flex items-center justify-center text-white shrink-0 shadow-sm">
                        <UnCatIcon className="h-3.5 w-3.5" />
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
                );
              })}
              </div>
            </section>
          )}

          {/* Upcoming Event Groups */}
          {upcomingEventGroups.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3 px-1">
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
                {upcomingEventGroups.map((g, idx) => <div key={g.event_group_id} className={`fade-up delay-${Math.min(idx, 5)}`}><EventGroupCard group={g} setConfirmDelete={setConfirmDelete} fetchData={fetchData} /></div>)}
              </div>
            </section>
          )}

          {/* Past event groups */}
          {pastEventGroups.length > 0 && isCurrentMonth && (
            <section>
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-muted/70"><Calendar className="h-3 w-3 text-muted-foreground/80" /></span>
                  Past Events
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pastEventGroups.map((g, idx) => <div key={g.event_group_id} className={`fade-up delay-${Math.min(idx, 5)}`}><EventGroupCard group={g} setConfirmDelete={setConfirmDelete} fetchData={fetchData} /></div>)}
              </div>
            </section>
          )}

          {Object.keys(eventGroups).length > 0 && upcomingEventGroups.length === 0 && pastEventGroups.length === 0 && (
            <section>
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-muted/70"><Calendar className="h-3 w-3 text-muted-foreground/80" /></span>
                  Planned Events
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.values(eventGroups).filter((g) => !g.event_date).map((g, idx) => <div key={g.event_group_id} className={`fade-up delay-${Math.min(idx, 5)}`}><EventGroupCard group={g} setConfirmDelete={setConfirmDelete} fetchData={fetchData} /></div>)}
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
                    Penni Coach
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
      </div>

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
              <form onSubmit={handleQuickExpense} className="space-y-4">
                <div>
                  <label className="label-overline text-muted-foreground mb-1.5 block">Category</label>
                  <CategoryCombobox
                    value={quickForm.category}
                    onChange={(val) => setQuickForm({ ...quickForm, category: val })}
                    categories={allCats}
                    placeholder="Category"
                    onCategoryCreated={fetchCategories}
                  />
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="label-overline text-muted-foreground mb-1.5 block">Amount</label>
                    <Input type="number" step="0.01" min="0.01" placeholder="£0.00" value={quickForm.amount}
                      onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })} required autoFocus className="text-right" aria-label="Expense amount" />
                  </div>
                  <Button type="submit" variant="primary" size="pill" className="shrink-0 h-11 px-5 mb-[1px]">
                    <Plus className="h-4 w-4 mr-1" /> Add
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
                    <div className="space-y-4">
                      <div>
                        <label className="label-overline text-muted-foreground mb-1.5 block">Category</label>
                        <CategoryCombobox
                          value={form.category}
                          onChange={(val) => { setForm({ ...form, category: val }); setBudgetAdded(false); }}
                          categories={allCats}
                          placeholder="Category"
                          onCategoryCreated={fetchCategories}
                        />
                      </div>
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="label-overline text-muted-foreground mb-1.5 block">Monthly Limit</label>
                          <Input type="number" step="0.01" min="0" placeholder="£0.00" value={form.limit}
                            onChange={(e) => { setForm({ ...form, limit: e.target.value }); setBudgetAdded(false); }} required className="text-right" aria-label="Budget limit" />
                        </div>
                        <Button type="submit" variant="primary" size="pill" className="shrink-0 h-11 px-5 mb-[1px]">
                          <Plus className="h-4 w-4 mr-1" /> Save
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {!form.event_group_id ? (
                      <>
                        <div className="space-y-3">
                          <div>
                            <label className="label-overline text-muted-foreground mb-1.5 block">Event Name</label>
                            <Input placeholder="e.g. Pesach 2026" value={form.event_group_name}
                              onChange={(e) => setForm({ ...form, event_group_name: e.target.value })} required aria-label="Event name" />
                          </div>
                          <div>
                            <label className="label-overline text-muted-foreground mb-1.5 block">Event Date</label>
                            <Input type="date" value={form.event_date}
                              onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                              className="text-sm" aria-label="Event date" />
                          </div>
                        </div>
                        <div className="mt-4 p-3 rounded-xl bg-secondary/20 border border-border">
                          <p className="label-overline text-muted-foreground mb-2">First budget item</p>
                          <div className="space-y-3">
                            <div>
                              <label className="label-overline text-muted-foreground mb-1.5 block">Item Category</label>
                              <CategoryCombobox
                                value={form.category}
                                onChange={(val) => setForm({ ...form, category: val })}
                                categories={allCats}
                                placeholder="Item category"
                                onCategoryCreated={fetchCategories}
                              />
                            </div>
                            <div className="flex items-end gap-3">
                              <div className="flex-1">
                                <label className="label-overline text-muted-foreground mb-1.5 block">Budget</label>
                                <Input type="number" step="0.01" min="0" placeholder="£0.00" value={form.limit}
                                  onChange={(e) => setForm({ ...form, limit: e.target.value })} required className="text-right" aria-label="Item budget limit" />
                              </div>
                              <Button type="submit" variant="primary" size="pill" className="shrink-0 h-11 px-5 mb-[1px]">
                                <Plus className="h-4 w-4 mr-1" /> Add
                              </Button>
                            </div>
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
                        <div className="space-y-3">
                          <div>
                            <label className="label-overline text-muted-foreground mb-1.5 block">Item Category</label>
                            <CategoryCombobox
                              value={form.category}
                              onChange={(val) => setForm({ ...form, category: val })}
                              categories={allCats}
                              placeholder="Item category"
                              onCategoryCreated={fetchCategories}
                            />
                          </div>
                          <div className="flex items-end gap-3">
                            <div className="flex-1">
                              <label className="label-overline text-muted-foreground mb-1.5 block">Budget</label>
                              <Input type="number" step="0.01" min="0" placeholder="£0.00" value={form.limit}
                                onChange={(e) => setForm({ ...form, limit: e.target.value })} required className="text-right" aria-label="Item budget limit" />
                            </div>
                            <Button type="submit" variant="primary" size="pill" className="shrink-0 h-11 px-5 mb-[1px]">
                              <Plus className="h-4 w-4 mr-1" /> Add
                            </Button>
                          </div>
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


      {/* Keep budget editing available in the desktop workspace, where cards are hidden. */}
      <Sheet open={Boolean(editingId)} onOpenChange={(open) => { if (!open) cancelEdit(); }}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit budget</SheetTitle>
          </SheetHeader>
          <form className="mt-6 space-y-5" onSubmit={(event) => { event.preventDefault(); if (editingId) handleUpdate(editingId); }}>
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="budget-edit-category">Category</label>
              <Input id="budget-edit-category" value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} required />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="budget-edit-limit">Monthly limit (£)</label>
              <Input id="budget-edit-limit" type="number" min="0" step="0.01" value={form.limit} onChange={(event) => setForm((prev) => ({ ...prev, limit: event.target.value }))} required />
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outlinePill" onClick={cancelEdit}>Cancel</Button>
              <Button type="submit" variant="primary">Save changes</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

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

      {/* Budget Transactions Sheet */}
      <Sheet open={budgetTxOpen} onOpenChange={setBudgetTxOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="p-4 pb-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              {budgetTxCategory && <><span className="w-2 h-2 rounded-full bg-emerald shrink-0" /><span className="capitalize">{budgetTxCategory}</span></>}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {budgetTxLoading ? (
              <div className="space-y-2 p-4">
                {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />)}
              </div>
            ) : budgetTxList.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">No transactions for this budget</div>
            ) : (
              budgetTxList.map((tx) => (
                <div key={tx.transaction_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/30 transition-colors group">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${tx.amount > 0 ? "bg-emerald/10 text-emerald" : "bg-rose-50 text-rose-600"}`}>
                    {tx.amount > 0 ? "+" : "-"}
                  </div>
                  <button type="button" onClick={() => { setBudgetTxOpen(false); setInspectedBudgetTx(tx); }} className="flex-1 min-w-0 text-left" aria-label={`View details for ${tx.description || tx.merchant || "transaction"}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{tx.description || tx.merchant || "—"}</span>
                      {tx.category && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary capitalize">{tx.category}</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {tx.date ? format(new Date(tx.date), "dd MMM yyyy") : "—"}
                      {tx.merchant && <span> · {tx.merchant}</span>}
                    </div>
                  </button>
                  <span className={`text-sm font-semibold tabular-nums shrink-0 ${tx.amount > 0 ? "text-emerald" : "text-rose-600"}`}>
                    {tx.amount > 0 ? "+" : ""}£{Math.abs(tx.amount).toFixed(2)}
                  </span>
                  <button onClick={() => openTxEdit(tx)} className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" aria-label="Edit transaction">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(inspectedBudgetTx)} onOpenChange={(open) => { if (!open) setInspectedBudgetTx(null); }}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          <TransactionInspectorPanel
            key={inspectedBudgetTx?.transaction_id || "empty"}
            transaction={inspectedBudgetTx}
            account={accountOptions.find(account => account.account_id === inspectedBudgetTx?.account_id)}
            onClose={() => setInspectedBudgetTx(null)}
            onEdit={(transaction) => { setInspectedBudgetTx(null); openTxEdit(transaction); }}
          />
        </SheetContent>
      </Sheet>
      {/* Transaction Edit Modal */}
      {txEditForm && (
        <TransactionForm
          open={!!txEditForm}
          editingId={txEditId}
          form={txEditForm}
          setForm={setTxEditForm}
          onClose={closeTxEdit}
          onSubmit={handleTxEditSubmit}
          selectedCats={allCats}
          accounts={accountOptions}
          accountsLoading={false}
        />
      )}
    </div>
  );
});

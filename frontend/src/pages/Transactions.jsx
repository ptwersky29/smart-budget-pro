import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { Plus, Trash2, Loader2, Pencil, Search, Sparkles, Filter, ChevronLeft, ChevronRight, X, BarChart3, Star, Receipt, Download, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "../components/ui/layout";
import { SkeletonTable } from "../components/ui/Skeleton";
import { withUndo } from "../lib/undo";
import ConfirmModal from "../components/ui/ConfirmModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "../components/ui/dropdown-menu";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../components/ui/sheet";
import ComparePeriods from "../components/ComparePeriods";
import MaaserPanel from "../components/MaaserPanel";
import MonthStrip from "../components/MonthStrip";
import TransactionRow from "../components/TransactionRow";
import TransactionForm from "../components/TransactionForm";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useSwipe } from "../hooks/useSwipe";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";

import CategoryCombobox from "../components/CategoryCombobox";

const SOURCE_LABELS = { manual: "Manual", truelayer: "Bank", csv: "CSV", pdf: "PDF", statement: "Statement", sms: "SMS" };
const emptyForm = { description: "", amount: "", category: "", is_income: false, budget_type: "", occasion: "", merchant: "" };

function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const fmt = (n) => `£${Number(n || 0).toFixed(2)}`;

function groupCatsBySection(cats) {
  const groups = {};
  for (const c of cats) {
    const section = c.section || "Other";
    if (!groups[section]) groups[section] = [];
    groups[section].push(c);
  }
  return groups;
}

const Transactions = React.memo(function Transactions() {
  useEffect(() => { document.title = "Transactions | FinanceAI"; }, []);
  const [txs, setTxs] = useState([]);
  const [total, setTotal] = useState(0);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedCats, setSelectedCats] = useState([]);
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassification] = useState(null);
  const [saveAsRecurring, setSaveAsRecurring] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("ledger");
  const [hebrewMonths, setHebrewMonths] = useState([]);
  const [selectedHebrewMonth, setSelectedHebrewMonth] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const defaultFilters = useMemo(() => ({ search: "", category: "", source: "", tx_type: "", date_from: firstOfMonth(), date_to: today(), amount_min: "", amount_max: "", sort: "date", order: "desc" }), []);
  const [filters, setFilters] = useState(() => {
    const fromUrl = {};
    for (const k of Object.keys(defaultFilters)) {
      fromUrl[k] = searchParams.get(k) || defaultFilters[k];
    }
    return fromUrl;
  });
  const [offset, setOffset] = useState(() => { const p = searchParams.get("offset"); return p ? parseInt(p, 10) : 0; });
  const [limit] = useState(50);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchInput, setSearchInput] = useState(filters.search);
  const [swipedId, setSwipedId] = useState(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const confirmCb = useRef(null);

  const showConfirm = useCallback((title, message, cb) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    confirmCb.current = cb;
    setConfirmOpen(true);
  }, []);

  const debounceRef = useRef(null);

  const setFilter = useCallback((key, value) => {
    setOffset(0);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleFilter = useCallback((key, value) => {
    setOffset(0);
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? "" : value }));
  }, []);

  const debouncedSetSearch = useCallback((value) => {
    setOffset(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: value }));
    }, 300);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  useEffect(() => {
    const params = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v && v !== defaultFilters[k]) params[k] = v;
    }
    if (offset) params.offset = String(offset);
    setSearchParams(params, { replace: true });
  }, [filters, offset]);

  const load = useCallback(async () => {
    setLoading(true); setAiResults(null);
    try {
      const params = { offset, limit, sort: filters.sort, order: filters.order };
      if (filters.search) params.search = filters.search;
      if (filters.category) params.category = filters.category;
      if (filters.source) params.source = filters.source;
      if (filters.tx_type) params.tx_type = filters.tx_type;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.amount_min) params.amount_min = parseFloat(filters.amount_min);
      if (filters.amount_max) params.amount_max = parseFloat(filters.amount_max);
      const { data } = await api.get("/transactions", { params });
      setTxs(data.transactions);
      setTotal(data.total);
      setIncomeTotal(data.income_total || 0);
      setExpenseTotal(data.expense_total || 0);
    } catch (err) { toast.error("Could not load transactions"); }
    finally { setLoading(false); }
  }, [offset, limit, filters]);

  const loadCats = useCallback(async () => {
    try {
      const { data } = await api.get("/categories");
      const cats = data.categories || [];
      cats.hierarchy = data.hierarchy || {};
      setSelectedCats(cats);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCats(); }, [loadCats]);

  const applyHebrewMonth = useCallback((m) => {
    if (!m) return;
    setSelectedHebrewMonth(m);
    setOffset(0);
    setFilters((prev) => ({
      ...prev,
      date_from: m.gregorian_start,
      date_to: m.gregorian_end,
    }));
  }, []);

  // Load Hebrew months and select current month (only if no date params in URL)
  useEffect(() => {
    api.get("/jewish/hebcal/months")
      .then(({ data }) => {
        const ms = data.months || [];
        setHebrewMonths(ms);
        const hasCustomDates = searchParams.get("date_from") || searchParams.get("date_to");
        if (!hasCustomDates) {
          const current = ms.find((m) => m.is_current);
          if (current) applyHebrewMonth(current);
        } else {
          const firstOfMonth = ms.find((m) =>
            filters.date_from === m.gregorian_start &&
            filters.date_to === m.gregorian_end
          );
          if (firstOfMonth) setSelectedHebrewMonth(firstOfMonth);
        }
      })
      .catch(() => {});
  }, []);

  const activeFilters = useMemo(() => {
    const chips = [];
    if (filters.tx_type) chips.push({ key: "tx_type", label: filters.tx_type === "income" ? "Income" : "Expense" });
    if (filters.source) chips.push({ key: "source", label: SOURCE_LABELS[filters.source] || filters.source });
    if (filters.category) chips.push({ key: "category", label: filters.category });
    if (filters.amount_min) chips.push({ key: "amount_min", label: `≥${fmt(filters.amount_min)}` });
    if (filters.amount_max) chips.push({ key: "amount_max", label: `≤${fmt(filters.amount_max)}` });
    if (filters.date_from) chips.push({ key: "date_from", label: `From ${filters.date_from}` });
    if (filters.date_to) chips.push({ key: "date_to", label: `To ${filters.date_to}` });
    return chips;
  }, [filters]);

  const clearAllFilters = useCallback(() => {
    setSearchInput("");
    setSelectedHebrewMonth(null);
    setFilters(prev => ({ ...prev, search: "", tx_type: "", source: "", category: "", amount_min: "", amount_max: "", date_from: firstOfMonth(), date_to: today() }));
    setOffset(0);
  }, []);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const openAdd = useCallback(() => { setEditingId(null); setForm(emptyForm); setOpen(true); }, []);
  const openEdit = useCallback((t) => {
    setEditingId(t.transaction_id);
    setForm({ description: t.description || "", amount: String(Math.abs(t.amount)), category: t.category || "", is_income: t.amount > 0, budget_type: "", occasion: "", merchant: "" });
    setOpen(true);
  }, []);
  const closeForm = useCallback(() => { setOpen(false); setEditingId(null); setForm(emptyForm); setClassification(null); setSaveAsRecurring(false); }, []);

  const handleClassify = useCallback(async ({ description, amount }) => {
    if (!description.trim() || !amount) return;
    setClassifying(true);
    setClassification(null);
    try {
      const { data } = await api.post("/budget-system/classify", { description: description.trim(), amount });
      setClassification(data);
      // Auto-fill category from top suggestion if very confident (≥ 95%)
      const top = data.suggestions?.[0];
      if (top && top.confidence >= 0.95 && !form.category) {
        setForm(prev => ({ ...prev, category: top.category, budget_type: top.budget_type || "", occasion: top.occasion || "", merchant: top.merchant || "" }));
      }
      if (top?.recurring) setSaveAsRecurring(true);
    } catch { toast.error("Classification failed"); }
    finally { setClassifying(false); }
  }, [form.category]);

  const submit = useCallback(async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    const signed = form.is_income ? Math.abs(amt) : -Math.abs(amt);
    if (editingId) {
      const payload = { description: form.description, amount: signed, category: form.category || undefined, is_income: form.is_income };
      const old = txsRef.current.find(t => t.transaction_id === editingId);
      setTxs(prev => prev.map(t => t.transaction_id === editingId ? { ...t, ...payload } : t));
      setOpen(false); setEditingId(null);
      withUndo({
        action: () => api.patch(`/transactions/${editingId}`, payload),
        undo: async () => {
          if (old) { await api.patch(`/transactions/${editingId}`, { description: old.description, amount: old.amount, category: old.category || undefined, is_income: old.is_income }); }
          await load();
        },
        onError: () => { if (old) setTxs(prev => prev.map(t => t.transaction_id === editingId ? old : t)); load(); },
        successMsg: "Transaction updated",
        errorMsg: "Could not update",
      });
    } else if (classification || form.budget_type) {
      const suggestions = classification?.suggestions || [];
      const chosenIdx = suggestions.findIndex(s => s.category === form.category);
      setOpen(false); setEditingId(null);
      const optimisticTx = { transaction_id: `optimistic-${Date.now()}`, description: form.description, amount: signed, category: form.category, date: new Date().toISOString(), source: "manual" };
      setTxs(prev => [optimisticTx, ...prev]);
      try {
        await api.post("/budget-system/approve", {
          description: form.description.trim(), amount: signed,
          budget_type: form.budget_type || suggestions[0]?.budget_type || "day_to_day",
          occasion: form.occasion || suggestions[0]?.occasion || "Monthly Living",
          category: form.category || suggestions[0]?.category || "uncategorized",
          merchant: form.merchant || suggestions[0]?.merchant || "",
          suggestion_id: classification?.suggestion_id || null,
          suggestion_index: chosenIdx >= 0 ? chosenIdx : null,
          save_as_recurring: saveAsRecurring,
        });
        toast.success("Transaction added");
        await load();
      } catch {
        setTxs(prev => prev.filter(t => t.transaction_id !== optimisticTx.transaction_id));
        toast.error("Could not add");
      }
    } else {
      const payload = { description: form.description, amount: signed, category: form.category || undefined, is_income: form.is_income };
      setOpen(false); setEditingId(null);
      const optimisticTx = { transaction_id: `optimistic-${Date.now()}`, ...payload, date: new Date().toISOString(), source: "manual" };
      setTxs(prev => [optimisticTx, ...prev]);
      withUndo({
        action: async () => {
          const { data } = await api.post("/transactions", payload);
          setTxs(prev => prev.map(t => t.transaction_id === optimisticTx.transaction_id ? data : t));
        },
        undo: async () => {
          await load();
        },
        onError: () => setTxs(prev => prev.filter(t => t.transaction_id !== optimisticTx.transaction_id)),
        successMsg: "Transaction added",
        errorMsg: "Could not add",
      });
    }
    setForm(emptyForm); setClassification(null); setSaveAsRecurring(false);
  }, [editingId, form, load, classification, saveAsRecurring]);

  const clearClassification = useCallback(() => { setClassification(null); setSaveAsRecurring(false); }, []);

  const allDisplayed = aiResults?.transactions || txs;
  const someSelected = selectedIds.size > 0;
  const allDisplayedSelected = useMemo(
    () => allDisplayed.length > 0 && allDisplayed.every(t => selectedIds.has(t.transaction_id)),
    [allDisplayed, selectedIds]
  );

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allDisplayedSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allDisplayed.map(t => t.transaction_id)));
    }
  }, [allDisplayedSelected, allDisplayed]);

  // ── Desktop power-user keyboard shortcuts ──
  useKeyboardShortcut("n", () => { if (!open) openAdd(); }, { enabled: !open });
  useKeyboardShortcut("/", () => { searchRef.current?.focus(); });
  useKeyboardShortcut("r", () => { load(); }, { when: !open });
  useKeyboardShortcut("b", () => {
    if (selectedIds.size > 0) { setSelectedIds(new Set()); }
    else { setSelectedIds(new Set(allDisplayed.map(t => t.transaction_id))); }
  });
  useKeyboardShortcut({ key: "Backspace", meta: true }, () => {
    if (selectedIds.size > 0 && !open) {
      showConfirm("Delete transactions", `Delete ${selectedIds.size} selected transactions?`, async () => {
        try { await withUndo({ action: api.post("/transactions/bulk-delete", { transaction_ids: Array.from(selectedIds) }), undo: api.post("/transactions/undo-bulk-delete", { transaction_ids: Array.from(selectedIds) }), successMsg: `Deleted ${selectedIds.size} transactions`, errorMsg: "Delete failed", undoLabel: "Undo" }); setSelectedIds(new Set()); await load(); } catch { toast.error("Delete failed"); }
      });
    }
  }, { enabled: !open });
  useKeyboardShortcut("j", () => {
    if (open) return;
    setFocusedIndex(i => Math.min((i < 0 ? -1 : i) + 1, allDisplayed.length - 1));
  });
  useKeyboardShortcut("k", () => {
    if (open) return;
    setFocusedIndex(i => Math.max(-1, i - 1));
  });
  useKeyboardShortcut("Escape", () => {
    setSelectedIds(new Set()); setFocusedIndex(-1);
    if (swipedId) setSwipedId(null);
  }, { enabled: !open });
  useKeyboardShortcut("[", () => {
    if (offset > 0 && !open) setOffset(o => Math.max(0, o - limit));
  });
  useKeyboardShortcut("]", () => {
    if (offset + limit < total && !open) setOffset(o => o + limit);
  });

  // Listen for command-palette-triggered actions
  useEffect(() => {
    const handler = (e) => {
      const { action } = e.detail || {};
      if (action === "open-new-transaction") openAdd();
      if (action === "focus-search") searchRef.current?.focus();
    };
    window.addEventListener("app-quick-action", handler);
    return () => window.removeEventListener("app-quick-action", handler);
  }, [openAdd]);

  const bulkCategory = useCallback(async (cat) => {
    if (!cat || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    withUndo({
      action: () => api.post("/transactions/bulk-category", { transaction_ids: ids, category: cat }),
      undo: async () => { await api.post("/transactions/bulk-category", { transaction_ids: ids, category: "" }); await load(); },
      successMsg: `${ids.length} transaction${ids.length > 1 ? "s" : ""} categorised`,
      errorMsg: "Could not update categories",
    });
    setSelectedIds(new Set());
    await load();
  }, [selectedIds, load]);

  const bulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    showConfirm(
      `Delete ${selectedIds.size} transaction${selectedIds.size > 1 ? "s" : ""}?`,
      "This action cannot be undone.",
      async () => {
        try {
          const { data } = await api.post("/transactions/bulk-delete", { transaction_ids: Array.from(selectedIds) });
          toast.success(`Deleted ${data.deleted}`);
          setSelectedIds(new Set());
          await load();
        } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Could not delete"); }
      }
    );
  }, [selectedIds, load, showConfirm]);

  const clearAllMatching = useCallback(async () => {
    const label = filters.source ? `all "${SOURCE_LABELS[filters.source] || filters.source}"` : "all matching";
    showConfirm(
      `Delete ${label} (${total})?`,
      "This will permanently remove all matching transactions.",
      async () => {
        try {
          const body = {};
          if (filters.source) body.source = filters.source;
          if (filters.category) body.category = filters.category;
          if (filters.tx_type) body.tx_type = filters.tx_type;
          if (filters.search) body.search = filters.search;
          if (filters.date_from) body.date_from = filters.date_from;
          if (filters.date_to) body.date_to = filters.date_to;
          if (filters.amount_min) body.amount_min = parseFloat(filters.amount_min);
          if (filters.amount_max) body.amount_max = parseFloat(filters.amount_max);
          const { data } = await api.post("/transactions/clear", body);
          toast.success(`Deleted ${data.deleted}`);
          setSelectedIds(new Set());
          await load();
        } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Could not clear"); }
      }
    );
  }, [filters, total, load, showConfirm]);

  const txsRef = useRef(txs);
  txsRef.current = txs;
  const del = useCallback(async (id) => {
    const tx = txsRef.current.find(t => t.transaction_id === id);
    if (!tx) return;
    setTxs(prev => prev.filter(t => t.transaction_id !== id));
    withUndo({
      action: () => api.delete(`/transactions/${id}`),
      undo: async () => {
        setTxs(prev => [...prev, tx]);
        await api.post("/transactions", tx);
      },
      onError: () => setTxs(prev => [...prev, tx]),
      successMsg: "Transaction deleted",
      errorMsg: "Could not delete",
    });
  }, []);

  const runAiSearch = useCallback(async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true); setAiResults(null);
    try {
      const { data } = await api.post("/transactions/ai-search", null, { params: { q: aiQuery } });
      setAiResults(data);
      if (data.transactions.length === 0) toast.info("No AI matches found");
      else toast.success(`AI found ${data.total} matches`);
    } catch (e) { toast.error(formatApiError(e) || "AI search failed"); }
    finally { setAiLoading(false); }
  }, [aiQuery]);

  const netTotal = incomeTotal - expenseTotal;
  const [showSearch, setShowSearch] = useState(false);

  const exportCsv = useCallback(() => {
    const rows = aiResults?.transactions || txs;
    if (!rows.length) { toast.info("No transactions to export"); return; }
    const header = ["Date", "Description", "Category", "Amount", "Source"];
    const lines = rows.map(t => [
      t.date?.slice(0, 10) ?? "",
      `"${(t.description || "").replace(/"/g, '""')}"`,
      t.category || "",
      t.amount,
      t.source || "",
    ].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financeai-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} transactions`);
  }, [txs, aiResults]);

  return (
    <div className="space-y-4" data-testid="transactions-root">

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Transactions</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearch((s) => !s)}
            className={`h-9 w-9 rounded-lg border grid place-items-center text-xs transition-colors ${
              showSearch || filters.search
                ? "border-emerald text-emerald bg-emerald/5"
                : "border-border text-muted-foreground bg-card/80 hover:bg-secondary/60"
            }`}
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
          </button>

          <Sheet>
            <SheetTrigger asChild>
              <button className={`h-9 px-3 rounded-lg border ${
                activeFilters.length > 0 ? "border-emerald text-emerald" : "border-border text-muted-foreground"
              } bg-card/80 hover:bg-secondary/60 text-xs font-medium transition-colors`}>
                <Filter className="h-3.5 w-3.5 mr-1" /> Filters{activeFilters.length > 0 && <span className="ml-1">({activeFilters.length})</span>}
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription className="text-xs sm:text-sm">Refine your transaction list</SheetDescription>
              </SheetHeader>
              <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-5">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <select value={filters.tx_type} onChange={(e) => toggleFilter("tx_type", e.target.value)} className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent text-sm focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none transition-colors">
                    <option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option>
                  </select>
                  <select value={filters.source} onChange={(e) => toggleFilter("source", e.target.value)} className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent text-sm focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none transition-colors">
                    <option value="">All sources</option>
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <CategoryCombobox
                    value={filters.category}
                    onChange={(val) => toggleFilter("category", val)}
                    categories={selectedCats}
                    placeholder="All categories"
                    allowClear
                    onCategoryCreated={loadCats}
                  />
                  <Input type="number" min="0" step="0.01" placeholder="Min £" value={filters.amount_min}
                    onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, amount_min: e.target.value })); }}
                    className="text-sm h-10" />
                  <Input type="number" min="0" step="0.01" placeholder="Max £" value={filters.amount_max}
                    onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, amount_max: e.target.value })); }}
                    className="text-sm h-10" />
                  <Input type="date" value={filters.date_from} onChange={(e) => { if (!e.target.value) { setSelectedHebrewMonth(null); } setOffset(0); setFilters(p => ({ ...p, date_from: e.target.value })); }} className="text-sm h-10" />
                  <Input type="date" value={filters.date_to} onChange={(e) => { if (!e.target.value) { setSelectedHebrewMonth(null); } setOffset(0); setFilters(p => ({ ...p, date_to: e.target.value })); }} className="text-sm h-10" />
                </div>

                <div className="border-t border-border pt-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">AI search</p>
                  <div className="flex items-center gap-2">
                    <Input value={aiQuery} onChange={(e) => setAiQuery(e.target.value)}
                      placeholder="e.g. 'grocery spending last month'"
                      className="flex-1 text-sm h-10" onKeyDown={(e) => e.key === "Enter" && runAiSearch()} />
                    <Button onClick={runAiSearch} disabled={aiLoading || !aiQuery.trim()} variant="outlinePill" size="pillSm">
                      {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Search
                    </Button>
                  </div>
                  {aiResults && (
                    <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-3 text-sm">
                      <p className="font-medium text-emerald mb-1">AI results for &ldquo;{aiResults.query}&rdquo; ({aiResults.total} matches)</p>
                      <button onClick={() => { setAiResults(null); setAiQuery(""); }} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                    </div>
                  )}
                </div>

                {(filters.source || filters.category || filters.tx_type || filters.search) && total > 0 && (
                  <div className="border-t border-border pt-4 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {total} transaction{total !== 1 ? "s" : ""} match current filters
                    </p>
                    <button onClick={clearAllMatching}
                      className="text-xs px-3 py-1.5 rounded-full border border-ruby/40 text-ruby hover:bg-ruby/5 transition-colors">
                      <Trash2 className="h-3 w-3 inline mr-1" />
                      Delete all {total}
                    </button>
                  </div>
                )}

                <div className="border-t border-border pt-4 flex justify-end">
                  <button onClick={clearAllFilters} className="text-sm text-muted-foreground hover:text-foreground">
                    Clear all filters
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <button onClick={openAdd} className="h-9 px-3 rounded-lg bg-emerald text-white text-xs font-medium hover:bg-emerald/90 transition-colors" data-testid="add-transaction">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-9 w-9 rounded-lg border border-border bg-card/80 hover:bg-secondary/60 grid place-items-center text-muted-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setCompareOpen(true)}>
                <BarChart3 className="h-4 w-4 mr-2" /> Compare periods
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportCsv}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Inline search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card/50 px-3 h-10 backdrop-blur-xl">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input ref={searchRef} value={searchInput} onChange={(e) => { setSearchInput(e.target.value); debouncedSetSearch(e.target.value); }}
            placeholder="Search transactions... (/)"
            className="w-full bg-transparent outline-none text-xs" />
          {filters.search && <button onClick={() => { setSearchInput(""); setFilter("search", ""); }} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
      )}

      {/* ─── Hebrew Month Strip ─── */}
      <MonthStrip selectedMonth={selectedHebrewMonth} onMonthSelect={applyHebrewMonth} />

      {/* Summary + Bulk actions */}
      {(!someSelected) ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Income <span className="text-emerald font-medium tabular-nums">{fmt(incomeTotal)}</span></span>
          <span className="text-muted-foreground/30">|</span>
          <span>Expenses <span className="text-ruby font-medium tabular-nums">{fmt(expenseTotal)}</span></span>
          <span className="text-muted-foreground/30">|</span>
          <span>Net <span className={`font-medium tabular-nums ${netTotal >= 0 ? "text-emerald" : "text-ruby"}`}>{netTotal >= 0 ? "+" : ""}{fmt(netTotal)}</span></span>
          <span className="ml-auto text-muted-foreground/50">{total} transaction{total !== 1 ? "s" : ""}</span>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{selectedIds.size} selected</span>
            <button onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:text-foreground">Clear</button>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-xs px-2.5 py-1 rounded-full border border-ruby/40 text-ruby hover:bg-ruby/5 transition-colors">
                  <Trash2 className="h-3 w-3 inline mr-1" /> Bulk ({selectedIds.size})
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Set category</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {Object.entries(groupCatsBySection(selectedCats)).map(([section, cats]) => (
                      <React.Fragment key={section}>
                        <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider px-2 py-1">{section}</DropdownMenuLabel>
                        {cats.map(c => (
                          <DropdownMenuItem key={c.name} onClick={() => bulkCategory(c.name)}>{c.name}</DropdownMenuItem>
                        ))}
                      </React.Fragment>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { const c = prompt("New category name:"); if (c) bulkCategory(c.trim().toLowerCase().replace(/\s+/g, "_")); }}>
                      ➕ Add custom category
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={bulkDelete} className="text-ruby">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete {selectedIds.size}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Active filter chips (except date range, handled by month strip) */}
      {activeFilters.filter(c => c.key !== "date_from" && c.key !== "date_to").length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeFilters.filter(c => c.key !== "date_from" && c.key !== "date_to").map((chip) => (
            <span key={chip.key} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald/10 text-emerald border border-emerald/20">
              {chip.label}
              <button onClick={() => { setFilter(chip.key, ""); setOffset(0); }} className="hover:text-emerald/80"><X className="h-2.5 w-2.5" /></button>
            </span>
          ))}
          <button onClick={clearAllFilters} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div className="flex gap-1 border-b border-border">
        {[
          { key: "ledger", label: "Ledger", icon: BarChart3 },
          { key: "maaser", label: "Maaser", icon: Star },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-2 -mb-px border-b-2 transition-colors capitalize ${
              activeTab === tab.key ? "border-emerald text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ───── Ledger tab ───── */}
      {activeTab === "ledger" && <>
        {/* Transaction table */}
        <div className="rounded-xl border border-border bg-card/90 backdrop-blur-xl shadow-card overflow-hidden">
          {loading ? (
            <SkeletonTable rows={8} className="p-3" />
          ) : (aiResults?.transactions || txs).length === 0 ? (
            <EmptyState icon={Receipt}
              title={filters.search || filters.category || aiResults ? "No matching transactions" : "No transactions yet"}
              description="Try different filters or add your first transaction."
            />
          ) : (
            <>
              {/* Desktop keyboard shortcut hints */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground/60 border-b border-border">
                <span><kbd className="px-1 rounded bg-secondary font-mono text-[9px]">j</kbd><kbd className="px-1 rounded bg-secondary font-mono text-[9px]">k</kbd> navigate</span>
                <span><kbd className="px-1 rounded bg-secondary font-mono text-[9px]">n</kbd> new</span>
                <span><kbd className="px-1 rounded bg-secondary font-mono text-[9px]">b</kbd> bulk</span>
                <span><kbd className="px-1 rounded bg-secondary font-mono text-[9px]">/</kbd> search</span>
                <span><kbd className="px-1 rounded bg-secondary font-mono text-[9px]">[</kbd><kbd className="px-1 rounded bg-secondary font-mono text-[9px]">]</kbd> pages</span>
                <span><kbd className="px-1 rounded bg-secondary font-mono text-[9px]">⌘⌫</kbd> delete</span>
                <span className="ml-auto text-muted-foreground/40">{currentPage}/{totalPages}</span>
              </div>
              {/* Mobile card view with swipe to delete */}
              <div className="block sm:hidden">
                {(aiResults?.transactions || txs).map((t) => (
                  <SwipeableCard
                    key={t.transaction_id}
                    t={t}
                    isSelected={selectedIds.has(t.transaction_id)}
                    swipedId={swipedId}
                    setSwipedId={setSwipedId}
                    onToggleSelect={toggleSelect}
                    onEdit={openEdit}
                    onDelete={del}
                  />
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] text-muted-foreground border-b border-border">
                    <th className="px-3 py-2.5 w-10">
                      <input type="checkbox" checked={allDisplayedSelected} onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 rounded border-border accent-emerald cursor-pointer" />
                    </th>
                    <th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Description</th><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5 w-10"></th>
                  </tr></thead>
                  <tbody>
                    {(aiResults?.transactions || txs).map((t, idx) => (
                      <TransactionRow key={t.transaction_id} t={t}
                        isSelected={selectedIds.has(t.transaction_id)}
                        isFocused={focusedIndex === idx}
                        onToggleSelect={toggleSelect} onEdit={openEdit} onDelete={del}
                        onSetFocus={() => setFocusedIndex(idx)} />
                    ))}
                  </tbody>
                </table>
              </div>

              {!aiResults && totalPages > 1 && (
                <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
                      className="h-7 w-7 rounded-lg grid place-items-center border border-border hover:bg-secondary disabled:opacity-30 text-muted-foreground" aria-label="Previous page">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-muted-foreground min-w-[3rem] text-center">{currentPage} / {totalPages}</span>
                    <button onClick={() => setOffset(Math.min((totalPages - 1) * limit, offset + limit))} disabled={offset + limit >= total}
                      className="h-7 w-7 rounded-lg grid place-items-center border border-border hover:bg-secondary disabled:opacity-30 text-muted-foreground" aria-label="Next page">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </>}

      {/* ───── Maaser tab ───── */}
      {activeTab === "maaser" && <>
        <MaaserPanel />
      </>}

      <TransactionForm open={open} editingId={editingId} form={form} setForm={setForm}
        selectedCats={selectedCats} onClose={closeForm} onSubmit={submit}
        onClassify={handleClassify} classifying={classifying} classification={classification}
        onClearClassification={clearClassification}
        saveAsRecurring={saveAsRecurring} setSaveAsRecurring={setSaveAsRecurring}
        onCategoryCreated={loadCats} />

      <ComparePeriods open={compareOpen} onClose={() => setCompareOpen(false)} />

      <ConfirmModal
        open={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        onConfirm={() => { confirmCb.current?.(); setConfirmOpen(false); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
});

function SwipeableCard({ t, isSelected, swipedId, setSwipedId, onToggleSelect, onEdit, onDelete }) {
  const handlers = useSwipe(
    () => setSwipedId(t.transaction_id),
    () => setSwipedId(null),
    50,
  );
  const deleting = swipedId === t.transaction_id;

  return (
    <div className="relative overflow-hidden tap-highlight-none" {...handlers} onClick={() => { if (deleting) setSwipedId(null); }}>
      <div
        className={`transition-transform duration-200 ease-out ${deleting ? "-translate-x-20" : "translate-x-0"} ${isSelected ? "bg-emerald/5" : ""} divide-y divide-border`}
      >
        <div className="px-4 py-4 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <label className="flex items-center justify-center" aria-label="Select transaction">
                <input type="checkbox" checked={isSelected}
                  onChange={() => onToggleSelect(t.transaction_id)}
                  className="h-5 w-5 rounded border-border accent-emerald cursor-pointer shrink-0" />
              </label>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t.date?.slice(0, 10)}</p>
                <p className="font-medium text-sm truncate">{t.description}</p>
                {t.normalized_merchant && t.normalized_merchant !== t.description && (
                  <p className="text-xs text-muted-foreground truncate">{t.normalized_merchant}</p>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="p-3 -mr-1 text-muted-foreground hover:text-foreground active:scale-95 transition-transform" aria-label="Transaction actions">
                <MoreHorizontal className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(t)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDelete(t.transaction_id)} className="text-ruby">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center justify-between pl-11">
            <span className="text-xs px-2.5 py-1 rounded-full bg-secondary capitalize">{t.category || "uncategorized"}</span>
            <span className={`font-semibold tabular-nums text-sm ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}>
              {t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
      <div className={`absolute right-0 top-0 bottom-0 flex items-center transition-opacity duration-200 ${deleting ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <button
          onClick={() => { onDelete(t.transaction_id); setSwipedId(null); }}
          className="h-full w-20 flex items-center justify-center bg-ruby text-white font-medium text-sm"
          aria-label="Delete transaction"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export default Transactions;

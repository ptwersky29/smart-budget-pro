import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { Plus, Trash2, Loader2, Pencil, Search, ArrowUpDown, Sparkles, Filter, ChevronLeft, ChevronRight, X, BarChart3, Star, Receipt, Download, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader, SectionCard } from "../components/ui/layout";
import { SkeletonTable } from "../components/ui/Skeleton";
import { withUndo } from "../lib/undo";
import ConfirmModal from "../components/ui/ConfirmModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
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
import TransactionRow from "../components/TransactionRow";
import TransactionForm from "../components/TransactionForm";

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
      setSelectedCats(data.categories || []);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCats(); }, [loadCats]);

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
      // Pre-fill category if not already set
      if (data.category && !form.category) {
        setForm(prev => ({ ...prev, category: data.category }));
      }
      if (data.recurring) setSaveAsRecurring(true);
    } catch { toast.error("Classification failed"); }
    finally { setClassifying(false); }
  }, [form.category]);

  const submit = useCallback(async (e) => {
    e.preventDefault();
    try {
      const amt = parseFloat(form.amount);
      const signed = form.is_income ? Math.abs(amt) : -Math.abs(amt);
      if (editingId) {
        const payload = { description: form.description, amount: signed, category: form.category || undefined, is_income: form.is_income };
        const old = txsRef.current.find(t => t.transaction_id === editingId);
        await api.patch(`/transactions/${editingId}`, payload);
        toast("Transaction updated", {
          action: { label: "Undo", onClick: async () => { if (old) { await api.patch(`/transactions/${editingId}`, { description: old.description, amount: old.amount, category: old.category || undefined, is_income: old.is_income }); toast.success("Restored"); await load(); } } },
          duration: 6000,
        });
      } else if (classification || form.budget_type) {
        // Use AI or manual classification
        await api.post("/budget-system/approve", {
          description: form.description.trim(),
          amount: signed,
          budget_type: form.budget_type || classification?.budget_type || "day_to_day",
          occasion: form.occasion || classification?.occasion || "Monthly Living",
          category: form.category || classification?.category || "uncategorized",
          suggestion_id: classification?.suggestion_id || null,
          save_as_recurring: saveAsRecurring,
        });
        toast.success("Transaction added");
      } else {
        // Standard add
        const payload = { description: form.description, amount: signed, category: form.category || undefined, is_income: form.is_income };
        const { data } = await api.post("/transactions", payload);
        toast("Transaction added", {
          action: { label: "Undo", onClick: async () => { await api.delete(`/transactions/${data.transaction_id}`); toast.success("Undone"); await load(); } },
          duration: 6000,
        });
      }
      setOpen(false); setEditingId(null); setForm(emptyForm); setClassification(null); setSaveAsRecurring(false); await load();
    } catch { toast.error(editingId ? "Could not update" : "Could not add"); }
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
    <div className="space-y-6" data-testid="transactions-root">
      <PageHeader
        eyebrow="Money"
        title="Every penny."
        description="Search, sort, and edit your transactions."
        actions={
          <div className="flex items-center gap-2">
            {someSelected && (
              <DropdownMenu>
                <DropdownMenuTrigger className="btn-pill border border-ruby/50 text-ruby text-sm h-11 px-4">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Bulk ({selectedIds.size})
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Set category</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {selectedCats.map(c => (
                        <DropdownMenuItem key={c.name} onClick={() => bulkCategory(c.name)}>{c.name}</DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={bulkDelete} className="text-ruby">
                    <Trash2 className="h-4 w-4 mr-2" /> Delete {selectedIds.size}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger className="toolbar-chip">
                <MoreHorizontal className="h-3.5 w-3.5 mr-1" /> Actions
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={openAdd} data-testid="add-transaction">
                  <Plus className="h-4 w-4 mr-2" /> Add transaction
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCompareOpen(true)}>
                  <BarChart3 className="h-4 w-4 mr-2" /> Compare periods
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportCsv}>
                  <Download className="h-4 w-4 mr-2" /> Export CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap border-b border-border pb-2">
        {[
          { key: "ledger", label: "Ledger", icon: BarChart3 },
          { key: "maaser", label: "Maaser", icon: Star },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-t-lg transition-colors capitalize ${activeTab === tab.key ? "bg-card border-b-2 border-emerald font-medium" : "text-muted-foreground hover:text-foreground"}`}>
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ───── Ledger tab ───── */}
      {activeTab === "ledger" && <>
        {/* Unified filters card */}
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-card">
          {/* Row 1: Search + Sort + Filters trigger */}
          <div className="flex items-center gap-3 p-4">
            <label className="flex-1 flex items-center gap-3 rounded-xl border border-border bg-background/70 px-4 h-11">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); debouncedSetSearch(e.target.value); }}
                placeholder="Search descriptions, merchants, categories..."
                className="w-full bg-transparent outline-none text-sm" />
              {filters.search && <button onClick={() => { setSearchInput(""); setFilter("search", ""); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 h-11 text-sm">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <select aria-label="Sort transactions" value={`${filters.sort}-${filters.order}`} onChange={(e) => { const [s, o] = e.target.value.split("-"); setFilters(p => ({ ...p, sort: s, order: o })); }}
                className="bg-transparent outline-none">
                <option value="date-desc">Newest</option>
                <option value="date-asc">Oldest</option>
                <option value="amount-desc">Largest</option>
                <option value="amount-asc">Smallest</option>
              </select>
            </label>

            <Sheet>
              <SheetTrigger asChild>
                <button className={`btn-pill border text-sm h-11 px-4 ${activeFilters.length > 0 ? "border-emerald text-emerald" : "border-border"}`}>
                  <Filter className="h-4 w-4 mr-2" /> Filters
                  {activeFilters.length > 0 && <span className="ml-1">({activeFilters.length})</span>}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>Refine your transaction list</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <select value={filters.tx_type} onChange={(e) => toggleFilter("tx_type", e.target.value)} className="control-shell text-sm h-10">
                      <option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option>
                    </select>
                    <select value={filters.source} onChange={(e) => toggleFilter("source", e.target.value)} className="control-shell text-sm h-10">
                      <option value="">All sources</option>
                      {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select value={filters.category} onChange={(e) => toggleFilter("category", e.target.value)} className="control-shell text-sm h-10">
                      <option value="">All categories</option>
                      {selectedCats.map(c => <option key={c.category_id ?? `default-${c.name}`} value={c.name}>{c.name}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" placeholder="Min £" value={filters.amount_min}
                      onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, amount_min: e.target.value })); }}
                      className="control-shell text-sm h-10" />
                    <input type="number" min="0" step="0.01" placeholder="Max £" value={filters.amount_max}
                      onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, amount_max: e.target.value })); }}
                      className="control-shell text-sm h-10" />
                    <input type="date" value={filters.date_from} onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, date_from: e.target.value })); }} className="control-shell text-sm h-10" />
                    <input type="date" value={filters.date_to} onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, date_to: e.target.value })); }} className="control-shell text-sm h-10" />
                  </div>

                  <div className="border-t border-border pt-4 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">AI search</p>
                    <div className="flex items-center gap-2">
                      <input value={aiQuery} onChange={(e) => setAiQuery(e.target.value)}
                        placeholder="e.g. 'grocery spending last month'"
                        className="flex-1 control-shell text-sm h-10" onKeyDown={(e) => e.key === "Enter" && runAiSearch()} />
                      <button onClick={runAiSearch} disabled={aiLoading || !aiQuery.trim()}
                        className="btn-pill border border-emerald text-emerald text-sm h-10 disabled:opacity-50">
                        {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        <span className="ml-1.5">Search</span>
                      </button>
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
          </div>

          {/* Active filter chips */}
          {activeFilters.length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
              {activeFilters.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald/10 text-emerald border border-emerald/20">
                  {chip.label}
                  <button onClick={() => { setFilter(chip.key, ""); setOffset(0); }} className="hover:text-emerald/80"><X className="h-3 w-3" /></button>
                </span>
              ))}
              <button onClick={clearAllFilters} className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground">Clear</button>
            </div>
          )}

          {/* Compact summary stat line */}
          <div className="border-t border-border px-4 py-3 flex items-center justify-end gap-4 text-sm">
            <span>Income <span className="text-emerald font-medium tabular-nums">{fmt(incomeTotal)}</span></span>
            <span className="text-muted-foreground">|</span>
            <span>Expenses <span className="text-ruby font-medium tabular-nums">{fmt(expenseTotal)}</span></span>
            <span className="text-muted-foreground">|</span>
            <span>Net <span className={`font-medium tabular-nums ${netTotal >= 0 ? "text-emerald" : "text-ruby"}`}>{netTotal >= 0 ? "+" : ""}{fmt(netTotal)}</span></span>
          </div>
        </div>

        {/* Transaction table */}
        <SectionCard eyebrow="Ledger" title={`Transactions (${total})`}>
          {loading ? (
            <SkeletonTable rows={5} className="p-4" />
          ) : (aiResults?.transactions || txs).length === 0 ? (
            <EmptyState icon={Receipt}
              title={filters.search || filters.category || aiResults ? "No matching transactions" : "No transactions yet"}
              description="Try different filters or add your first transaction."
            />
          ) : (
            <>
              {/* Mobile card view with ⋮ actions */}
              <div className="block sm:hidden divide-y divide-border">
                {(aiResults?.transactions || txs).map((t) => (
                  <div key={t.transaction_id} style={{ contentVisibility: "auto" }} className={`px-4 py-3 space-y-1.5 ${selectedIds.has(t.transaction_id) ? "bg-emerald/5" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <input type="checkbox" checked={selectedIds.has(t.transaction_id)}
                          onChange={() => toggleSelect(t.transaction_id)}
                          className="h-4 w-4 rounded border-border accent-emerald cursor-pointer shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">{t.date?.slice(0, 10)}</p>
                          <p className="font-medium text-sm truncate">{t.description}</p>
                          {t.normalized_merchant && t.normalized_merchant !== t.description && (
                            <p className="text-xs text-muted-foreground truncate">{t.normalized_merchant}</p>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="p-2 text-muted-foreground hover:text-foreground" aria-label="Transaction actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(t)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => del(t.transaction_id)} className="text-ruby">
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center justify-between pl-6">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary capitalize">{t.category || "uncategorized"}</span>
                      <span className={`font-medium tabular-nums text-sm ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}>
                        {t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table with TransactionRow (⋮ actions handled by component) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox" checked={allDisplayedSelected} onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-border accent-emerald cursor-pointer" />
                    </th>
                    <th className="px-6 py-3">Date</th><th className="px-6 py-3">Description</th><th className="px-6 py-3">Category</th><th className="px-6 py-3 text-right">Amount</th><th className="px-6 py-3 w-12"></th>
                  </tr></thead>
                  <tbody>
                    {(aiResults?.transactions || txs).map((t) => (
                      <TransactionRow key={t.transaction_id} t={t}
                        isSelected={selectedIds.has(t.transaction_id)}
                        onToggleSelect={toggleSelect} onEdit={openEdit} onDelete={del} />
                    ))}
                  </tbody>
                </table>
              </div>

              {!aiResults && totalPages > 1 && (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
                      className="h-10 w-10 rounded-full grid place-items-center border border-border hover:bg-secondary disabled:opacity-30" aria-label="Previous page">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-muted-foreground min-w-[4rem] text-center">{currentPage} / {totalPages}</span>
                    <button onClick={() => setOffset(Math.min((totalPages - 1) * limit, offset + limit))} disabled={offset + limit >= total}
                      className="h-10 w-10 rounded-full grid place-items-center border border-border hover:bg-secondary disabled:opacity-30" aria-label="Next page">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </>}

      {/* ───── Maaser tab ───── */}
      {activeTab === "maaser" && <>
        <MaaserPanel />
      </>}

      <TransactionForm open={open} editingId={editingId} form={form} setForm={setForm}
        selectedCats={selectedCats} onClose={closeForm} onSubmit={submit}
        onClassify={handleClassify} classifying={classifying} classification={classification}
        onClearClassification={clearClassification}
        saveAsRecurring={saveAsRecurring} setSaveAsRecurring={setSaveAsRecurring} />

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

export default Transactions;

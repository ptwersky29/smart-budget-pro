import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Plus, Trash2, Loader2, Pencil, Search, ArrowUpDown, Sparkles, Filter, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, BarChart3, Star } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader, SectionCard } from "../components/ui/layout";
import ComparePeriods from "../components/ComparePeriods";
import MaaserPanel from "../components/MaaserPanel";

const SOURCE_LABELS = { manual: "Manual", truelayer: "Bank", csv: "CSV", pdf: "PDF", statement: "Statement", sms: "SMS" };
const emptyForm = { description: "", amount: "", category: "", is_income: false };

function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const fmt = (n) => `£${Number(n || 0).toFixed(2)}`;

export default function Transactions() {
  const [txs, setTxs] = useState([]);
  const [total, setTotal] = useState(0);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedCats, setSelectedCats] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showAiSearch, setShowAiSearch] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("ledger");

  const [filters, setFilters] = useState({
    search: "", category: "", source: "", tx_type: "",
    date_from: firstOfMonth(), date_to: today(),
    amount_min: "", amount_max: "",
    sort: "date", order: "desc",
  });
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const debounceRef = useRef(null);

  const setFilter = (key, value) => {
    setOffset(0);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const toggleFilter = (key, value) => {
    setOffset(0);
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? "" : value }));
  };

  const debouncedSetSearch = (value) => {
    setOffset(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: value }));
    }, 300);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

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
    } catch (err) { console.error("tx load", err); }
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
    if (filters.source) chips.push({ key: "source", label: `Source: ${SOURCE_LABELS[filters.source] || filters.source}` });
    if (filters.category) chips.push({ key: "category", label: `Category: ${filters.category}` });
    if (filters.amount_min) chips.push({ key: "amount_min", label: `Min: ${fmt(filters.amount_min)}` });
    if (filters.amount_max) chips.push({ key: "amount_max", label: `Max: ${fmt(filters.amount_max)}` });
    if (filters.date_from) chips.push({ key: "date_from", label: `From: ${filters.date_from}` });
    if (filters.date_to) chips.push({ key: "date_to", label: `To: ${filters.date_to}` });
    return chips;
  }, [filters]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (t) => {
    setEditingId(t.transaction_id);
    setForm({ description: t.description || "", amount: String(Math.abs(t.amount)), category: t.category || "", is_income: t.amount > 0 });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const amt = parseFloat(form.amount);
      const signed = form.is_income ? Math.abs(amt) : -Math.abs(amt);
      if (editingId) {
        await api.patch(`/transactions/${editingId}`, { description: form.description, amount: signed, category: form.category || undefined, is_income: form.is_income });
        toast.success("Transaction updated");
      } else {
        await api.post("/transactions", { description: form.description, amount: signed, category: form.category || undefined, is_income: form.is_income });
        toast.success("Transaction added");
      }
      setOpen(false); setEditingId(null); setForm(emptyForm); await load();
    } catch { toast.error(editingId ? "Could not update" : "Could not add"); }
  };

  const [selectedIds, setSelectedIds] = useState(new Set());

  const allDisplayed = aiResults?.transactions || txs;
  const someSelected = selectedIds.size > 0;
  const allDisplayedSelected = allDisplayed.length > 0 && allDisplayed.every(t => selectedIds.has(t.transaction_id));

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allDisplayedSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allDisplayed.map(t => t.transaction_id)));
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} transaction${selectedIds.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    try {
      const { data } = await api.post("/transactions/bulk-delete", { transaction_ids: Array.from(selectedIds) });
      toast.success(`Deleted ${data.deleted} transaction${data.deleted > 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      await load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Could not delete"); }
  };

  const clearAllMatching = async () => {
    const label = filters.source ? `all "${SOURCE_LABELS[filters.source] || filters.source}" transactions` : "all matching transactions";
    if (!window.confirm(`Delete ${label} (${total} total)? This cannot be undone.`)) return;
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
      toast.success(`Deleted ${data.deleted} transaction${data.deleted > 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      await load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Could not clear"); }
  };

  const del = async (id) => {
    try { await api.delete(`/transactions/${id}`); toast.success("Deleted"); await load(); }
    catch { toast.error("Could not delete"); }
  };

  const runAiSearch = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true); setAiResults(null);
    try {
      const { data } = await api.post("/transactions/ai-search", null, { params: { q: aiQuery } });
      setAiResults(data);
      if (data.transactions.length === 0) toast.info("No AI matches found");
      else toast.success(`AI found ${data.total} matches`);
    } catch (e) { toast.error(formatApiError(e) || "AI search failed"); }
    finally { setAiLoading(false); }
  };

  const netTotal = incomeTotal - expenseTotal;

  return (
    <div className="space-y-6" data-testid="transactions-root">
      <PageHeader
        eyebrow="Money"
        title="Every penny."
        description="Search, sort, and edit your transactions."
        actions={
          <div className="flex items-center gap-2">
            {someSelected && (
              <button onClick={bulkDelete} className="btn-pill border border-ruby text-ruby text-sm h-11 px-4">
                <Trash2 className="h-4 w-4 mr-1.5" /> Delete {selectedIds.size}
              </button>
            )}
            {(filters.source || filters.category || filters.tx_type || filters.search) && total > 0 && (
              <button onClick={clearAllMatching} className="btn-pill border border-ruby/60 text-ruby/80 text-sm h-11 px-4">
                <Trash2 className="h-4 w-4 mr-1.5" /> Clear all {total}
              </button>
            )}
            <button onClick={() => setCompareOpen(true)} className="btn-pill border border-topaz text-topaz text-sm h-11 px-4">
              <BarChart3 className="h-4 w-4 mr-1.5" /> Compare Periods
            </button>
            <button onClick={openAdd} data-testid="add-transaction" className="btn-pill gradient-emerald text-white text-sm h-11 px-5">
              <Plus className="h-4 w-4 mr-2" /> Add transaction
            </button>
          </div>
        }
      />

      {/* Tab navigation */}
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

      {activeTab === "ledger" && <>
        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border bg-card/80 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Income</p>
            <p className="mt-1 text-xl tracking-tight font-medium text-emerald">{fmt(incomeTotal)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card/80 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Expenses</p>
            <p className="mt-1 text-xl tracking-tight font-medium text-ruby">{fmt(expenseTotal)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card/80 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Net</p>
            <p className={`mt-1 text-xl tracking-tight font-medium ${netTotal >= 0 ? "text-emerald" : "text-ruby"}`}>
              {netTotal >= 0 ? "+" : ""}{fmt(netTotal)}
            </p>
          </div>
        </div>

      {/* Filter bar */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_auto] gap-3 items-center rounded-[1.5rem] border border-border bg-card/90 backdrop-blur-xl p-4">
        <label className="flex items-center gap-3 rounded-xl border border-border bg-background/70 px-4 h-11">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input defaultValue={filters.search} onChange={(e) => debouncedSetSearch(e.target.value)}
            placeholder="Search descriptions, merchants, categories..."
            className="w-full bg-transparent outline-none text-sm" />
          {filters.search && <button onClick={() => { setFilter("search", ""); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </label>

        <label className="flex items-center gap-2 rounded-xl border border-border bg-background/70 px-4 h-11 text-sm">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <select value={`${filters.sort}-${filters.order}`} onChange={(e) => { const [s, o] = e.target.value.split("-"); setFilters(p => ({ ...p, sort: s, order: o })); }}
            className="bg-transparent outline-none">
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="amount-desc">Largest amount</option>
            <option value="amount-asc">Smallest amount</option>
          </select>
        </label>

        <button onClick={() => setShowFilters(!showFilters)} className={`btn-pill border text-sm h-11 px-4 ${showFilters ? "border-emerald text-emerald" : "border-border"}`}>
          <Filter className="h-4 w-4 mr-2" /> Filters
        </button>
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((chip) => (
            <span key={chip.key} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-emerald/10 text-emerald border border-emerald/20">
              {chip.label}
              <button onClick={() => { setFilter(chip.key, ""); setOffset(0); }} className="hover:text-emerald/80"><X className="h-3 w-3" /></button>
            </span>
          ))}
          <button onClick={() => { setFilters({ ...filters, tx_type: "", source: "", category: "", amount_min: "", amount_max: "", date_from: firstOfMonth(), date_to: today() }); setOffset(0); }}
            className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-muted-foreground text-muted-foreground">
            Clear all
          </button>
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-[1.5rem] border border-border bg-card/90 backdrop-blur-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs text-muted-foreground">Type</label>
              <select value={filters.tx_type} onChange={(e) => toggleFilter("tx_type", e.target.value)} className="control-shell text-sm h-10">
                <option value="">All</option><option value="income">Income</option><option value="expense">Expense</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs text-muted-foreground">Source</label>
              <select value={filters.source} onChange={(e) => toggleFilter("source", e.target.value)} className="control-shell text-sm h-10">
                <option value="">All</option>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs text-muted-foreground">Category</label>
              <select value={filters.category} onChange={(e) => toggleFilter("category", e.target.value)} className="control-shell text-sm h-10">
                <option value="">All</option>
                {selectedCats.map(c => <option key={c.category_id ?? `default-${c.name}`} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-xs text-muted-foreground">Amount min</label>
              <input type="number" min="0" step="0.01" placeholder="£" value={filters.amount_min}
                onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, amount_min: e.target.value })); }}
                className="control-shell text-sm h-10" />
            </div>
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-xs text-muted-foreground">Amount max</label>
              <input type="number" min="0" step="0.01" placeholder="£" value={filters.amount_max}
                onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, amount_max: e.target.value })); }}
                className="control-shell text-sm h-10" />
            </div>
            <div className="flex flex-col gap-1 min-w-[150px]">
              <label className="text-xs text-muted-foreground">From</label>
              <input type="date" value={filters.date_from} onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, date_from: e.target.value })); }} className="control-shell text-sm h-10" />
            </div>
            <div className="flex flex-col gap-1 min-w-[150px]">
              <label className="text-xs text-muted-foreground">To</label>
              <input type="date" value={filters.date_to} onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, date_to: e.target.value })); }} className="control-shell text-sm h-10" />
            </div>
          </div>

          {/* AI search collapsible */}
          <div className="border-t border-border pt-3">
            <button onClick={() => setShowAiSearch(!showAiSearch)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
              {showAiSearch ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              <Sparkles className="h-3 w-3" /> AI natural-language search
            </button>
            {showAiSearch && (
              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1 flex items-center gap-2">
                  <input value={aiQuery} onChange={(e) => setAiQuery(e.target.value)}
                    placeholder="e.g. 'grocery spending last month'"
                    className="flex-1 control-shell text-sm h-10" onKeyDown={(e) => e.key === "Enter" && runAiSearch()} />
                  <button onClick={runAiSearch} disabled={aiLoading || !aiQuery.trim()} className="btn-pill border border-emerald text-emerald text-sm h-10 disabled:opacity-50">
                    {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    <span className="ml-1.5 hidden sm:inline">Search</span>
                  </button>
                </div>
              </div>
            )}
            {aiResults && (
              <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-3 text-sm mt-2">
                <p className="font-medium text-emerald mb-1">AI results for &ldquo;{aiResults.query}&rdquo; ({aiResults.total} matches)</p>
                <button onClick={() => { setAiResults(null); setAiQuery(""); }} className="text-xs text-muted-foreground hover:text-foreground">Clear AI search</button>
              </div>
            )}
          </div>
        </div>
      )}

      <SectionCard eyebrow="Ledger" title={`Transactions (${total})`}>
        {loading ? (
          <div className="p-10 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-emerald" /></div>
        ) : (aiResults?.transactions || txs).length === 0 ? (
          <EmptyState
            title={filters.search || filters.category || aiResults ? "No matching transactions" : "No transactions yet"}
            description="Try different filters or add your first transaction."
            className="border-0 bg-transparent shadow-none p-2"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allDisplayedSelected} onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-border accent-emerald cursor-pointer" />
                  </th>
                  <th className="px-6 py-3">Date</th><th className="px-6 py-3">Description</th><th className="px-6 py-3">Category</th><th className="px-6 py-3 text-right">Amount</th><th className="px-6 py-3 w-24"></th>
                </tr></thead>
                <tbody>
                  {(aiResults?.transactions || txs).map((t) => (
                    <tr key={t.transaction_id} className={`border-b border-border last:border-0 hover:bg-secondary/30 ${selectedIds.has(t.transaction_id) ? "bg-emerald/5" : ""}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedIds.has(t.transaction_id)} onChange={() => toggleSelect(t.transaction_id)}
                          className="h-4 w-4 rounded border-border accent-emerald cursor-pointer" />
                      </td>
                      <td className="px-6 py-3 text-xs text-muted-foreground">{t.date?.slice(0, 10)}</td>
                      <td className="px-6 py-3">
                        <div className="font-medium">{t.description}</div>
                        {t.normalized_merchant && t.normalized_merchant !== t.description && (
                          <div className="text-xs text-muted-foreground">{t.normalized_merchant}</div>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-xs px-2 py-1 rounded-full bg-secondary capitalize">{t.category || "uncategorized"}</span>
                        {t.source_label && <span className="text-xs text-muted-foreground ml-1.5">{t.source_label}</span>}
                      </td>
                      <td className={`px-6 py-3 text-right font-medium tabular-nums ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}>
                        {t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <button onClick={() => openEdit(t)} data-testid={`edit-${t.transaction_id}`} className="text-muted-foreground hover:text-emerald mr-3" title="Edit"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => del(t.transaction_id)} data-testid={`del-${t.transaction_id}`} className="text-muted-foreground hover:text-ruby" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!aiResults && totalPages > 1 && (
              <div className="px-6 py-4 border-t border-border flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
                    className="h-8 w-8 rounded-full grid place-items-center border border-border hover:bg-secondary disabled:opacity-30">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-muted-foreground min-w-[4rem] text-center">{currentPage} / {totalPages}</span>
                  <button onClick={() => setOffset(Math.min((totalPages - 1) * limit, offset + limit))} disabled={offset + limit >= total}
                    className="h-8 w-8 rounded-full grid place-items-center border border-border hover:bg-secondary disabled:opacity-30">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>

      </>}

      {activeTab === "maaser" && <>
        <MaaserPanel />
      </>}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="page-shell p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl tracking-tight font-medium mb-4">{editingId ? "Edit transaction" : "New transaction"}</h3>
            <form onSubmit={submit} className="space-y-3">
              <input data-testid="tx-desc" required placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full control-shell" />
              <input data-testid="tx-amount" required type="number" step="0.01" placeholder="Amount (£)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full control-shell" />
              <select data-testid="tx-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full control-shell">
                <option value="">Auto-categorise</option>
                {selectedCats.map(c => <option key={c.category_id ?? `default-${c.name}`} value={c.name}>{c.name}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_income} onChange={(e) => setForm({ ...form, is_income: e.target.checked })} /> This is income</label>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary/50 text-sm">Cancel</button>
                <button data-testid="tx-submit" className="btn-pill flex-1 gradient-emerald text-white">{editingId ? "Save changes" : "Add transaction"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ComparePeriods open={compareOpen} onClose={() => setCompareOpen(false)} />
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Plus, Trash2, Loader2, Pencil, Search, ArrowUpDown, Sparkles, Filter, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader, SectionCard } from "../components/ui/layout";

const SOURCE_LABELS = { manual: "Manual", truelayer: "Bank", csv: "CSV", pdf: "PDF", statement: "Statement", sms: "SMS" };
const emptyForm = { description: "", amount: "", category: "", is_income: false };

export default function Transactions() {
  const [txs, setTxs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedCats, setSelectedCats] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState({
    search: "", category: "", source: "", tx_type: "",
    date_from: "", date_to: "", sort: "date", order: "desc",
  });
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const toggleFilter = (key, value) => {
    setOffset(0);
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? "" : value }));
  };

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
      const { data } = await api.get("/transactions", { params });
      setTxs(data.transactions);
      setTotal(data.total);
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

  return (
    <div className="space-y-6" data-testid="transactions-root">
      <PageHeader
        eyebrow="Money"
        title="Every penny."
        description="Search, sort, and edit your transactions."
        actions={
          <button onClick={openAdd} data-testid="add-transaction" className="btn-pill gradient-emerald text-white text-sm h-11 px-5">
            <Plus className="h-4 w-4 mr-2" /> Add transaction
          </button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_auto] gap-3 items-center rounded-[1.5rem] border border-border bg-card/90 backdrop-blur-xl p-4">
        <label className="flex items-center gap-3 rounded-xl border border-border bg-background/70 px-4 h-11">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input value={filters.search} onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, search: e.target.value })); }}
            placeholder="Search descriptions, merchants, categories..."
            className="w-full bg-transparent outline-none text-sm" />
          {filters.search && <button onClick={() => { setOffset(0); setFilters(p => ({ ...p, search: "" })); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
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
                {selectedCats.map(c => <option key={c.category_id} value={c.name}>{c.name}</option>)}
              </select>
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

          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1 flex items-center gap-2">
              <input value={aiQuery} onChange={(e) => setAiQuery(e.target.value)}
                placeholder="AI search: e.g. 'grocery spending last month'"
                className="flex-1 control-shell text-sm h-10" onKeyDown={(e) => e.key === "Enter" && runAiSearch()} />
              <button onClick={runAiSearch} disabled={aiLoading || !aiQuery.trim()} className="btn-pill border border-emerald text-emerald text-sm h-10 disabled:opacity-50">
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="ml-1.5 hidden sm:inline">AI Search</span>
              </button>
            </div>
          </div>

          {aiResults && (
            <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-3 text-sm">
              <p className="font-medium text-emerald mb-1">AI results for &ldquo;{aiResults.query}&rdquo; ({aiResults.total} matches)</p>
              <button onClick={() => { setAiResults(null); setAiQuery(""); }} className="text-xs text-muted-foreground hover:text-foreground">Clear AI search</button>
            </div>
          )}
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
                  <th className="px-6 py-3">Date</th><th className="px-6 py-3">Description</th><th className="px-6 py-3">Category</th><th className="px-6 py-3 text-right">Amount</th><th className="px-6 py-3 w-24"></th>
                </tr></thead>
                <tbody>
                  {(aiResults?.transactions || txs).map((t) => (
                    <tr key={t.transaction_id} className="border-b border-border last:border-0 hover:bg-secondary/30">
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

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="page-shell p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl tracking-tight font-medium mb-4">{editingId ? "Edit transaction" : "New transaction"}</h3>
            <form onSubmit={submit} className="space-y-3">
              <input data-testid="tx-desc" required placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full control-shell" />
              <input data-testid="tx-amount" required type="number" step="0.01" placeholder="Amount (£)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full control-shell" />
              <select data-testid="tx-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full control-shell">
                <option value="">Auto-categorise</option>
                {selectedCats.map(c => <option key={c.category_id} value={c.name}>{c.name}</option>)}
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
    </div>
  );
}

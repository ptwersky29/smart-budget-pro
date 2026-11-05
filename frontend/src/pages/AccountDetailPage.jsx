import PenniSelect from "../components/PenniSelect";
import { useActions } from "../contexts/ActionContext";
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { getDisplayName } from "../lib/utils";
import { CURRENCY_SYMBOL } from "../data/constants";
import { getBankLogoOrFallback, pickBankInstitution } from "../data/bankLogos";
import { ArrowLeft, Wallet, PiggyBank, Lock, Pencil, Trash2, Loader2, Receipt, CreditCard, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, X, Filter, Plus, Upload, FileText, AlertCircle, RefreshCcw, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { MetricCard, SectionCard, EmptyState } from "../components/ui/layout";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../components/ui/sheet";
import CategoryCombobox from "../components/CategoryCombobox";
import AccountFormModal from "../components/AccountFormModal";
import ConfirmModal from "../components/ui/ConfirmModal";
import TransactionForm from "../components/TransactionForm";
import TransactionInspectorPanel from "../components/TransactionInspectorPanel";
import GroupedTransactionItems from "../components/GroupedTransactionItems";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../components/ui/dropdown-menu";
import { withUndo } from "../lib/undo";
import { useCategories } from "../contexts/CategoriesContext";
import { formatCurrency, formatShortDate, formatDateTime } from "../lib/format";

const ACCOUNT_TYPE_META = {
  current: { icon: Wallet, label: "Current Account", color: "text-emerald", bg: "bg-emerald/10" },
  savings: { icon: PiggyBank, label: "Savings", color: "text-violet", bg: "bg-violet/10" },
  cash: { icon: Wallet, label: "Cash", color: "text-topaz", bg: "bg-topaz/10" },
  credit: { icon: CreditCard, label: "Credit Card", color: "text-ruby", bg: "bg-ruby/10" },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AccountDetailPage() {
  const { openAction } = useActions();
  const { accountId } = useParams();
  const navigate = useNavigate();
  useEffect(() => { document.title = "Account | Penni"; }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reconnected") === "1") {
      toast.success("Bank reconnected — syncing transactions...");
      params.delete("reconnected");
      window.history.replaceState({}, "", `${window.location.pathname}`);
    }
  }, []);

  const [account, setAccount] = useState(null);
  const [txs, setTxs] = useState([]);
  const [totalTx, setTotalTx] = useState(0);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState(null);
  const [txForm, setTxForm] = useState({ description: "", date: today(), amount: "", category: "", is_income: false, is_transfer: false, budget_type: "", occasion: "", merchant: "", notes: "", account_id: accountId });
  const [allAccounts, setAllAccounts] = useState([]);
  const [allAccountsLoading, setAllAccountsLoading] = useState(false);
  const { categories: selectedCats, version: categoriesVersion } = useCategories();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingDeleteTxId, setPendingDeleteTxId] = useState(null);
  const [tlConn, setTlConn] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = React.useRef(null);

  const loadTlConn = useCallback(async () => {
    try {
      const { data } = await api.get("/truelayer/connections");
      const conn = (data.connections || []).find(c => c.account_id === accountId);
      setTlConn(conn || null);
    } catch { }
  }, [accountId]);

  const isTokenExpired = tlConn && tlConn.expires_at && new Date(tlConn.expires_at) < new Date();
  const needsReconnect = tlConn && (tlConn.status === "reconnect_required" || isTokenExpired);

  const reconnectConn = async () => {
    if (!tlConn) return;
    try {
      const { data } = await api.post(`/truelayer/reconnect/${tlConn.connection_id}`);
      window.location.href = data.auth_url;
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Reconnect failed");
    }
  };

  const [showSearch, setShowSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const defaultFilters = useMemo(() => ({ search: "", category: "", tx_type: "", date_from: "", date_to: "", amount_min: "", amount_max: "", sort: "date", order: "desc" }), []);
  const [filters, setFilters] = useState(defaultFilters);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [inspectedTransaction, setInspectedTransaction] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [wideLayout, setWideLayout] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  const requestRef = useRef(0);
  const scrollRef = useRef(null);
  const loadMoreRef = useRef(null);
  const limit = 100;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setWideLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const debounceRef = React.useRef(null);

  const setFilter = useCallback((key, value) => { setOffset(0); setFilters((prev) => ({ ...prev, [key]: value })); }, []);
  const debouncedSetSearch = useCallback((value) => {
    setOffset(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setFilters((prev) => ({ ...prev, search: value })); }, 300);
  }, []);

  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, []);

  const activeFilters = useMemo(() => {
    const chips = [];
    if (filters.tx_type) chips.push({ key: "tx_type", label: filters.tx_type === "income" ? "Income" : "Expense" });
    if (filters.category) chips.push({ key: "category", label: filters.category });
    if (filters.amount_min) chips.push({ key: "amount_min", label: `≥${CURRENCY_SYMBOL}${filters.amount_min}` });
    if (filters.amount_max) chips.push({ key: "amount_max", label: `≤${CURRENCY_SYMBOL}${filters.amount_max}` });
    if (filters.date_from) chips.push({ key: "date_from", label: `From ${filters.date_from}` });
    if (filters.date_to) chips.push({ key: "date_to", label: `To ${filters.date_to}` });
    return chips;
  }, [filters]);

  const loadAccounts = useCallback(async () => {
    setAllAccountsLoading(true);
    try {
      const { data } = await api.get("/accounts");
      setAllAccounts(data.accounts || []);
    } catch { toast.error("Could not load accounts"); }
    finally { setAllAccountsLoading(false); }
  }, []);

  const loadAccount = useCallback(async () => {
    try {
      const { data } = await api.get(`/accounts/${accountId}`);
      setAccount(data);
      document.title = `${getDisplayName(data)} | Penni`;
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || "Could not load account");
    } finally { setLoading(false); }
  }, [account?.account_id, accountId]);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get(`/statements?account_id=${accountId}`);
      setUploadHistory(data.statements || data || []);
    } catch { toast.error("Could not load statement history"); }
  }, [accountId]);


  const loadTransactions = useCallback(async () => {
    const targetId = account?.account_id || accountId;
    if (!targetId) return;
    const requestId = ++requestRef.current;
    if (offset === 0) setTxLoading(true);
    else setLoadingMore(true);
    try {
      const params = { account_id: targetId, limit, sort: filters.sort, order: filters.order, offset };
      if (filters.search) params.search = filters.search;
      if (filters.category) params.category = filters.category;
      if (filters.tx_type) params.tx_type = filters.tx_type;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.amount_min && !isNaN(filters.amount_min)) params.amount_min = parseFloat(filters.amount_min);
      if (filters.amount_max && !isNaN(filters.amount_max)) params.amount_max = parseFloat(filters.amount_max);
      const { data } = await api.get("/transactions", { params });
      if (requestId !== requestRef.current) return;
      const incoming = data.transactions || [];
      setTxs((previous) => {
        if (offset === 0) return incoming;
        const seen = new Set(previous.map((tx) => tx.transaction_id));
        return [...previous, ...incoming.filter((tx) => !seen.has(tx.transaction_id))];
      });
      setTotalTx(Number(data.total || 0));
      setIncomeTotal(Number(data.income_total || 0));
      setExpenseTotal(Number(data.expense_total || 0));
    } catch {
      if (requestId === requestRef.current) toast.error("Could not load transactions");
    } finally {
      if (requestId === requestRef.current) {
        setTxLoading(false);
        setLoadingMore(false);
      }
    }
  }, [account?.account_id, accountId, filters, offset]);

  useEffect(() => { loadAccount(); loadHistory(); loadTlConn(); }, [loadAccount, loadHistory, loadTlConn]);
  useEffect(() => {
    const refresh = () => { loadAccount(); loadTransactions(); loadHistory(); };
    window.addEventListener("penni:data-changed", refresh);
    return () => window.removeEventListener("penni:data-changed", refresh);
  }, [loadAccount, loadTransactions, loadHistory]);
  useEffect(() => { if (account) loadTransactions(); }, [account?.account_id, loadTransactions]);

  // Load the next batch into the same list as the user approaches its bottom.
  useEffect(() => {
    const trigger = loadMoreRef.current;
    const scrollArea = scrollRef.current;
    if (!trigger || !scrollArea || txLoading || loadingMore || txs.length >= totalTx) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setOffset(txs.length);
    }, { root: scrollArea, rootMargin: "180px" });
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [txs.length, totalTx, txLoading, loadingMore]);

  const refreshTransactions = useCallback(async () => {
    if (offset !== 0) setOffset(0);
    else await loadTransactions();
  }, [offset, loadTransactions]);

  const openEditTx = useCallback((t) => {
    setEditingTxId(t.transaction_id);
    setTxForm({ description: t.description || "", date: t.date?.slice(0, 10) || today(), amount: String(Math.abs(t.amount)), category: t.category || "", account_id: t.account_id || "", is_income: t.amount > 0, is_transfer: t.is_transfer || false, budget_type: "", occasion: "", merchant: t.merchant || "", notes: t.notes || "" });
    setTxFormOpen(true);
  }, []);

  const closeTxForm = useCallback(() => {
    setTxFormOpen(false);
    setEditingTxId(null);
    setTxForm({ description: "", date: today(), amount: "", category: "", is_income: false, is_transfer: false, budget_type: "", occasion: "", merchant: "", notes: "", account_id: account?.account_id || accountId });
  }, [accountId]);

  const txsRef = useRef(txs);

  useEffect(() => { txsRef.current = txs; }, [txs]);

  const deleteTx = useCallback((txId) => {
    setPendingDeleteTxId(txId);
  }, []);

  const confirmTransactionDelete = async () => {
    const txId = pendingDeleteTxId;
    setPendingDeleteTxId(null);
    if (!txId) return;
    try {
      await api.delete(`/transactions/${txId}`);
      await refreshTransactions();
      toast.success("Transaction permanently deleted");
    } catch (e) {
      toast.error(formatApiError(e) || "Could not delete transaction");
      await refreshTransactions();
    }
  };

  const handleAddTransaction = useCallback(async (e) => {
    e.preventDefault();
    if (!txForm.account_id) { toast.error("Select an account"); return; }
    const amt = parseFloat(txForm.amount);
    if (!amt) { toast.error("Enter an amount"); return; }
    const signed = txForm.is_income ? Math.abs(amt) : -Math.abs(amt);
    const payload = { description: txForm.description, amount: signed, category: txForm.category || undefined, date: txForm.date || today(), merchant: txForm.merchant || undefined, notes: txForm.notes || undefined, account_id: txForm.account_id, is_income: txForm.is_income, is_transfer: txForm.is_transfer || undefined };
    if (editingTxId) {
      const old = txs.find(t => t.transaction_id === editingTxId);
      setTxs(prev => prev.map(t => t.transaction_id === editingTxId ? { ...t, ...payload } : t));
      withUndo({
        action: () => api.patch(`/transactions/${editingTxId}`, payload),
        undo: async () => {
          if (old) { await api.patch(`/transactions/${editingTxId}`, { description: old.description, amount: old.amount, category: old.category || undefined, is_income: old.is_income, account_id: old.account_id || undefined }); }
          await refreshTransactions();
        },
        onError: () => { if (old) setTxs(prev => prev.map(t => t.transaction_id === editingTxId ? old : t)); refreshTransactions(); },
        successMsg: "Transaction updated",
        errorMsg: "Could not update",
      });
      closeTxForm();
    } else {
      try {
        await api.post("/transactions", payload);
        toast.success("Transaction added");
        closeTxForm();
        await refreshTransactions();
      } catch (e) {
        toast.error(formatApiError(e?.response?.data?.detail) || "Could not add transaction");
      }
    }
  }, [txForm, accountId, editingTxId, txs, loadTransactions, closeTxForm]);

  const handleUpload = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File too large — max 5 MB"); return; }
    setUploadBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("account_id", accountId);
    try {
      const { data } = await api.post("/statements/upload", fd);
      toast.success(`${data.transaction_count || 0} transactions extracted — review before saving`);
      setUploadOpen(false);
      openAction("statement-import", { draft: data, accountId });
    } catch (e) { toast.error(formatApiError(e) || "Upload failed"); }
    finally { setUploadBusy(false); }
  };

  const deleteAccount = () => setConfirmDelete(true);

  const handleConfirmDelete = async () => {
    setConfirmDelete(false);
    try {
      await api.delete(`/accounts/${accountId}`);
      toast.success("Account deleted");
      navigate("/accounts");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Could not delete");
    }
  };

  const meta = ACCOUNT_TYPE_META[account?.type] || ACCOUNT_TYPE_META.current;
  const Icon = meta.icon;
  const dispName = getDisplayName(account);
  const initials = dispName
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const isSavings = account?.type === "savings";
  const brandInstitution = pickBankInstitution(account?.provider, account?.name);
  const bankLogoUrl = !account?.image && brandInstitution ? getBankLogoOrFallback(brandInstitution) : null;

  if (loading && !error) return (
    <div className="space-y-6">
        <div className="h-12 w-64 max-w-full rounded-2xl bg-secondary/50 animate-pulse" />
      <div className="h-44 rounded-[1.75rem] bg-secondary/30 animate-pulse" />
      <div className="h-96 rounded-2xl bg-secondary/20 animate-pulse" />
    </div>
  );

  if (error) return (
    <div className="grid place-items-center min-h-[60vh] text-center p-8">
      <div>
        <p className="text-lg font-medium text-muted-foreground">{error}</p>
        <Button onClick={() => navigate("/accounts")} variant="outlinePill" size="pillSm" className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to accounts
        </Button>
      </div>
    </div>
  );

  if (!account) return null;

  const balanceFmt = Number(account.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="account-detail-workspace page-stack pb-4">
      <button onClick={() => navigate("/accounts")}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> All Accounts
      </button>

      {/* Hero card */}
      <div className={`account-detail-hero relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-card via-card/95 to-card/90 backdrop-blur-xl shadow-card ${isSavings ? "ring-1 ring-violet/10" : ""}`}>
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl pointer-events-none" style={{ background: `${account.color || "#059669"}15` }} />

        <div className="relative p-4 sm:p-5 lg:flex lg:flex-wrap lg:items-center lg:gap-x-6 lg:gap-y-2">
          <div className="flex min-w-0 items-start gap-3 lg:flex-1">
            {/* Logo */}
            {account.image ? (
              <div className="shrink-0 h-12 w-12 rounded-full overflow-hidden ring-4 ring-white dark:ring-gray-800 shadow-md">
                <img src={account.image} alt={account.name} className="h-12 w-12 object-cover" />
              </div>
            ) : bankLogoUrl ? (
              <div className="shrink-0 h-12 w-12 rounded-full overflow-hidden ring-4 ring-white dark:ring-gray-800 shadow-md bg-white dark:bg-secondary/40 flex items-center justify-center p-2">
                <img src={bankLogoUrl} alt={dispName} className="h-full w-full object-contain"
                  onError={(e) => { e.target.onerror = null; e.target.style.display = "none"; e.target.parentElement.className = "shrink-0 h-12 w-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-md ring-4 ring-white dark:ring-gray-800"; e.target.parentElement.style.background = account.color || "#059669"; e.target.parentElement.innerText = initials; }} />
              </div>
            ) : (
              <div className="shrink-0 h-12 w-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-md ring-4 ring-white dark:ring-gray-800"
                style={{ background: account.color || "#059669" }}>
                {initials}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{dispName}</h1>
                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full ${meta.bg} ${meta.color} font-medium`}>
                  <Icon className="h-3 w-3" /> {meta.label}
                </span>
                {isSavings && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet/10 text-violet border border-violet/20">
                    <Lock className="h-3 w-3" /> Locked
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-end gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    {isSavings ? "Saved" : "Available Balance"}
                  </p>
                  <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${isSavings ? "text-violet" : ""}`}>
                    {CURRENCY_SYMBOL}{balanceFmt}
                  </p>
                </div>
                {account.balance_updated_at && (
                  <p className="text-[10px] text-muted-foreground mb-1">
                    Updated {formatDateTime(account.balance_updated_at)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-3 flex flex-wrap items-center gap-2 lg:mt-0">
            <Button onClick={() => { closeTxForm(); setTxFormOpen(true); loadAccounts(); }} variant="outlinePill" size="pillSm" className="bg-emerald text-white hover:bg-emerald/90 border-emerald/30">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Transaction
            </Button>
            <Button onClick={() => setUploadOpen(true)} variant="outlinePill" size="pillSm">
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Import statement
            </Button>
            <Button onClick={() => setShowEdit(true)} variant="outlinePill" size="pillSm">
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
            <Button onClick={deleteAccount} variant="outlinePill" size="pillSm" className="text-ruby border-ruby/30 hover:bg-ruby/5">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
            </Button>
          </div>

          {needsReconnect && (
            <div className="mt-3 w-full rounded-xl border border-ruby/40 bg-ruby/5 p-3 flex items-center gap-3">
              <AlertCircle className="h-4 w-4 text-ruby shrink-0" />
              <p className="text-xs text-ruby flex-1">This bank connection has expired. Reconnect it to resume syncing transactions.</p>
              <Button onClick={reconnectConn} variant="danger" size="pillSm">
                <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Reconnect
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className={`account-detail-main grid min-h-0 min-w-0 grid-cols-1 gap-4 ${inspectedTransaction && wideLayout ? "lg:grid-cols-[minmax(0,1fr)_328px]" : ""}`}>
        <div className="account-detail-primary min-h-0 min-w-0">
          {/* Transactions */}
          <SectionCard eyebrow="Transactions" title={`${totalTx} transaction${totalTx !== 1 ? "s" : ""}`} className="account-detail-transaction-section" contentClassName="account-detail-transaction-content">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 pb-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>Income <strong className="text-emerald font-medium tabular-nums">{formatCurrency(incomeTotal)}</strong></span>
            <span className="text-muted-foreground/30">·</span>
            <span>Expenses <strong className="text-ruby font-medium tabular-nums">{formatCurrency(expenseTotal)}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" aria-label="Search account transactions" aria-expanded={showSearch} onClick={() => setShowSearch((s) => !s)}
              className={`h-8 w-8 rounded-full grid place-items-center transition-all ${showSearch || filters.search ? "bg-emerald text-white" : "text-muted-foreground hover:bg-secondary/60"}`}>
              <Search className="h-3.5 w-3.5" />
            </button>

            <PenniSelect aria-label="Sort account transactions" value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}
              className="h-8 px-2 rounded-lg bg-secondary/50 border border-border/50 text-[11px] font-medium focus:outline-none focus:border-ring">
              <option value="date">Date</option>
              <option value="amount">Amount</option>
              <option value="description">Description</option>
            </PenniSelect>
            <button type="button" aria-label="Reverse sort order" aria-pressed={filters.order === "asc"} onClick={() => setFilter("order", filters.order === "desc" ? "asc" : "desc")}
              className="h-8 w-7 grid place-items-center rounded-lg bg-secondary/50 border border-border/50 hover:bg-secondary/80">
              {filters.order === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </button>

            <Sheet>
              <SheetTrigger asChild>
                <button className={`h-8 px-3 rounded-full text-xs font-medium ${activeFilters.length > 0 ? "bg-emerald/10 text-emerald border border-emerald/20" : "text-muted-foreground hover:bg-secondary/60"}`}>
                  <Filter className="h-3 w-3 mr-1 inline" /> Filters{activeFilters.length > 0 && <span className="ml-1">{activeFilters.length}</span>}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader><SheetTitle>Filters</SheetTitle><SheetDescription>Refine transactions for this account</SheetDescription></SheetHeader>
                <div className="mt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <PenniSelect aria-label="Filter account transaction type" value={filters.tx_type} onChange={(e) => setFilter("tx_type", e.target.value)}
                      className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent text-sm">
                      <option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option>
                    </PenniSelect>
                    <CategoryCombobox label="Filter account transaction category" value={filters.category} onChange={(val) => setFilter("category", val)}
                      categories={selectedCats} placeholder="All categories" allowClear />
                    <Input aria-label="Minimum amount" type="number" inputMode="decimal" placeholder={`Min ${CURRENCY_SYMBOL}`} value={filters.amount_min} onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, amount_min: e.target.value })); }} className="text-sm h-10" />
                    <Input aria-label="Maximum amount" type="number" inputMode="decimal" placeholder={`Max ${CURRENCY_SYMBOL}`} value={filters.amount_max} onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, amount_max: e.target.value })); }} className="text-sm h-10" />
                    <Input aria-label="From date" type="date" value={filters.date_from} onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, date_from: e.target.value })); }} className="text-sm h-10" />
                    <Input aria-label="To date" type="date" value={filters.date_to} onChange={(e) => { setOffset(0); setFilters(p => ({ ...p, date_to: e.target.value })); }} className="text-sm h-10" />
                  </div>
                  <div className="border-t border-border pt-4 flex justify-end">
                    <button onClick={() => { setSearchInput(""); setFilters(defaultFilters); setOffset(0); }} className="text-sm text-muted-foreground hover:text-foreground">Clear all filters</button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {showSearch && (
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/70 backdrop-blur-xl px-4 h-9 shadow-sm mb-3">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input aria-label="Search account transactions" value={searchInput} onChange={(e) => { setSearchInput(e.target.value); debouncedSetSearch(e.target.value); }}
              placeholder="Search transactions..." className="w-full bg-transparent outline-none text-xs" />
            {filters.search && <button onClick={() => { setSearchInput(""); setFilter("search", ""); }}><X className="h-3.5 w-3.5" /></button>}
          </div>
        )}

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {activeFilters.map((chip) => (
              <span key={chip.key} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald/10 text-emerald border border-emerald/20">
                {chip.label}
                <button onClick={() => setFilter(chip.key, "")} className="hover:text-emerald/80"><X className="h-2.5 w-2.5" /></button>
              </span>
            ))}
            <button onClick={() => { setSearchInput(""); setFilters(defaultFilters); setOffset(0); }} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground">Clear</button>
          </div>
        )}

        <div className="account-detail-table-panel rounded-xl border border-border bg-card/90 backdrop-blur-xl shadow-card overflow-hidden">
          {txLoading ? <SkeletonTable rows={6} className="p-3" />
          : txs.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Receipt} title={filters.search || filters.category ? "No matching transactions" : "No transactions yet"}
                description="Transactions from this account will appear here." />
            </div>
          ) : (
            <>

              <div ref={scrollRef} className="account-detail-list subtle-scroll min-h-0 flex-1 overflow-y-visible overflow-x-hidden lg:overflow-y-auto lg:overscroll-contain" role="list" aria-label="Account transactions">
                <GroupedTransactionItems transactions={txs} account={account} onSelect={setInspectedTransaction}
                  onEdit={openEditTx} onDelete={t => { setInspectedTransaction(null); deleteTx(t.transaction_id); }}
                  activeId={inspectedTransaction?.transaction_id} groupDates={filters.sort === "date"} />
                <div ref={loadMoreRef} className="py-3 text-center text-[11px] text-muted-foreground" aria-live="polite">
                  {loadingMore ? "Loading more transactions…" : txs.length < totalTx ? "More transactions will load as you scroll" : `All ${txs.length.toLocaleString()} transactions shown`}
                </div>
              </div>

            </>
          )}
        </div>
      </SectionCard>
        </div>

        {inspectedTransaction && wideLayout ? (
          <aside className="account-detail-inspector min-h-0 min-w-0 overflow-hidden">
            <TransactionInspectorPanel
              key={inspectedTransaction.transaction_id}
              transaction={inspectedTransaction}
              account={account}
              similarTransactions={txs.filter((tx) => tx.transaction_id !== inspectedTransaction.transaction_id && (tx.normalized_merchant || tx.merchant || "").toLowerCase() === (inspectedTransaction.normalized_merchant || inspectedTransaction.merchant || "").toLowerCase()).slice(0, 3)}
              onClose={() => setInspectedTransaction(null)}
              onEdit={(tx) => openEditTx(tx)}
              onDelete={(id) => { setInspectedTransaction(null); deleteTx(id); }}
              onInspect={setInspectedTransaction}
            />
          </aside>
        ) : null}
      </div>

      <Sheet open={Boolean(inspectedTransaction) && !wideLayout} onOpenChange={(open) => { if (!open) setInspectedTransaction(null); }}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          <TransactionInspectorPanel
            key={inspectedTransaction?.transaction_id || "empty"}
            transaction={inspectedTransaction}
            account={account}
            onClose={() => setInspectedTransaction(null)}
            onEdit={(tx) => { setInspectedTransaction(null); openEditTx(tx); }}
            onDelete={(id) => { setInspectedTransaction(null); deleteTx(id); }}
            onInspect={setInspectedTransaction}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={uploadOpen} onOpenChange={setUploadOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-lg">
          <SheetHeader><SheetTitle>Import statement</SheetTitle></SheetHeader>
          <div className="mt-5">
          {/* Statement Upload */}
          <SectionCard eyebrow="Manual import" title="Upload a statement" contentClassName="p-0">
            <div
              className={`p-6 text-center border-b border-border/70 transition-all duration-300 ${dragOver ? "bg-emerald/5 border-emerald/30 border-dashed" : "bg-secondary/20"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files[0]); }}
            >
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-card border border-border/50 shadow-sm text-emerald">
                <Upload className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">Drop a CSV or PDF here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse — max 5 MB</p>
              <input ref={fileRef} type="file" accept=".csv,.pdf" onChange={(e) => { handleUpload(e.target.files[0]); e.target.value = ""; }}
                className="hidden" />
              <Button variant="outlinePill" size="pill" onClick={() => fileRef.current?.click()} disabled={uploadBusy} className="mt-5 w-full">
                {uploadBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
                {uploadBusy ? "Processing…" : "Choose file"}
              </Button>
            </div>
            {uploadHistory.length > 0 ? (
              <div className="divide-y divide-border text-sm max-h-48 overflow-auto">
                {uploadHistory.map((s, i) => (
                  <div key={i} className="px-5 py-3.5 flex items-center gap-3 hover:bg-secondary/30 transition-colors">
                    <div className="h-8 w-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-medium">{s.filename || `Statement ${i + 1}`}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{s.created_at ? formatShortDate(s.created_at, { year: "numeric" }) : ""}</p>
                    </div>
                    {s.transaction_count && <span className="text-xs font-medium px-2 py-1 rounded-full bg-secondary text-muted-foreground shrink-0">{s.transaction_count} txns</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No statements uploaded yet
              </div>
            )}
          </SectionCard>

          </div>
        </SheetContent>
      </Sheet>

      <AccountFormModal open={showEdit} onClose={() => setShowEdit(false)} onCreated={() => { loadAccount(); setShowEdit(false); }} editAccount={account} />

      <TransactionForm open={txFormOpen} editingId={editingTxId} form={txForm} setForm={setTxForm}
        selectedCats={selectedCats} onClose={closeTxForm} onSubmit={handleAddTransaction}
        accounts={allAccounts} accountsLoading={allAccountsLoading} />
      <ConfirmModal
        open={Boolean(pendingDeleteTxId)}
        title="Permanently delete transaction?"
        message="This transaction and its associated records will be removed. This cannot be undone."
        confirmLabel="Delete permanently"
        onConfirm={confirmTransactionDelete}
        onCancel={() => setPendingDeleteTxId(null)}
      />
      <ConfirmModal
        open={confirmDelete}
        title="Delete this account?"
        message={`Delete "${account?.name}"? Transactions must be reassigned first.`}
        confirmLabel="Yes, delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

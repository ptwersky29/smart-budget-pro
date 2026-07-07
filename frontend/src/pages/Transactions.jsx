import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { Plus, Trash2, Loader2, Pencil, Search, Sparkles, Filter, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, BarChart3, Star, Receipt, Download, MoreHorizontal, Wallet, RefreshCw, CheckCircle2, PieChart as PieChartIcon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "../components/ui/layout";
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
import MonthPicker, { YIDDISH } from "../components/MonthPicker";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import TransactionRow from "../components/TransactionRow";
import TransactionForm from "../components/TransactionForm";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useSwipe } from "../hooks/useSwipe";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";

import CategoryCombobox from "../components/CategoryCombobox";
import CategoryBadge from "../components/CategoryBadge";

const SOURCE_LABELS = { manual: "Manual", csv: "CSV", pdf: "PDF", statement: "Statement", sms: "SMS" };
const emptyForm = { description: "", date: today(), amount: "", category: "", is_income: false, is_transfer: false, budget_type: "", occasion: "", merchant: "", notes: "", account_id: "", exclude_from_maaser: false };

function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const fmt = (n) => `£${Number(n || 0).toFixed(2)}`;
const PIE_COLORS = ["#30a46c", "#e8a838", "#60a5fa", "#a78bfa", "#f472b6", "#fb923c", "#34d399", "#818cf8", "#f87171", "#2dd4bf", "#fbbf24", "#e879f9"];

function groupCatsBySection(cats) {
  const groups = {};
  for (const c of cats) {
    const section = c.section || "Other";
    if (!groups[section]) groups[section] = [];
    groups[section].push(c);
  }
  return groups;
}

function TransactionActionPanel({ open, title, description, onClose, children, footer, className = "max-w-md" }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h3 className="text-xl tracking-tight font-medium">{title}</h3>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
        {footer && <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-4">{footer}</div>}
      </div>
    </div>
  );
}

const Transactions = React.memo(function Transactions() {
  useEffect(() => { document.title = "Transactions | Penni"; }, []);
  const [txs, setTxs] = useState([]);
  const [total, setTotal] = useState(0);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedCats, setSelectedCats] = useState({ categories: [], hierarchy: {} });
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassification] = useState(null);
  const [saveAsRecurring, setSaveAsRecurring] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("ledger");
  const [hebrewMonths, setHebrewMonths] = useState([]);
  const [selectedHebrewMonth, setSelectedHebrewMonth] = useState(null);
  const [categorySpend, setCategorySpend] = useState([]);
  const [showPie, setShowPie] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const defaultFilters = useMemo(() => ({ search: "", category: "", source: "", tx_type: "", date_from: "", date_to: "", amount_min: "", amount_max: "", sort: "date", order: "desc", account_id: "" }), []);
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
  const [newCategoryModal, setNewCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTx, setReviewTx] = useState(null);
  const [reviewSuggestions, setReviewSuggestions] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitTxDraft, setSplitTxDraft] = useState(null);
  const [splitLines, setSplitLines] = useState([]);
  const [splitSaving, setSplitSaving] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTx, setTransferTx] = useState(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);

  // ── Maaser ledger state ──
  const [maaserCfg, setMaaserCfg] = useState({ enabled: false, percent: 10 });
  const [maaserSum, setMaaserSum] = useState(null);
  const [maaserBusy, setMaaserBusy] = useState(false);
  const [maaserLoading, setMaaserLoading] = useState(true);
  const [maaserConfirmReset, setMaaserConfirmReset] = useState(false);
  const [maaserShowGive, setMaaserShowGive] = useState(false);
  const [maaserGiveAmount, setMaaserGiveAmount] = useState("");
  const [maaserGiveRecipient, setMaaserGiveRecipient] = useState("");
  const [maaserLedger, setMaaserLedger] = useState([]);
  const [maaserLedgerLoading, setMaaserLedgerLoading] = useState(true);
  const [maaserEditEntry, setMaaserEditEntry] = useState(null);
  const [maaserEditAmount, setMaaserEditAmount] = useState("");
  const [maaserEditPaidTo, setMaaserEditPaidTo] = useState("");
  const [maaserEditNote, setMaaserEditNote] = useState("");

  const refreshMaaser = useCallback(async () => {
    try {
      const [s, sum, lg] = await Promise.all([
        api.get("/jewish/maaser/settings"),
        api.get("/jewish/maaser/summary"),
        api.get("/jewish/maaser/ledger?include_tx=true&limit=500"),
      ]);
      setMaaserCfg(s.data || { enabled: false, percent: 10 });
      setMaaserSum(sum.data || null);
      setMaaserLedger(lg.data?.entries || []);
    } catch {}
  }, []);

  const loadMaaserSummary = useCallback(async () => {
    setMaaserLoading(true);
    setMaaserLedgerLoading(true);
    try {
      const [s, sum, lg] = await Promise.all([
        api.get("/jewish/maaser/settings"),
        api.get("/jewish/maaser/summary"),
        api.get("/jewish/maaser/ledger?include_tx=true&limit=500"),
      ]);
      setMaaserCfg(s.data || { enabled: false, percent: 10 });
      setMaaserSum(sum.data || null);
      setMaaserLedger(lg.data?.entries || []);
    } catch {}
    finally { setMaaserLoading(false); setMaaserLedgerLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === "maaser") {
      loadMaaserSummary();
    }
  }, [activeTab, loadMaaserSummary]);

  const handleMaaserSaveCfg = async (next) => {
    setMaaserBusy(true);
    try {
      await api.put("/jewish/maaser/settings", next);
      setMaaserCfg(next);
      toast.success(`Auto-Maaser ${next.enabled ? "enabled" : "disabled"}`);
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not save");
    }
    finally { setMaaserBusy(false); }
  };

  const handleMaaserRecalc = async () => {
    setMaaserBusy(true);
    try {
      const { data } = await api.post("/jewish/maaser/backfill");
      if (data.enabled === false) {
        toast.error("Turn auto-Maaser on first");
      } else {
        toast.success(`Accrued maaser for ${data.created} income tx · ${fmt(data.total_amount)}`);
      }
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Recalculate failed");
    }
    finally { setMaaserBusy(false); }
  };

  const handleMaaserReset = () => setMaaserConfirmReset(true);

  const handleMaaserDoReset = async () => {
    setMaaserConfirmReset(false);
    setMaaserBusy(true);
    try {
      await api.post("/jewish/maaser/reset");
      toast.success("Maaser audit log reset");
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Reset failed");
    }
    finally { setMaaserBusy(false); }
  };

  const handleMaaserGive = () => {
    if (!maaserSum || maaserSum.balance_owed <= 0) {
      toast.success("Nothing owed — you're up to date!");
      return;
    }
    setMaaserGiveAmount(maaserSum.balance_owed.toFixed(2));
    setMaaserGiveRecipient("");
    setMaaserShowGive(true);
  };

  const handleMaaserSubmitGive = async () => {
    const num = parseFloat(maaserGiveAmount);
    if (isNaN(num) || num <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const recipient = maaserGiveRecipient.trim() || "Tzedakah";
    try {
      await api.post("/jewish/tzedakah", { amount: num, recipient, note: "Maaser given against balance" });
      toast.success("Maaser given");
      setMaaserShowGive(false);
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not record");
    }
  };

  const handleMaaserEdit = (entry) => {
    setMaaserEditEntry(entry);
    setMaaserEditAmount(String(entry.maaser_paid || entry.amount || ""));
    setMaaserEditPaidTo(entry.paid_to || "");
    setMaaserEditNote(entry.note || "");
  };

  const handleMaaserSaveEdit = async () => {
    const num = parseFloat(maaserEditAmount);
    if (isNaN(num) || num < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      await api.put(`/jewish/maaser/ledger/${maaserEditEntry.entry_id}`, {
        amount: num,
        recipient: maaserEditPaidTo || "Tzedakah",
        note: maaserEditNote,
      });
      toast.success("Entry updated");
      setMaaserEditEntry(null);
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not update");
    }
  };

  const handleMaaserDelete = (entryId) => {
    showConfirm("Delete maaser entry", "Are you sure you want to delete this maaser ledger entry?", async () => {
      try {
        await api.delete(`/jewish/maaser/ledger/${entryId}`);
        toast.success("Entry deleted");
        await refreshMaaser();
      } catch (e) {
        toast.error(formatApiError(e?.response?.data?.detail) || "Could not delete");
      }
    });
  };

  const handleMaaserPay = async (entryId) => {
    try {
      await api.post(`/jewish/maaser/pay/${entryId}`);
      toast.success("Entry marked as paid");
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not mark paid");
    }
  };

  const handleMaaserExclude = async (transactionId) => {
    if (!transactionId) { toast.error("No linked transaction"); return; }
    setMaaserBusy(true);
    try {
      await api.patch(`/transactions/${transactionId}`, { exclude_from_maaser: true });
      toast.success("Income excluded from Maaser");
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not exclude");
    }
    finally { setMaaserBusy(false); }
  };

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
      if (filters.amount_min && !isNaN(filters.amount_min)) params.amount_min = parseFloat(filters.amount_min);
      if (filters.amount_max && !isNaN(filters.amount_max)) params.amount_max = parseFloat(filters.amount_max);
      if (filters.account_id) params.account_id = filters.account_id;
      const { data } = await api.get("/transactions", { params });
      setTxs(data.transactions);
      setTotal(data.total);
      setIncomeTotal(data.income_total || 0);
      setExpenseTotal(data.expense_total || 0);
      if (filters.date_from && filters.date_to) {
        const from = filters.date_from, to = filters.date_to;
        api.get("/transactions", { params: { date_from: from, date_to: to, limit: 1000, sort: "date", order: "desc" } })
          .then((res) => {
            if (filters.date_from !== from || filters.date_to !== to) return;
            const spend = {};
            (res.data.transactions || []).forEach((tx) => {
              const cat = (tx.category || "uncategorized").toLowerCase().trim();
              const amt = Math.abs(parseFloat(tx.amount) || 0);
              if (tx.tx_type === "expense" || tx.is_income === false || (!tx.is_income && amt > 0)) {
                spend[cat] = (spend[cat] || 0) + amt;
              }
            });
            const cats = Object.entries(spend).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
            setCategorySpend(cats);
          })
          .catch(() => {});
      }
    } catch (err) { toast.error("Could not load transactions"); }
    finally { setLoading(false); }
  }, [offset, limit, filters]);

  const loadCats = useCallback(async () => {
    try {
      const { data } = await api.get("/categories");
      setSelectedCats({ categories: data.categories || [], hierarchy: data.hierarchy || {} });
    } catch { console.warn("[transactions] failed to load categories"); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCats(); }, [loadCats]);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const { data } = await api.get("/accounts");
      setAccounts(data.accounts || []);
    } catch { toast.error("Could not load accounts"); }
    finally { setAccountsLoading(false); }
  }, []);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

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

  const toggleHebrewMonth = useCallback((dir) => {
    if (!selectedHebrewMonth || hebrewMonths.length === 0) return;
    const idx = hebrewMonths.findIndex(
      (m) => m.hebrew_month === selectedHebrewMonth.hebrew_month && m.hebrew_year === selectedHebrewMonth.hebrew_year
    );
    const next = dir === "next" ? idx + 1 : idx - 1;
    if (next >= 0 && next < hebrewMonths.length) {
      applyHebrewMonth(hebrewMonths[next]);
    }
  }, [selectedHebrewMonth, hebrewMonths, applyHebrewMonth]);

  const isCurrentHebrewMonth = selectedHebrewMonth?.is_current ?? false;

  const hebrewMonthLabel = selectedHebrewMonth ? (
    <span>
      <span dir="rtl" lang="he" className="inline-block">{YIDDISH[selectedHebrewMonth.month_name] || selectedHebrewMonth.month_name}</span>
      {" "}{selectedHebrewMonth.hebrew_year}
    </span>
  ) : null;

  // Load Hebrew months and select current month (only if no date params in URL)
  useEffect(() => {
    api.get("/jewish/hebcal/months")
      .then(({ data }) => {
        const ms = (data.months || []).sort((a, b) => a.gregorian_start.localeCompare(b.gregorian_start));
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
      .catch(() => { console.warn("[transactions] failed to load Hebrew months"); });
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
    setOffset(0);
    const current = hebrewMonths.find(m => m.is_current);
    if (current) {
      applyHebrewMonth(current);
    } else {
      setFilters(prev => ({ ...prev, search: "", tx_type: "", source: "", category: "", amount_min: "", amount_max: "", date_from: "", date_to: "", account_id: "" }));
    }
  }, [hebrewMonths, applyHebrewMonth]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;
  const defaultAccountId = useMemo(() => {
    const manual = accounts.find((a) => a.is_offline || a.provider === "manual");
    return manual?.account_id || accounts[0]?.account_id || "";
  }, [accounts]);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm({ ...emptyForm, date: today(), account_id: filters.account_id || defaultAccountId });
    setOpen(true);
  }, [defaultAccountId, filters.account_id]);
  const openEdit = useCallback((t) => {
    setEditingId(t.transaction_id);
    setForm({ description: t.description || "", date: t.date?.slice(0, 10) || today(), amount: String(Math.abs(t.amount)), category: t.category || "", account_id: t.account_id || "", is_income: t.amount > 0, is_transfer: t.is_transfer || false, exclude_from_maaser: t.exclude_from_maaser || false, budget_type: "", occasion: "", merchant: t.merchant || "", notes: t.notes || "" });
    setOpen(true);
  }, []);
  const closeForm = useCallback(() => { setOpen(false); setEditingId(null); setForm({ ...emptyForm, date: today() }); setClassification(null); setSaveAsRecurring(false); }, []);

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
      const payload = { description: form.description, amount: signed, category: form.category || undefined, date: form.date || today(), merchant: form.merchant || undefined, notes: form.notes || undefined, is_income: form.is_income, is_transfer: form.is_transfer || undefined, exclude_from_maaser: form.exclude_from_maaser || undefined, account_id: form.account_id || undefined };
      const old = txsRef.current.find(t => t.transaction_id === editingId);
      setTxs(prev => prev.map(t => t.transaction_id === editingId ? { ...t, ...payload } : t));
      setOpen(false); setEditingId(null);
      withUndo({
        action: () => api.patch(`/transactions/${editingId}`, payload),
        undo: async () => {
          if (old) { await api.patch(`/transactions/${editingId}`, { description: old.description, amount: old.amount, category: old.category || undefined, is_income: old.is_income, account_id: old.account_id || undefined }); }
          await load();
        },
        onError: () => { if (old) setTxs(prev => prev.map(t => t.transaction_id === editingId ? old : t)); load(); },
        successMsg: "Transaction updated",
        errorMsg: "Could not update",
      });
    } else if (classification || form.budget_type) {
      if (!form.account_id) { toast.error("Select an account first"); return; }
      const suggestions = classification?.suggestions || [];
      const chosenIdx = suggestions.findIndex(s => s.category === form.category);
      setOpen(false); setEditingId(null);
      const optimisticTx = { transaction_id: `optimistic-${Date.now()}`, description: form.description, amount: signed, category: form.category, date: form.date || today(), source: "manual", approval_status: "approved", category_approval_status: "approved", notes: form.notes, account_id: form.account_id };
      setTxs(prev => [optimisticTx, ...prev]);
      try {
        await api.post("/budget-system/approve", {
          description: form.description.trim(), amount: signed,
          budget_type: form.budget_type || suggestions[0]?.budget_type || "day_to_day",
          occasion: form.occasion || suggestions[0]?.occasion || "Monthly Living",
          category: form.category || suggestions[0]?.category || "uncategorized",
          merchant: form.merchant || suggestions[0]?.merchant || "",
          account_id: form.account_id,
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
      if (!form.account_id) { toast.error("Select an account first"); return; }
      const payload = { description: form.description, amount: signed, category: form.category || undefined, date: form.date || today(), merchant: form.merchant || undefined, notes: form.notes || undefined, account_id: form.account_id, is_income: form.is_income, is_transfer: form.is_transfer || undefined, exclude_from_maaser: form.exclude_from_maaser || undefined };
      setOpen(false); setEditingId(null);
      const optimisticTx = { transaction_id: `optimistic-${Date.now()}`, ...payload, date: payload.date, source: "manual", approval_status: "approved", category_approval_status: "approved" };
      setTxs(prev => [optimisticTx, ...prev]);
      if (!payload.is_transfer) {
        setTotal(prev => prev + 1);
        if (signed > 0) setIncomeTotal(prev => Number(prev || 0) + signed);
        else setExpenseTotal(prev => Number(prev || 0) + Math.abs(signed));
      }
      withUndo({
        action: async () => {
          const { data } = await api.post("/transactions", payload);
          setTxs(prev => prev.map(t => t.transaction_id === optimisticTx.transaction_id ? data : t));
        },
        undo: async () => {
          await load();
        },
        onError: () => {
          setTxs(prev => prev.filter(t => t.transaction_id !== optimisticTx.transaction_id));
          if (!payload.is_transfer) {
            setTotal(prev => Math.max(0, prev - 1));
            if (signed > 0) setIncomeTotal(prev => Math.max(0, Number(prev || 0) - signed));
            else setExpenseTotal(prev => Math.max(0, Number(prev || 0) - Math.abs(signed)));
          }
        },
        successMsg: "Transaction added",
        errorMsg: "Could not add",
      });
    }
    setForm(emptyForm); setClassification(null); setSaveAsRecurring(false);
  }, [editingId, form, load, classification, saveAsRecurring]);

  const clearClassification = useCallback(() => { setClassification(null); setSaveAsRecurring(false); }, []);

  const allDisplayed = aiResults?.transactions || txs;
  const transferCandidates = useMemo(() => {
    if (!transferTx) return [];
    const baseAmount = Number(transferTx.amount || 0);
    return allDisplayed.filter((row) => {
      if (row.transaction_id === transferTx.transaction_id || row.transfer_pair_id) return false;
      return Number(row.amount || 0) * baseAmount < 0;
    });
  }, [allDisplayed, transferTx]);
  const splitOriginalAmount = Math.abs(Number(splitTxDraft?.amount || 0));
  const splitEnteredTotal = useMemo(
    () => splitLines.reduce((sum, line) => sum + Math.abs(Number(line.amount || 0)), 0),
    [splitLines]
  );
  const splitDifference = Number((splitOriginalAmount - splitEnteredTotal).toFixed(2));
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

  const approveTx = useCallback(async (t, categoryOverride) => {
    const category = categoryOverride || t.ai_selected_category || t.category || "uncategorized";
    try {
      const { data } = await api.patch(`/transactions/${t.transaction_id}/approve-category`, {
        category,
        approve_transaction: true,
      });
      setTxs(prev => prev.map(row => row.transaction_id === t.transaction_id ? data : row));
      setReviewTx(data);
      setReviewOpen(false);
      toast.success("Transaction approved");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not approve");
    }
  }, []);

  const classifySavedTx = useCallback(async (t) => {
    setReviewTx(t);
    setReviewSuggestions([]);
    setReviewOpen(true);
    setReviewLoading(true);
    try {
      const { data } = await api.post(`/transactions/${t.transaction_id}/classify`);
      const nextTx = data.transaction || t;
      const suggestions = data.suggestions || nextTx.ai_suggested_categories?.suggestions || [];
      setTxs(prev => prev.map(row => row.transaction_id === t.transaction_id ? nextTx : row));
      setReviewTx(nextTx);
      setReviewSuggestions(suggestions.slice(0, 3));
      toast.success("AI suggestions added");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "AI classification failed");
    } finally {
      setReviewLoading(false);
    }
  }, []);

  const bulkApprove = useCallback(async (highConfidenceOnly = false) => {
    try {
      const ids = selectedIds.size ? Array.from(selectedIds) : allDisplayed.map(t => t.transaction_id);
      const { data } = await api.post("/transactions/bulk-approve", {
        transaction_ids: ids,
        high_confidence_only: highConfidenceOnly,
      });
      toast.success(`Approved ${data.approved}`);
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not approve transactions");
    }
  }, [selectedIds, allDisplayed, load]);

  const splitTx = useCallback(async (t) => {
    const amount = Math.abs(Number(t.amount || 0));
    const firstLine = Number((amount / 2).toFixed(2));
    setSplitTxDraft(t);
    setSplitOpen(true);
    setSplitSaving(false);
    setSplitLines([
      { category: t.category || "uncategorized", amount: firstLine.toFixed(2), description: t.description || "" },
      { category: "uncategorized", amount: Number((amount - firstLine).toFixed(2)).toFixed(2), description: "" },
    ]);
    if (!t.is_split) return;
    try {
      const { data } = await api.get(`/transactions/${t.transaction_id}/splits`);
      const existing = data.splits || data || [];
      if (existing.length) {
        setSplitLines(existing.map((line) => ({
          category: line.category || "uncategorized",
          amount: Math.abs(Number(line.amount || 0)).toFixed(2),
          description: line.description || line.note || "",
        })));
      }
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not load split lines");
    }
  }, []);

  const updateSplitLine = useCallback((index, field, value) => {
    setSplitLines(prev => prev.map((line, i) => i === index ? { ...line, [field]: value } : line));
  }, []);

  const addSplitLine = useCallback(() => {
    setSplitLines(prev => [...prev, { category: "uncategorized", amount: "0.00", description: "" }]);
  }, []);

  const removeSplitLine = useCallback((index) => {
    setSplitLines(prev => prev.filter((_, i) => i !== index));
  }, []);

  const saveSplit = useCallback(async () => {
    if (!splitTxDraft) return;
    const splits = splitLines.map((line) => ({
      category: line.category,
      amount: Math.abs(Number(line.amount || 0)),
      description: line.description || splitTxDraft.description || "",
    })).filter(line => line.category && Number.isFinite(line.amount) && line.amount > 0);
    if (splits.length < 2) {
      toast.error("Add at least two valid split lines");
      return;
    }
    const nextTotal = splits.reduce((sum, line) => sum + line.amount, 0);
    if (Math.abs(nextTotal - splitOriginalAmount) > 0.01) {
      toast.error("Split total must match the transaction amount");
      return;
    }
    setSplitSaving(true);
    try {
      const { data } = await api.put(`/transactions/${splitTxDraft.transaction_id}/splits`, { splits });
      setTxs(prev => prev.map(row => row.transaction_id === splitTxDraft.transaction_id ? { ...row, is_split: true, split_count: data.splits.length } : row));
      setSplitOpen(false);
      toast.success("Transaction split");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not split transaction");
    } finally {
      setSplitSaving(false);
    }
  }, [splitTxDraft, splitLines, splitOriginalAmount]);

  const pairTransfer = useCallback((t) => {
    const selectedOtherId = Array.from(selectedIds).find((id) => {
      const other = allDisplayed.find(row => row.transaction_id === id);
      return other && id !== t.transaction_id && !other.transfer_pair_id && Number(t.amount || 0) * Number(other.amount || 0) < 0;
    });
    setTransferTx(t);
    setTransferTargetId(selectedOtherId || "");
    setTransferOpen(true);
  }, [selectedIds, allDisplayed]);

  const saveTransferPair = useCallback(async () => {
    if (!transferTx || !transferTargetId) {
      toast.error("Choose a matching transfer transaction");
      return;
    }
    const other = allDisplayed.find(row => row.transaction_id === transferTargetId);
    if (!other || Number(transferTx.amount || 0) * Number(other.amount || 0) >= 0) {
      toast.error("Choose one outgoing expense and one incoming income");
      return;
    }
    const outgoing = Number(transferTx.amount) < 0 ? transferTx.transaction_id : transferTargetId;
    const incoming = Number(transferTx.amount) > 0 ? transferTx.transaction_id : transferTargetId;
    setTransferSaving(true);
    try {
      const { data } = await api.post("/transactions/transfer-pairs", {
        outgoing_transaction_id: outgoing,
        incoming_transaction_id: incoming,
      });
      setTxs(prev => prev.map(row => [outgoing, incoming].includes(row.transaction_id) ? { ...row, is_transfer: true, tx_type: "transfer", transfer_pair_id: data.transfer_pair_id } : row));
      setSelectedIds(new Set());
      setTransferOpen(false);
      toast.success("Transfer paired");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not pair transfer");
    } finally {
      setTransferSaving(false);
    }
  }, [transferTx, transferTargetId, allDisplayed]);

  const unpairTransfer = useCallback(async (t) => {
    if (!t.transfer_pair_id) return;
    try {
      await api.delete(`/transactions/transfer-pairs/${t.transfer_pair_id}`);
      setTxs(prev => prev.map(row => row.transfer_pair_id === t.transfer_pair_id ? { ...row, is_transfer: false, tx_type: null, transfer_pair_id: null } : row));
      toast.success("Transfer unpaired");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not unpair transfer");
    }
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
    a.download = `Penni-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} transactions`);
  }, [txs, aiResults]);

  return (
    <div className="space-y-4" data-testid="transactions-root">

      {/* ─── Sticky Header ─── */}
      <div className="sticky top-0 z-20 -mx-4 px-4 sm:-mx-8 sm:px-8 bg-background/70 backdrop-blur-xl border-b border-border/40 pb-4 pt-2 shadow-sm transition-all duration-300">
        <PageHeader eyebrow="Transactions" title="Transactions" hideDivider>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 mt-2 pt-2">
            {/* Wallet badge */}
            <div className="relative shrink-0 h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center drop-shadow-[0_0_8px_rgba(48,164,108,0.2)]">
              <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-emerald" />
            </div>

            {/* Middle: Month picker + stats */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <MonthPicker
                  label={hebrewMonthLabel}
                  onPrev={() => toggleHebrewMonth("prev")}
                  onNext={() => toggleHebrewMonth("next")}
                  onToday={() => { const c = hebrewMonths.find(m => m.is_current); if (c) applyHebrewMonth(c); }}
                  isToday={isCurrentHebrewMonth}
                />
              </div>
              {(!someSelected) ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>Income <strong className="text-emerald font-medium tabular-nums">{fmt(incomeTotal)}</strong></span>
                  <span className="text-muted-foreground/30">·</span>
                  <span>Expenses <strong className="text-ruby font-medium tabular-nums">{fmt(expenseTotal)}</strong></span>
                  <span className="text-muted-foreground/30">·</span>
                  <span>Net <strong className={`font-medium tabular-nums ${netTotal >= 0 ? "text-emerald" : "text-ruby"}`}>{netTotal >= 0 ? "+" : ""}{fmt(netTotal)}</strong></span>
                  <span className="ml-auto text-xs text-muted-foreground/50">{total} transaction{total !== 1 ? "s" : ""}</span>
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
                            {Object.entries(groupCatsBySection(selectedCats.categories || [])).map(([section, cats]) => (
                              <React.Fragment key={section}>
                                <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold uppercase tracking-wider px-2 py-1">{section}</DropdownMenuLabel>
                                {cats.map(c => (
                                  <DropdownMenuItem key={c.name} onClick={() => bulkCategory(c.name)}>{c.name}</DropdownMenuItem>
                                ))}
                              </React.Fragment>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { setNewCategoryName(""); setNewCategoryModal(true); }}>
                              ➕ Add custom category
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => bulkApprove(false)}>
                          <CheckCircle2 className="h-4 w-4 mr-2" /> Approve selected
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => bulkApprove(true)}>
                          <Star className="h-4 w-4 mr-2" /> Approve high confidence
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={bulkDelete} className="text-ruby">
                          <Trash2 className="h-4 w-4 mr-2" /> Delete {selectedIds.size}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Search toggle */}
              <button
                onClick={() => setShowSearch((s) => !s)}
                className={`h-8 w-8 rounded-full grid place-items-center transition-all duration-200 ${
                  showSearch || filters.search
                    ? "bg-emerald text-white shadow-sm"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
                aria-label="Search"
              >
                <Search className="h-3.5 w-3.5" />
              </button>

              {/* Sort + order */}
              <div className="flex items-center gap-0.5">
                <select value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}
                  className="h-8 px-2 rounded-lg bg-secondary/50 border border-border/50 text-[11px] font-medium focus:outline-none focus:border-ring">
                  <option value="date">Date</option>
                  <option value="amount">Amount</option>
                  <option value="description">Description</option>
                </select>
                <button onClick={() => setFilter("order", filters.order === "desc" ? "asc" : "desc")}
                  className="h-8 w-7 grid place-items-center rounded-lg bg-secondary/50 border border-border/50 hover:bg-secondary/80 transition-colors">
                  {filters.order === "desc" ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronUp className="h-3 w-3 text-muted-foreground" />}
                </button>
              </div>

              {/* Filter */}
              <Sheet>
                <SheetTrigger asChild>
                  <button className={`h-8 px-3 rounded-full text-xs font-medium transition-all duration-200 ${
                    activeFilters.length > 0
                      ? "bg-emerald/10 text-emerald border border-emerald/20"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}>
                    <Filter className="h-3 w-3 mr-1 inline" /> Filters{activeFilters.length > 0 && <span className="ml-1">{activeFilters.length}</span>}
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
                      categories={selectedCats.categories || selectedCats}
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

            <button onClick={openAdd} className="h-8 px-3.5 rounded-full bg-emerald text-white text-xs font-medium hover:bg-emerald/90 active:scale-95 transition-all duration-200 shadow-sm" data-testid="add-transaction">
              <Plus className="h-3 w-3 mr-1 inline" /> Add
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-8 w-8 rounded-full grid place-items-center text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-all duration-200">
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
        </PageHeader>

        {/* Inline search bar */}
        {showSearch && (
          <div className="mt-3 flex items-center gap-2 rounded-full border border-border bg-card/70 backdrop-blur-xl px-4 h-9 shadow-sm transition-all duration-200">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input ref={searchRef} value={searchInput} onChange={(e) => { setSearchInput(e.target.value); debouncedSetSearch(e.target.value); }}
              placeholder="Search transactions... (/)"
              className="w-full bg-transparent outline-none text-xs" />
            {filters.search && <button onClick={() => { setSearchInput(""); setFilter("search", ""); }} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-3.5 w-3.5" /></button>}
          </div>
        )}

        {/* Active filter chips (except date range, handled by month strip) */}
        {activeFilters.filter(c => c.key !== "date_from" && c.key !== "date_to").length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {activeFilters.filter(c => c.key !== "date_from" && c.key !== "date_to").map((chip) => (
              <span key={chip.key} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald/10 text-emerald border border-emerald/20">
                {chip.label}
                <button onClick={() => { setFilter(chip.key, ""); setOffset(0); }} className="hover:text-emerald/80"><X className="h-2.5 w-2.5" /></button>
              </span>
            ))}
            <button onClick={clearAllFilters} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground">Clear</button>
          </div>
        )}
      </div>

      {/* Spend breakdown pie chart */}
      {categorySpend.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-4 sm:p-5">
          <button onClick={() => setShowPie(!showPie)} className="flex items-center justify-between w-full text-left">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-muted/70"><PieChartIcon className="h-3 w-3 text-muted-foreground/80" /></span>
              Spend breakdown{selectedHebrewMonth ? <span className="text-xs font-normal text-muted-foreground">· <span dir="rtl" lang="he">{YIDDISH[selectedHebrewMonth.month_name] || selectedHebrewMonth.month_name}</span> {selectedHebrewMonth.hebrew_year}</span> : ""}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{categorySpend.length} categories</span>
              {showPie ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
          {showPie && (
            <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
              <div className="relative shrink-0" style={{ width: 200, height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categorySpend} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={82} paddingAngle={2} strokeWidth={0}>
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
                  <p className="text-xl font-bold tabular-nums tracking-tight">£{categorySpend.reduce((s, c) => s + (c.value || 0), 0).toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Total spent</p>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 w-full">
                {categorySpend.map((cat, i) => (
                  <div key={cat.name} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg hover:bg-secondary/50 transition-colors">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="flex-1 truncate capitalize text-muted-foreground">{cat.name}</span>
                    <span className="font-semibold tabular-nums text-foreground">£{Number(cat.value).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                    onApprove={approveTx}
                    onClassify={classifySavedTx}
                    onSplit={splitTx}
                    onPairTransfer={pairTransfer}
                    onUnpairTransfer={unpairTransfer}
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
                        onApprove={approveTx}
                        onClassify={classifySavedTx}
                        onSplit={splitTx}
                        onPairTransfer={pairTransfer}
                        onUnpairTransfer={unpairTransfer}
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
        {/* Summary Stats */}
        {maaserLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="rounded-2xl border border-border bg-background/60 p-4 animate-pulse">
                <div className="h-3 w-20 bg-secondary rounded mb-2" />
                <div className="h-7 w-16 bg-secondary rounded" />
              </div>
            ))}
          </div>
        ) : maaserSum ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Income to date</p>
              <p className="mt-1 text-2xl tracking-tight font-medium text-emerald">{fmt(maaserSum.total_income)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Maaser obligation ({maaserSum.percent}%)</p>
              <p className="mt-1 text-2xl tracking-tight font-medium text-topaz">{fmt(maaserSum.obligation)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Given so far</p>
              <p className="mt-1 text-2xl tracking-tight font-medium text-emerald">{fmt(maaserSum.given_total)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{maaserSum.credit > 0 ? "Credit (over-given)" : "Balance owed"}</p>
              <p className={`mt-1 text-2xl tracking-tight font-medium ${maaserSum.balance_owed > 0 ? "text-ruby" : "text-emerald"}`}>
                {fmt(maaserSum.balance_owed > 0 ? maaserSum.balance_owed : maaserSum.credit)}
              </p>
            </div>
          </div>
        ) : null}

        {/* Settings + Actions Row */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Input type="number" min={0} max={100} step={0.5}
            value={maaserCfg.percent}
            onChange={(e) => setMaaserCfg({ ...maaserCfg, percent: parseFloat(e.target.value) || 0 })}
            onBlur={() => handleMaaserSaveCfg(maaserCfg)}
            className="w-20 text-center font-mono"
            title="Maaser percent" />
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={maaserCfg.enabled} disabled={maaserBusy}
              onChange={(e) => handleMaaserSaveCfg({ ...maaserCfg, enabled: e.target.checked })}
              className="sr-only peer" />
            <span className="w-11 h-6 bg-secondary rounded-full peer-checked:bg-emerald relative transition-colors">
              <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform"
                style={{ transform: maaserCfg.enabled ? "translateX(20px)" : "translateX(0)" }} />
            </span>
            <span className="text-sm">{maaserCfg.enabled ? "On" : "Off"}</span>
          </label>
          {maaserSum?.balance_owed > 0 && (
            <button onClick={handleMaaserGive} disabled={maaserBusy}
              className="inline-flex items-center gap-1 text-sm px-4 py-2.5 rounded-full bg-emerald text-white hover:opacity-90 disabled:opacity-50 ml-auto">
              <CheckCircle2 className="h-3.5 w-3.5" /> Give {fmt(maaserSum.balance_owed)}
            </button>
          )}
          <button onClick={handleMaaserRecalc} disabled={maaserBusy}
            className="inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-full border border-border hover:border-emerald hover:text-emerald disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${maaserBusy ? "animate-spin" : ""}`} /> Recalculate
          </button>
          <button onClick={handleMaaserReset} disabled={maaserBusy}
            className="text-sm px-4 py-2.5 rounded-full border border-border hover:border-ruby hover:text-ruby disabled:opacity-50">
            Reset audit
          </button>
        </div>

        {/* Ledger Table */}
        <div className="rounded-xl border border-border bg-card/90 backdrop-blur-xl shadow-card overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between border-b border-border/60">
            <h4 className="text-sm font-medium">All Maaser Transactions</h4>
            {!maaserLedgerLoading && maaserLedger.length > 0 && (
              <span className="text-xs text-muted-foreground">{maaserLedger.length} entries</span>
            )}
          </div>
          {maaserLedgerLoading ? (
            <SkeletonTable rows={6} className="p-3" />
          ) : maaserLedger.length === 0 ? (
            <EmptyState icon={Star} title="No maaser entries"
              description="Income transactions with auto-maaser or manual ledger entries will appear here." />
          ) : (
            <div className="divide-y divide-border/60">
              {maaserLedger.map(e => (
                <div key={e.entry_id} className="px-4 py-3 flex items-center gap-3 text-sm hover:bg-secondary/20 transition-colors">
                  <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto] gap-x-4 gap-y-1 items-center">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {e.date || e.income_date ? new Date(e.date || e.income_date).toLocaleDateString("en-GB") : "-"}
                    </span>
                    <div className="min-w-0">
                      {e.income_description ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="truncate max-w-[200px]">{e.income_description}</span>
                          {e.income_category && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary capitalize">{e.income_category}</span>}
                          <span className="text-xs font-medium">{fmt(e.income_amount)}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Manual entry</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <span className="text-xs"><span className="text-muted-foreground">Due: </span><span className="font-medium">{fmt(e.maaser_due)}</span></span>
                      <span className="text-xs"><span className="text-muted-foreground">Paid: </span>
                        {e.status === "pending" ? <span className="text-amber-500 font-medium">Pending</span> : <span className="font-medium">{fmt(e.maaser_paid)}</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${e.status === "given" ? "bg-emerald/10 text-emerald" : "bg-amber/10 text-amber-500"}`}>
                        {e.status === "given" ? "Given" : "Pending"}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleMaaserEdit(e)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            {e.status === "pending" && (
                              <DropdownMenuItem onClick={() => handleMaaserPay(e.entry_id)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Mark Paid
                              </DropdownMenuItem>
                            )}
                            {e.status === "pending" && e.transaction_id && (
                              <DropdownMenuItem onClick={() => handleMaaserExclude(e.transaction_id)}>
                                <X className="h-3.5 w-3.5 mr-2" /> Exclude from Maaser
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleMaaserDelete(e.entry_id)} className="text-ruby">
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {maaserEditEntry && (
          <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setMaaserEditEntry(null)}>
            <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl tracking-tight font-medium">Edit Maaser Entry</h3>
                <button onClick={() => setMaaserEditEntry(null)} className="p-3 rounded-lg hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="label-overline">Amount (£)</label>
                  <Input type="number" step="0.01" value={maaserEditAmount}
                    onChange={(e) => setMaaserEditAmount(e.target.value)} className="mt-1 w-full" />
                </div>
                <div>
                  <label className="label-overline">Recipient / Paid To</label>
                  <Input value={maaserEditPaidTo}
                    onChange={(e) => setMaaserEditPaidTo(e.target.value)} className="mt-1 w-full" />
                </div>
                <div>
                  <label className="label-overline">Note</label>
                  <Input value={maaserEditNote}
                    onChange={(e) => setMaaserEditNote(e.target.value)} className="mt-1 w-full" />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="outlinePill" size="pill" onClick={() => setMaaserEditEntry(null)}>Cancel</Button>
                  <Button variant="primary" size="pill" onClick={handleMaaserSaveEdit}>Save</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Give Modal */}
        {maaserShowGive && (
          <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setMaaserShowGive(false)}>
            <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl tracking-tight font-medium">Give Maaser</h3>
                <button onClick={() => setMaaserShowGive(false)} className="p-3 rounded-lg hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="label-overline">Amount (£)</label>
                  <Input type="number" step="0.01" value={maaserGiveAmount}
                    onChange={(e) => setMaaserGiveAmount(e.target.value)} className="mt-1 w-full" />
                </div>
                <div>
                  <label className="label-overline">Recipient</label>
                  <Input value={maaserGiveRecipient}
                    onChange={(e) => setMaaserGiveRecipient(e.target.value)}
                    placeholder="e.g. local shul, JNF, charity" className="mt-1 w-full" />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="outlinePill" size="pill" onClick={() => setMaaserShowGive(false)}>Cancel</Button>
                  <Button variant="primary" size="pill" onClick={handleMaaserSubmitGive}>Give</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Reset */}
        <ConfirmModal open={maaserConfirmReset} title="Reset Maaser audit"
          message="Clear the auto-Maaser audit log? Manual ledger entries are kept."
          onConfirm={handleMaaserDoReset} onCancel={() => setMaaserConfirmReset(false)} />
      </>}

      <TransactionForm open={open} editingId={editingId} form={form} setForm={setForm}
        selectedCats={selectedCats.categories || selectedCats} onClose={closeForm} onSubmit={submit}
        onClassify={handleClassify} classifying={classifying} classification={classification}
        onClearClassification={clearClassification}
        saveAsRecurring={saveAsRecurring} setSaveAsRecurring={setSaveAsRecurring}
        onCategoryCreated={loadCats}
        accounts={accounts} accountsLoading={accountsLoading} />

      <TransactionActionPanel
        open={reviewOpen}
        title="Review category"
        description={reviewTx?.description || "Choose the best category before approving this transaction."}
        className="max-w-xl"
        onClose={() => {
          setReviewOpen(false);
          setReviewTx(null);
          setReviewSuggestions([]);
          setReviewLoading(false);
        }}
        footer={
          <>
            <Button variant="outlinePill" size="pill" onClick={() => setReviewOpen(false)}>Close</Button>
            {reviewTx && (
              <Button variant="primary" size="pill" onClick={() => approveTx(reviewTx)}>
                Approve current
              </Button>
            )}
          </>
        }
      >
          <div className="space-y-4">
            {reviewTx && (
              <div className="rounded-xl border border-border bg-secondary/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{reviewTx.description || reviewTx.merchant || "Transaction"}</div>
                    <div className="text-xs text-muted-foreground">{reviewTx.date} - {reviewTx.account_name || "Account"}</div>
                  </div>
                  <div className={`text-sm font-semibold ${Number(reviewTx.amount || 0) >= 0 ? "text-emerald" : "text-rose-600"}`}>
                    {fmt(reviewTx.amount)}
                  </div>
                </div>
              </div>
            )}
            {reviewLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Getting suggestions...
              </div>
            ) : (
              <div className="grid gap-3">
                {(reviewSuggestions.length ? reviewSuggestions : (reviewTx?.ai_selected_category ? [{ category: reviewTx.ai_selected_category, confidence: reviewTx.ai_confidence, reason: reviewTx.ai_reason }] : [])).map((suggestion, index) => {
                  const category = suggestion.category || suggestion.name || suggestion.value || suggestion;
                  const confidence = suggestion.confidence ?? suggestion.score ?? null;
                  return (
                    <button
                      key={`${category}-${index}`}
                      type="button"
                      onClick={() => approveTx(reviewTx, category)}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-emerald hover:bg-emerald/5"
                    >
                      <div className="min-w-0 space-y-2">
                        <CategoryBadge category={category} size="sm" />
                        {suggestion.reason && <div className="text-xs text-muted-foreground">{suggestion.reason}</div>}
                      </div>
                      <div className="shrink-0 text-xs font-medium text-muted-foreground">
                        {confidence != null ? `${Math.round(Number(confidence) * 100)}%` : "Approve"}
                      </div>
                    </button>
                  );
                })}
                {!reviewLoading && !reviewSuggestions.length && !reviewTx?.ai_selected_category && (
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No suggestions yet. Run AI classify again or approve the current category.
                  </div>
                )}
              </div>
            )}
          </div>
      </TransactionActionPanel>

      <TransactionActionPanel
        open={splitOpen}
        title="Split transaction"
        description={splitTxDraft?.description || "Assign this transaction across multiple categories."}
        className="max-w-3xl"
        onClose={() => {
          setSplitOpen(false);
          setSplitTxDraft(null);
          setSplitLines([]);
          setSplitSaving(false);
        }}
        footer={
          <>
            <Button variant="outlinePill" size="pill" onClick={() => setSplitOpen(false)}>Cancel</Button>
            <Button variant="primary" size="pill" onClick={saveSplit} disabled={splitSaving || Math.abs(splitDifference) > 0.01}>
              {splitSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save split
            </Button>
          </>
        }
      >
          <div className="space-y-4">
            <div className="grid gap-3 max-h-[50vh] overflow-y-auto pr-1">
              {splitLines.map((line, index) => (
                <div key={index} className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[minmax(0,1.2fr)_120px_minmax(0,1fr)_40px]">
                  <CategoryCombobox
                    value={line.category}
                    onChange={(value) => updateSplitLine(index, "category", value)}
                    categories={selectedCats.categories || selectedCats}
                    placeholder="Category"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.amount}
                    onChange={(e) => updateSplitLine(index, "amount", e.target.value)}
                    aria-label="Split amount"
                  />
                  <Input
                    value={line.description}
                    onChange={(e) => updateSplitLine(index, "description", e.target.value)}
                    placeholder="Note"
                    aria-label="Split note"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSplitLine(index)}
                    disabled={splitLines.length <= 2}
                    aria-label="Remove split line"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outlinePill" size="pill" onClick={addSplitLine}>
                <Plus className="h-4 w-4" /> Add line
              </Button>
              <div className={`text-sm font-medium ${Math.abs(splitDifference) <= 0.01 ? "text-emerald" : "text-rose-600"}`}>
                Split total {fmt(splitEnteredTotal)} of {fmt(splitOriginalAmount)}
                {Math.abs(splitDifference) > 0.01 ? ` - ${fmt(Math.abs(splitDifference))} remaining` : ""}
              </div>
            </div>
          </div>
      </TransactionActionPanel>

      <TransactionActionPanel
        open={transferOpen}
        title="Pair transfer"
        description="Match this transaction with the opposite side of the transfer."
        className="max-w-xl"
        onClose={() => {
          setTransferOpen(false);
          setTransferTx(null);
          setTransferTargetId("");
          setTransferSaving(false);
        }}
        footer={
          <>
            <Button variant="outlinePill" size="pill" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button variant="primary" size="pill" onClick={saveTransferPair} disabled={transferSaving || !transferTargetId}>
              {transferSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Pair transfer
            </Button>
          </>
        }
      >
          <div className="space-y-4">
            {transferTx && (
              <div className="rounded-xl border border-border bg-secondary/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{transferTx.description || "Selected transaction"}</div>
                    <div className="text-xs text-muted-foreground">{transferTx.date} - {transferTx.account_name || "Account"}</div>
                  </div>
                  <div className={`text-sm font-semibold ${Number(transferTx.amount || 0) >= 0 ? "text-emerald" : "text-rose-600"}`}>
                    {fmt(transferTx.amount)}
                  </div>
                </div>
              </div>
            )}
            {transferCandidates.length ? (
              <div className="space-y-2">
                <label className="label-overline">Matching transaction</label>
                <select
                  value={transferTargetId}
                  onChange={(e) => setTransferTargetId(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                >
                  <option value="">Choose a match</option>
                  {transferCandidates.map((candidate) => (
                    <option key={candidate.transaction_id} value={candidate.transaction_id}>
                      {candidate.date} - {candidate.description || candidate.merchant || "Transaction"} - {fmt(candidate.amount)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No eligible opposite-side transactions are visible. Adjust filters or load more transactions, then try again.
              </div>
            )}
          </div>
      </TransactionActionPanel>

      <ComparePeriods open={compareOpen} onClose={() => setCompareOpen(false)} />

        <ConfirmModal
        open={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        onConfirm={() => { confirmCb.current?.(); setConfirmOpen(false); }}
        onCancel={() => setConfirmOpen(false)}
      />

      {newCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setNewCategoryModal(false)}>
          <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium mb-4">Add Custom Category</h3>
            <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Category name" autoFocus
              className="w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-ring focus:outline-none text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && newCategoryName.trim()) { bulkCategory(newCategoryName.trim().toLowerCase().replace(/\s+/g, "_")); setNewCategoryModal(false); } }} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setNewCategoryModal(false)} className="flex-1 h-10 rounded-xl bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={() => { if (newCategoryName.trim()) { bulkCategory(newCategoryName.trim().toLowerCase().replace(/\s+/g, "_")); setNewCategoryModal(false); } }} className="flex-1 h-10 rounded-xl bg-emerald text-white text-sm font-medium hover:bg-emerald/90">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

function SwipeableCard({ t, isSelected, swipedId, setSwipedId, onToggleSelect, onEdit, onDelete, onApprove, onClassify, onSplit, onPairTransfer, onUnpairTransfer }) {
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
                <DropdownMenuItem onClick={() => onClassify?.(t)}>
                  <Sparkles className="h-4 w-4 mr-2" /> AI classify
                </DropdownMenuItem>
                {(t.approval_status === "unapproved" || t.category_approval_status === "unapproved") && (
                  <DropdownMenuItem onClick={() => onApprove?.(t)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onSplit?.(t)}>
                  <PieChartIcon className="h-4 w-4 mr-2" /> Split transaction
                </DropdownMenuItem>
                {!t.transfer_pair_id ? (
                  <DropdownMenuItem onClick={() => onPairTransfer?.(t)}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Pair transfer
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onUnpairTransfer?.(t)}>
                    <X className="h-4 w-4 mr-2" /> Unpair transfer
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(t.transaction_id)} className="text-ruby">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center justify-between pl-11">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs px-2.5 py-1 rounded-full bg-secondary capitalize">{t.category || "uncategorized"}</span>
              {t.is_split && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet/10 text-violet">Split</span>}
              {t.is_transfer && <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky/10 text-sky">Transfer</span>}
              {(t.approval_status === "unapproved" || t.category_approval_status === "unapproved") && <span className="text-[10px] px-2 py-0.5 rounded-full bg-topaz/10 text-topaz">Unapproved</span>}
            </div>
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

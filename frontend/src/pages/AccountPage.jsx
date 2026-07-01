import React, {
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import {
  ArrowLeft,
  Wallet,
  RefreshCcw,
  Trash2,
  Loader2,
  Clock,
  Receipt,
  CreditCard,
  Settings,
  Pencil,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader,
  MetricCard,
  SectionCard,
  EmptyState,
} from "../components/ui/layout";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import TransactionRow from "../components/TransactionRow";
import { toAccountTypeLabel } from "../data/bankLogos";
import BankCardMockup from "../components/BankCardMockup";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../components/ui/sheet";
import CategoryCombobox from "../components/CategoryCombobox";
import CategoryBadge from "../components/CategoryBadge";
import { useCategories } from "../contexts/CategoriesContext";
import ConfirmModal from "../components/ui/ConfirmModal";

export default function AccountPage() {
  const { connectionId } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    document.title = "Account | Penni";
  }, []);

  const [conn, setConn] = useState(null);
  const [txs, setTxs] = useState([]);
  const [totalTx, setTotalTx] = useState(0);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameValue, setNicknameValue] = useState("");
  const [error, setError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceValue, setBalanceValue] = useState("");
  const {
    categories: selectedCats,
    version: categoriesVersion,
    resolveCategory,
  } = useCategories();

  const [showSearch, setShowSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const defaultFilters = useMemo(
    () => ({
      search: "",
      category: "",
      source: "",
      tx_type: "",
      date_from: "",
      date_to: "",
      amount_min: "",
      amount_max: "",
      sort: "date",
      order: "desc",
    }),
    [],
  );
  const [filters, setFilters] = useState(defaultFilters);
  const [offset, setOffset] = useState(0);
  const limit = 100;
  const debounceRef = useRef(null);
  const searchRef = useRef(null);

  const setFilter = useCallback((key, value) => {
    setOffset(0);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleFilter = useCallback((key, value) => {
    setOffset(0);
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? "" : value,
    }));
  }, []);

  const debouncedSetSearch = useCallback((value) => {
    setOffset(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: value }));
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const activeFilters = useMemo(() => {
    const chips = [];
    if (filters.tx_type)
      chips.push({
        key: "tx_type",
        label: filters.tx_type === "income" ? "Income" : "Expense",
      });
    if (filters.source) chips.push({ key: "source", label: filters.source });
    if (filters.category)
      chips.push({
        key: "category",
        label: resolveCategory(filters.category).label,
        value: filters.category,
        isCategory: true,
      });
    if (filters.amount_min)
      chips.push({ key: "amount_min", label: `≥£${filters.amount_min}` });
    if (filters.amount_max)
      chips.push({ key: "amount_max", label: `≤£${filters.amount_max}` });
    if (filters.date_from)
      chips.push({ key: "date_from", label: `From ${filters.date_from}` });
    if (filters.date_to)
      chips.push({ key: "date_to", label: `To ${filters.date_to}` });
    return chips;
  }, [filters, resolveCategory]);

  const clearAllFilters = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchInput("");
    setFilters(defaultFilters);
    setOffset(0);
  }, [defaultFilters]);

  const loadConnection = useCallback(async () => {
    try {
      const isManual = connectionId?.startsWith("manual-");
      const endpoint = isManual
        ? `/accounts/manual/${connectionId.replace("manual-", "")}`
        : `/truelayer/connections/${connectionId}`;
      const { data } = await api.get(endpoint);
      setConn({ ...data, provider: isManual ? "manual" : data.provider });
      setNicknameValue(data.nickname || data.account_name || "");
      document.title = `${data.account_name || "Account"} | Penni`;
    } catch (err) {
      setError(
        formatApiError(err.response?.data?.detail) || "Could not load account",
      );
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  const buildParams = useCallback(() => {
    const params = {
      connection_id: connectionId,
      limit,
      sort: filters.sort,
      order: filters.order,
      offset,
    };
    if (filters.search) params.search = filters.search;
    if (filters.category) params.category = filters.category;
    if (filters.source) params.source = filters.source;
    if (filters.tx_type) params.tx_type = filters.tx_type;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    if (filters.amount_min && !isNaN(filters.amount_min)) params.amount_min = parseFloat(filters.amount_min);
    if (filters.amount_max && !isNaN(filters.amount_max)) params.amount_max = parseFloat(filters.amount_max);
    return params;
  }, [connectionId, filters, offset]);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const params = buildParams();
      const { data } = await api.get("/transactions", { params });
      setTxs(data.transactions);
      setTotalTx(data.total);
      setIncomeTotal(data.income_total || 0);
      setExpenseTotal(data.expense_total || 0);
    } catch {
      toast.error("Failed to load transactions");
    } finally {
      setTxLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);
  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const saveNickname = async () => {
    try {
      await api.put(`/truelayer/connections/${connectionId}`, {
        nickname: nicknameValue,
      });
      toast.success("Nickname saved");
      setEditingNickname(false);
      await loadConnection();
    } catch {
      toast.error("Failed to save nickname");
    }
  };

  const doSync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/truelayer/sync");
      toast.success(`Synced: ${data.new_transactions} new`);
      await loadConnection();
      await loadTransactions();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const removeConn = () => setConfirmRemove(true);

  const handleConfirmRemove = async () => {
    setConfirmRemove(false);
    try {
      const isManual = conn?.provider === "manual";
      await api.delete(
        isManual
          ? `/accounts/manual/${connectionId}`
          : `/truelayer/connections/${connectionId}`,
      );
      toast.success("Account removed");
      navigate("/accounts");
    } catch {
      toast.error("Could not remove account");
    }
  };

  const saveManualBalance = async () => {
    try {
      await api.put(`/accounts/manual/${connectionId}`, {
        balance: parseFloat(balanceValue) || 0,
      });
      toast.success("Balance updated");
      setEditingBalance(false);
      await loadConnection();
    } catch (e) {
      toast.error("Failed to update balance");
    }
  };

  const reconnectConn = async () => {
    try {
      const { data } = await api.post(`/truelayer/reconnect/${connectionId}`);
      window.location.href = data.auth_url;
    } catch (e) {
      toast.error(
        formatApiError(e.response?.data?.detail) || "Reconnect failed",
      );
    }
  };

  const totalPages = Math.ceil(totalTx / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (loading)
    return (
      <div className="space-y-6">
        <div className="h-12 w-64 rounded-2xl bg-secondary/50 animate-pulse" />
        <div className="h-44 rounded-[1.75rem] bg-secondary/30 animate-pulse" />
        <div className="h-96 rounded-2xl bg-secondary/20 animate-pulse" />
      </div>
    );

  if (error)
    return (
      <div className="grid place-items-center min-h-[60vh] text-center p-8">
        <div>
          <p className="text-lg font-medium text-muted-foreground">{error}</p>
          <Button
            onClick={() =>             navigate("/accounts")}
            variant="outlinePill"
            size="pillSm"
            className="mt-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to accounts
          </Button>
        </div>
      </div>
    );

  if (!conn) return null;

  const netTotal = incomeTotal - expenseTotal;

  return (
    <div className="space-y-6" data-testid="account-page">
      {/* Back link */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {/* Bank card mockup header */}
      <div className={`fade-up`}>
        <BankCardMockup connection={conn} size="md" showStatus />

        {/* Nickname + stats row below card */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          {editingNickname ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveNickname();
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={nicknameValue}
                onChange={(e) => setNicknameValue(e.target.value)}
                className="h-8 px-2.5 rounded-lg bg-secondary/50 border border-border focus:border-ring focus:outline-none text-sm font-medium w-48"
                autoFocus
              />
              <button
                type="submit"
                className="text-xs text-emerald font-medium"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingNickname(false)}
                className="text-xs text-muted-foreground"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">
                {conn.account_name}
              </h1>
              <button
                onClick={() => {
                  setEditingNickname(true);
                  setNicknameValue(conn.nickname || conn.account_name || "");
                }}
                className="text-xs text-muted-foreground hover:text-emerald transition-colors"
                title="Edit nickname"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Income / Expenses chips */}
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald/10 text-emerald font-medium">
            +£{incomeTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
            income
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-ruby/10 text-ruby font-medium">
            -£{expenseTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
            spending
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-secondary/80 text-muted-foreground">
            {totalTx} transaction{totalTx !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Balance"
          value={
            conn.balance !== null
              ? `£${conn.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
              : "—"
          }
          icon={Wallet}
          tone="emerald"
        />
        <MetricCard
          label="Transactions"
          value={totalTx.toLocaleString()}
          icon={Receipt}
        />
        <MetricCard
          label="Last Sync"
          value={
            conn.last_sync_at
              ? new Date(conn.last_sync_at).toLocaleDateString()
              : "Never"
          }
          icon={Clock}
        />
        <MetricCard
          label="Account Type"
          value={toAccountTypeLabel(conn.account_type)}
          icon={CreditCard}
        />
      </div>

      {/* Settings & Actions */}
      <SectionCard
        eyebrow="Settings"
        title={
          conn.provider === "manual" ? "Manual account" : "Account settings"
        }
        contentClassName="p-6"
      >
        <div className="flex flex-wrap gap-3">
          {conn.provider === "manual" ? (
            <>
              {editingBalance ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveManualBalance();
                  }}
                  className="flex items-center gap-1.5"
                >
                  <span className="text-sm text-muted-foreground">£</span>
                  <input
                    type="number"
                    value={balanceValue}
                    onChange={(e) => setBalanceValue(e.target.value)}
                    step="0.01"
                    className="h-8 w-28 px-2.5 rounded-lg bg-secondary/50 border border-border focus:border-ring focus:outline-none text-sm font-medium"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="text-xs text-emerald font-medium"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingBalance(false)}
                    className="text-xs text-muted-foreground"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <Button
                  onClick={() => {
                    setEditingBalance(true);
                    setBalanceValue(conn.balance ?? "");
                  }}
                  variant="outlinePill"
                  size="pill"
                >
                  <Pencil className="h-4 w-4 mr-2" /> Update Balance
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                onClick={doSync}
                disabled={syncing}
                variant="outlinePill"
                size="pill"
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4 mr-2" />
                )}
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
              {conn.status === "reconnect_required" && (
                <Button onClick={reconnectConn} variant="danger" size="pill">
                  Reconnect bank
                </Button>
              )}
            </>
          )}
          <Button
            onClick={removeConn}
            variant="outlinePill"
            size="pill"
            className="text-ruby border-ruby/30 hover:bg-ruby/5"
          >
            <Trash2 className="h-4 w-4 mr-2" />{" "}
            {conn.provider === "manual" ? "Remove" : "Disconnect"}
          </Button>
        </div>
        {conn.last_error && conn.provider !== "manual" && (
          <div className="mt-3 p-3 rounded-xl bg-ruby/5 border border-ruby/20 text-xs text-ruby">
            {conn.last_error}
          </div>
        )}
        <div className="mt-4 text-xs text-muted-foreground space-y-1">
          {conn.import_from_date && conn.provider !== "manual" && (
            <p>
              Importing from:{" "}
              {new Date(conn.import_from_date).toLocaleDateString()}
            </p>
          )}
          {conn.last_sync_at && conn.provider !== "manual" && (
            <p>Last synced: {new Date(conn.last_sync_at).toLocaleString()}</p>
          )}
          {conn.created_at && (
            <p>
              {conn.provider === "manual" ? "Created" : "Connected"}:{" "}
              {new Date(conn.created_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </SectionCard>

      {/* Transactions — same layout as main Transactions page */}
      <SectionCard
        eyebrow="Transactions"
        title={`${totalTx} transaction${totalTx !== 1 ? "s" : ""} from this account`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 pb-4">
          {/* Stats */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              Income{" "}
              <strong className="text-emerald font-medium tabular-nums">
                £{incomeTotal.toFixed(2)}
              </strong>
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span>
              Expenses{" "}
              <strong className="text-ruby font-medium tabular-nums">
                £{expenseTotal.toFixed(2)}
              </strong>
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span>
              Net{" "}
              <strong
                className={`font-medium tabular-nums ${netTotal >= 0 ? "text-emerald" : "text-ruby"}`}
              >
                {netTotal >= 0 ? "+" : ""}£{Math.abs(netTotal).toFixed(2)}
              </strong>
            </span>
          </div>

          {/* Action bar — same as Transactions page */}
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
              <select
                value={filters.sort}
                onChange={(e) => setFilter("sort", e.target.value)}
                className="h-8 px-2 rounded-lg bg-secondary/50 border border-border/50 text-[11px] font-medium focus:outline-none focus:border-ring"
              >
                <option value="date">Date</option>
                <option value="amount">Amount</option>
                <option value="description">Description</option>
              </select>
              <button
                onClick={() =>
                  setFilter("order", filters.order === "desc" ? "asc" : "desc")
                }
                className="h-8 w-7 grid place-items-center rounded-lg bg-secondary/50 border border-border/50 hover:bg-secondary/80 transition-colors"
              >
                {filters.order === "desc" ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Filter sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <button
                  className={`h-8 px-3 rounded-full text-xs font-medium transition-all duration-200 ${
                    activeFilters.length > 0
                      ? "bg-emerald/10 text-emerald border border-emerald/20"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <Filter className="h-3 w-3 mr-1 inline" /> Filters
                  {activeFilters.length > 0 && (
                    <span className="ml-1">{activeFilters.length}</span>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription className="text-xs sm:text-sm">
                    Refine transaction list for this account
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-5">
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <select
                      value={filters.tx_type}
                      onChange={(e) => toggleFilter("tx_type", e.target.value)}
                      className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent text-sm focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none transition-colors"
                    >
                      <option value="">All types</option>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                    </select>
                    <select
                      value={filters.source}
                      onChange={(e) => toggleFilter("source", e.target.value)}
                      className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent text-sm focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none transition-colors"
                    >
                      <option value="">All sources</option>
                      <option value="truelayer">TrueLayer</option>
                      <option value="manual">Manual</option>
                      <option value="csv">CSV</option>
                    </select>
                    <CategoryCombobox
                      value={filters.category}
                      onChange={(val) => toggleFilter("category", val)}
                      categories={selectedCats}
                      placeholder="All categories"
                      allowClear
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Min £"
                      value={filters.amount_min}
                      onChange={(e) => {
                        setOffset(0);
                        setFilters((p) => ({
                          ...p,
                          amount_min: e.target.value,
                        }));
                      }}
                      className="text-sm h-10"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Max £"
                      value={filters.amount_max}
                      onChange={(e) => {
                        setOffset(0);
                        setFilters((p) => ({
                          ...p,
                          amount_max: e.target.value,
                        }));
                      }}
                      className="text-sm h-10"
                    />
                    <Input
                      type="date"
                      value={filters.date_from}
                      onChange={(e) => {
                        setOffset(0);
                        setFilters((p) => ({
                          ...p,
                          date_from: e.target.value,
                        }));
                      }}
                      className="text-sm h-10"
                    />
                    <Input
                      type="date"
                      value={filters.date_to}
                      onChange={(e) => {
                        setOffset(0);
                        setFilters((p) => ({ ...p, date_to: e.target.value }));
                      }}
                      className="text-sm h-10"
                    />
                  </div>
                  <div className="border-t border-border pt-4 flex justify-end">
                    <button
                      onClick={clearAllFilters}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Clear all filters
                    </button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Inline search bar — same as Transactions */}
        {showSearch && (
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/70 backdrop-blur-xl px-4 h-9 shadow-sm transition-all duration-200 mb-3">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                debouncedSetSearch(e.target.value);
              }}
              placeholder="Search transactions... (/)"
              className="w-full bg-transparent outline-none text-xs"
            />
            {filters.search && (
              <button
                onClick={() => {
                  setSearchInput("");
                  setFilter("search", "");
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {activeFilters.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald/10 text-emerald border border-emerald/20"
              >
                {chip.isCategory ? (
                  <CategoryBadge category={chip.value} size="sm" />
                ) : (
                  chip.label
                )}
                <button
                  onClick={() => {
                    setFilter(chip.key, "");
                    setOffset(0);
                  }}
                  className="hover:text-emerald/80"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <button
              onClick={clearAllFilters}
              className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}

        {/* Transaction table */}
        <div className="rounded-xl border border-border bg-card/90 backdrop-blur-xl shadow-card overflow-hidden">
          {txLoading ? (
            <SkeletonTable rows={6} className="p-3" />
          ) : txs.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Receipt}
                title={
                  filters.search || filters.category
                    ? "No matching transactions"
                    : "No transactions yet"
                }
                description={
                  filters.search || filters.category
                    ? "Try adjusting your search or filters."
                    : "Transactions from this account will appear here after syncing."
                }
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b border-border">
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Description</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((t) => (
                      <tr
                        key={t.transaction_id}
                        className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {t.date?.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="font-medium truncate">
                            {t.description}
                          </div>
                          {t.normalized_merchant &&
                            t.normalized_merchant !== t.description && (
                              <div className="text-xs text-muted-foreground truncate">
                                {t.normalized_merchant}
                              </div>
                            )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-1 rounded-full bg-secondary capitalize">
                            {t.category || "uncategorized"}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap ${t.amount >= 0 ? "text-emerald" : "text-ruby"}`}
                        >
                          {t.amount >= 0 ? "+" : "-"}£
                          {Math.abs(t.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination — same chevron style as Transactions */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Showing {offset + 1}–{Math.min(offset + limit, totalTx)} of{" "}
                    {totalTx}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                      disabled={offset === 0}
                      className="h-7 w-7 rounded-lg grid place-items-center border border-border hover:bg-secondary disabled:opacity-30 text-muted-foreground"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-muted-foreground min-w-[3rem] text-center">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setOffset(
                          Math.min((totalPages - 1) * limit, offset + limit),
                        )
                      }
                      disabled={offset + limit >= totalTx}
                      className="h-7 w-7 rounded-lg grid place-items-center border border-border hover:bg-secondary disabled:opacity-30 text-muted-foreground"
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SectionCard>
      <ConfirmModal
        open={confirmRemove}
        title="Remove this connection?"
        message="Remove this connection? Transactions will be kept."
        confirmLabel="Yes, remove"
        onConfirm={handleConfirmRemove}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}

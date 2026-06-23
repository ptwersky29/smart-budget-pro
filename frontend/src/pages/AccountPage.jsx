import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import {
  ArrowLeft, Wallet, RefreshCcw, Trash2, Loader2,
  Clock, Receipt, CreditCard, Settings, Pencil,
  Search, X, ArrowUpDown, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, MetricCard, SectionCard, EmptyState } from "../components/ui/layout";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Button } from "../components/ui/button";
import TransactionRow from "../components/TransactionRow";
import { toAccountTypeLabel } from "../data/bankLogos";
import BankCardMockup from "../components/BankCardMockup";

const CATEGORIES = [
  "income", "housing", "transport", "food", "utilities", "insurance",
  "healthcare", "entertainment", "shopping", "education", "personal",
  "travel", "bills", "groceries", "dining", "subscriptions",
  "maaser", "charity", "transfer", "other",
];

export default function AccountPage() {
  const { connectionId } = useParams();
  const navigate = useNavigate();
  useEffect(() => { document.title = "Account | FinanceAI"; }, []);

  const [conn, setConn] = useState(null);
  const [txs, setTxs] = useState([]);
  const [totalTx, setTotalTx] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameValue, setNicknameValue] = useState("");
  const [error, setError] = useState(null);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceValue, setBalanceValue] = useState("");

  const [search, setSearch] = useState("");
  const [txType, setTxType] = useState("");
  const [sort, setSort] = useState("date");
  const [order, setOrder] = useState("desc");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const loadConnection = useCallback(async () => {
    try {
      const { data } = await api.get(`/truelayer/connections/${connectionId}`);
      setConn(data);
      setNicknameValue(data.nickname || data.account_name || "");
      document.title = `${data.account_name || "Account"} | FinanceAI`;
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || "Could not load account");
    } finally { setLoading(false); }
  }, [connectionId]);

  const buildParams = useCallback(() => {
    const params = { connection_id: connectionId, limit, sort, order, offset };
    if (search.trim()) params.search = search.trim();
    if (txType) params.tx_type = txType;
    if (category) params.category = category;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    return params;
  }, [connectionId, search, txType, sort, order, category, dateFrom, dateTo, offset]);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const params = buildParams();
      const { data } = await api.get("/transactions", { params });
      setTxs(data.transactions);
      setFilteredTotal(data.total || 0);
    } catch { /* ignore */ } finally { setTxLoading(false); }
  }, [buildParams]);

  useEffect(() => { loadConnection(); }, [loadConnection]);
  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const saveNickname = async () => {
    try {
      await api.put(`/truelayer/connections/${connectionId}`, { nickname: nicknameValue });
      toast.success("Nickname saved");
      setEditingNickname(false);
      await loadConnection();
    } catch { toast.error("Failed to save nickname"); }
  };

  const doSync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/truelayer/sync");
      toast.success(`Synced: ${data.new_transactions} new`);
      await loadConnection();
      await loadTransactions();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Sync failed"); }
    finally { setSyncing(false); }
  };

  const removeConn = async () => {
    if (!window.confirm("Remove this connection? Transactions will be kept.")) return;
    try {
      const isManual = conn?.provider === "manual";
      await api.delete(isManual ? `/accounts/manual/${connectionId}` : `/truelayer/connections/${connectionId}`);
      toast.success("Account removed");
      navigate("/connections");
    } catch { toast.error("Could not remove account"); }
  };

  const saveManualBalance = async () => {
    try {
      await api.put(`/accounts/manual/${connectionId}`, { balance: parseFloat(balanceValue) || 0 });
      toast.success("Balance updated");
      setEditingBalance(false);
      await loadConnection();
    } catch (e) { toast.error("Failed to update balance"); }
  };

  const reconnectConn = async () => {
    try {
      const { data } = await api.post(`/truelayer/reconnect/${connectionId}`);
      window.location.href = data.auth_url;
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Reconnect failed"); }
  };

  const toggleOrder = () => setOrder(o => o === "desc" ? "asc" : "desc");

  const resetFilters = () => {
    setSearch(""); setTxType(""); setCategory(""); setDateFrom(""); setDateTo("");
    setSort("date"); setOrder("desc"); setOffset(0);
  };

  const hasFilters = search || txType || category || dateFrom || dateTo;

  const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  if (loading) return (
    <div className="space-y-6">
      <div className="h-12 w-64 rounded-2xl bg-secondary/50 animate-pulse" />
      <div className="h-44 rounded-[1.75rem] bg-secondary/30 animate-pulse" />
      <div className="h-96 rounded-2xl bg-secondary/20 animate-pulse" />
    </div>
  );

  if (error) return (
    <div className="grid place-items-center min-h-[60vh] text-center p-8">
      <div>
        <p className="text-lg font-medium text-muted-foreground">{error}</p>
        <Button onClick={() => navigate("/connections")} variant="outlinePill" size="pillSm" className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to connections
        </Button>
      </div>
    </div>
  );

  if (!conn) return null;

  return (
    <div className="space-y-6" data-testid="account-page">
      {/* Back link */}
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {/* Bank card mockup header */}
      <div className={`fade-up`}>
        <BankCardMockup connection={conn} size="md" showStatus />

        {/* Nickname + stats row below card */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          {editingNickname ? (
            <form onSubmit={(e) => { e.preventDefault(); saveNickname(); }} className="flex items-center gap-1.5">
              <input type="text" value={nicknameValue} onChange={(e) => setNicknameValue(e.target.value)}
                className="h-8 px-2.5 rounded-lg bg-secondary/50 border border-border focus:border-ring focus:outline-none text-sm font-medium w-48" autoFocus />
              <button type="submit" className="text-xs text-emerald font-medium">Save</button>
              <button type="button" onClick={() => setEditingNickname(false)} className="text-xs text-muted-foreground">Cancel</button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{conn.account_name}</h1>
              <button onClick={() => { setEditingNickname(true); setNicknameValue(conn.nickname || conn.account_name || ""); }}
                className="text-xs text-muted-foreground hover:text-emerald transition-colors" title="Edit nickname">
                <Settings className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Income / Expenses chips */}
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald/10 text-emerald font-medium">
            +£{income.toLocaleString(undefined, { minimumFractionDigits: 2 })} income
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-ruby/10 text-ruby font-medium">
            -£{expenses.toLocaleString(undefined, { minimumFractionDigits: 2 })} spending
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-secondary/80 text-muted-foreground">
            {totalTx} transaction{totalTx !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Balance" value={conn.balance !== null ? `£${conn.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"} icon={Wallet} tone="emerald" />
        <MetricCard label="Transactions" value={totalTx.toLocaleString()} icon={Receipt} />
        <MetricCard label="Last Sync" value={conn.last_sync_at ? new Date(conn.last_sync_at).toLocaleDateString() : "Never"} icon={Clock} />
        <MetricCard label="Account Type" value={toAccountTypeLabel(conn.account_type)} icon={CreditCard} />
      </div>

      {/* Settings & Actions */}
      <SectionCard eyebrow="Settings" title={conn.provider === "manual" ? "Manual account" : "Account settings"} contentClassName="p-6">
        <div className="flex flex-wrap gap-3">
          {conn.provider === "manual" ? (
            <>
              {editingBalance ? (
                <form onSubmit={(e) => { e.preventDefault(); saveManualBalance(); }} className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">£</span>
                  <input type="number" value={balanceValue} onChange={(e) => setBalanceValue(e.target.value)}
                    step="0.01" className="h-8 w-28 px-2.5 rounded-lg bg-secondary/50 border border-border focus:border-ring focus:outline-none text-sm font-medium" autoFocus />
                  <button type="submit" className="text-xs text-emerald font-medium">Save</button>
                  <button type="button" onClick={() => setEditingBalance(false)} className="text-xs text-muted-foreground">Cancel</button>
                </form>
              ) : (
                <Button onClick={() => { setEditingBalance(true); setBalanceValue(conn.balance ?? ""); }} variant="outlinePill" size="pill">
                  <Pencil className="h-4 w-4 mr-2" /> Update Balance
                </Button>
              )}
            </>
          ) : (
            <>
              <Button onClick={doSync} disabled={syncing} variant="outlinePill" size="pill">
                {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
              {conn.status === "reconnect_required" && (
                <Button onClick={reconnectConn} variant="danger" size="pill">
                  Reconnect bank
                </Button>
              )}
            </>
          )}
          <Button onClick={removeConn} variant="outlinePill" size="pill" className="text-ruby border-ruby/30 hover:bg-ruby/5">
            <Trash2 className="h-4 w-4 mr-2" /> {conn.provider === "manual" ? "Remove" : "Disconnect"}
          </Button>
        </div>
        {conn.last_error && conn.provider !== "manual" && (
          <div className="mt-3 p-3 rounded-xl bg-ruby/5 border border-ruby/20 text-xs text-ruby">
            {conn.last_error}
          </div>
        )}
        <div className="mt-4 text-xs text-muted-foreground space-y-1">
          {conn.import_from_date && conn.provider !== "manual" && <p>Importing from: {new Date(conn.import_from_date).toLocaleDateString()}</p>}
          {conn.last_sync_at && conn.provider !== "manual" && <p>Last synced: {new Date(conn.last_sync_at).toLocaleString()}</p>}
          {conn.created_at && <p>{conn.provider === "manual" ? "Created" : "Connected"}: {new Date(conn.created_at).toLocaleDateString()}</p>}
        </div>
      </SectionCard>

      {/* Transactions with search, sort, filters */}
      <SectionCard eyebrow="Transactions" title={`${filteredTotal} transaction${filteredTotal !== 1 ? "s" : ""} from this account`} contentClassName="p-0">
        {/* Search + filter bar */}
        <div className="p-4 sm:p-5 border-b border-border/70 space-y-3">
          {/* Search row */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              placeholder="Search transactions…"
              className="w-full h-10 pl-9 pr-8 rounded-xl bg-secondary/30 border border-border focus:border-emerald/50 focus:outline-none text-sm" />
            {search && (
              <button onClick={() => { setSearch(""); setOffset(0); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter chips row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Tx type filter */}
            <div className="flex items-center gap-1 rounded-lg bg-secondary/30 border border-border/50 p-0.5">
              {["", "income", "expense"].map((t) => (
                <button key={t || "all"} onClick={() => { setTxType(t); setOffset(0); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${txType === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {t ? t.charAt(0).toUpperCase() + t.slice(1) : "All"}
                </button>
              ))}
            </div>

            <span className="text-muted-foreground/40">|</span>

            {/* Sort + order */}
            <div className="flex items-center gap-1">
              <select value={sort} onChange={(e) => setSort(e.target.value)}
                className="h-8 px-2 rounded-lg bg-secondary/30 border border-border/50 text-xs font-medium focus:outline-none focus:border-ring">
                <option value="date">Date</option>
                <option value="amount">Amount</option>
                <option value="description">Description</option>
              </select>
              <button onClick={toggleOrder}
                className="h-8 w-8 grid place-items-center rounded-lg bg-secondary/30 border border-border/50 hover:bg-secondary/60 transition-colors">
                {order === "desc" ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </div>

            <span className="text-muted-foreground/40">|</span>

            {/* Category filter */}
            <select value={category} onChange={(e) => { setCategory(e.target.value); setOffset(0); }}
              className="h-8 px-2 rounded-lg bg-secondary/30 border border-border/50 text-xs font-medium focus:outline-none focus:border-ring">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>

            {/* Date range */}
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
              className="h-8 px-2 rounded-lg bg-secondary/30 border border-border/50 text-xs focus:outline-none focus:border-ring" title="From date" />
            <span className="text-xs text-muted-foreground">–</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
              className="h-8 px-2 rounded-lg bg-secondary/30 border border-border/50 text-xs focus:outline-none focus:border-ring" title="To date" />

            {/* Clear filters */}
            {hasFilters && (
              <button onClick={resetFilters}
                className="text-xs text-muted-foreground hover:text-ruby transition-colors ml-1">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Transaction list */}
        {txLoading ? (
          <SkeletonTable rows={6} className="p-3" />
        ) : txs.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Receipt}
              title={hasFilters ? "No matching transactions" : "No transactions yet"}
              description={hasFilters ? "Try adjusting your search or filters." : "Transactions from this account will appear here after syncing."}
            />
          </div>
        ) : (
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
                  <tr key={t.transaction_id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{t.date?.slice(0, 10)}</td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="font-medium truncate">{t.description}</div>
                      {t.normalized_merchant && t.normalized_merchant !== t.description && (
                        <div className="text-xs text-muted-foreground truncate">{t.normalized_merchant}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-secondary capitalize">{t.category || "uncategorized"}</span>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap ${t.amount >= 0 ? "text-emerald" : "text-ruby"}`}>
                      {t.amount >= 0 ? "+" : "-"}£{Math.abs(t.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!txLoading && txs.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/70 text-xs text-muted-foreground">
            <span>Showing {offset + 1}–{Math.min(offset + limit, filteredTotal)} of {filteredTotal}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setOffset(o => Math.max(0, o - limit))} disabled={offset === 0}
                className="px-3 py-1.5 rounded-lg border border-border/50 hover:bg-secondary/30 disabled:opacity-30 transition-colors">
                Previous
              </button>
              <button onClick={() => setOffset(o => o + limit)} disabled={offset + limit >= filteredTotal}
                className="px-3 py-1.5 rounded-lg border border-border/50 hover:bg-secondary/30 disabled:opacity-30 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
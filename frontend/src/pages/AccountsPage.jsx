import React, { useCallback, useEffect, useState, useRef } from "react";
import { api, formatApiError } from "../lib/api";
import { Link } from "react-router-dom";
import { Plus, Wallet, Landmark, PiggyBank, CreditCard, Banknote, ArrowRight, Lock, Loader2, ChevronRight, Building2, Upload, RefreshCcw, Trash2, AlertCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader, SectionCard } from "../components/ui/layout";
import Skeleton from "../components/ui/Skeleton";
import { Button } from "../components/ui/button";
import AccountFormModal from "../components/AccountFormModal";
import BankCardMockup from "../components/BankCardMockup";

const ACCOUNT_TYPE_META = {
  current: { icon: Wallet, label: "Current Account", color: "bg-emerald/10 text-emerald", border: "border-l-emerald-500" },
  savings: { icon: PiggyBank, label: "Savings", color: "bg-violet/10 text-violet", border: "border-l-violet-500" },
  cash: { icon: Banknote, label: "Cash", color: "bg-topaz/10 text-topaz", border: "border-l-topaz-500" },
  credit: { icon: CreditCard, label: "Credit Card", color: "bg-ruby/10 text-ruby", border: "border-l-ruby-500" },
};

function AccountLogo({ account, size = "md" }) {
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg" };
  const imgSizes = { sm: "h-6 w-6", md: "h-8 w-8", lg: "h-10 w-10" };
  const sizeClass = sizes[size] || sizes.md;
  const imgSize = imgSizes[size] || imgSizes.md;
  const initials = (account.name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (account.image) {
    return (
      <div className={`shrink-0 rounded-full overflow-hidden ${sizeClass} ring-2 ring-white dark:ring-gray-800 shadow-sm`}>
        <img src={account.image} alt={account.name} className={`${imgSize} object-cover`}
          onError={(e) => { e.target.onerror = null; e.target.style.display = "none"; e.target.parentElement.className = `shrink-0 rounded-full ${sizeClass} flex items-center justify-center font-bold text-white`; e.target.parentElement.style.background = account.color || "#059669"; e.target.parentElement.innerText = initials; }} />
      </div>
    );
  }

  return (
    <div className={`shrink-0 rounded-full ${sizeClass} flex items-center justify-center font-bold text-white shadow-sm`}
      style={{ background: account.color || "#059669" }}>
      {initials}
    </div>
  );
}

function AccountCard({ account }) {
  const meta = ACCOUNT_TYPE_META[account.type] || ACCOUNT_TYPE_META.current;
  const Icon = meta.icon;
  const balanceFmt = Number(account.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isSavings = account.type === "savings";

  return (
    <Link to={`/accounts/${account.account_id}`}
      className={`group relative block rounded-2xl border border-border/50 bg-card hover:bg-card/80 hover:shadow-lg hover:border-border/80 transition-all duration-300 overflow-hidden ${isSavings ? "opacity-90 hover:opacity-100" : ""}`}>
      {/* Top color bar */}
      <div className="h-1.5" style={{ background: account.color || "#059669" }} />

      <div className="p-5">
        <div className="flex items-start gap-4">
          <AccountLogo account={account} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm truncate group-hover:text-emerald transition-colors">
                {account.name}
              </h3>
              {isSavings && (
                <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet/10 text-violet border border-violet/20">
                  <Lock className="h-2.5 w-2.5" /> Savings
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${meta.color} font-medium`}>
                <Icon className="h-2.5 w-2.5" /> {meta.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{account.currency}</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-emerald group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground mb-0.5">
              {isSavings ? "Saved" : "Available Balance"}
            </p>
            <p className={`text-xl sm:text-2xl font-bold tracking-tight ${isSavings ? "text-violet" : "text-foreground"}`}>
              £{balanceFmt}
            </p>
          </div>
          {account.is_offline && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary/60 text-muted-foreground border border-border/40">
              Manual
            </span>
          )}
        </div>
      </div>

      {isSavings && (
        <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-violet/5 pointer-events-none" />
      )}
    </Link>
  );
}

function TotalBalanceSection({ accounts, loading }) {
  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const savingsBalance = accounts.filter((a) => a.type === "savings").reduce((s, a) => s + (a.balance || 0), 0);
  const currentBalance = totalBalance - savingsBalance;

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-card via-card/95 to-card/90 backdrop-blur-xl shadow-card p-6 sm:p-8 flex items-center justify-center h-full">
        <div className="w-full">
          <Skeleton className="h-10 w-48 mb-4" />
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-card via-card/95 to-card/90 backdrop-blur-xl shadow-card h-full flex flex-col justify-center">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-violet/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative p-6 sm:p-8">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald/10 text-emerald">
            <Wallet className="h-4 w-4" />
          </span>
          <p className="label-overline text-muted-foreground">Total Net Worth</p>
        </div>

        <p className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mt-2">
          £{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald" />
            <span className="text-sm text-muted-foreground">
              Available <strong className="text-foreground font-semibold">£{currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-violet" />
            <span className="text-sm text-muted-foreground">
              Savings <strong className="text-violet font-semibold">£{savingsBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>
          <span className="text-xs text-muted-foreground/50">{accounts.length} account{accounts.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  useEffect(() => { document.title = "Accounts & Import | FinanceAI"; }, []);
  
  // Accounts state
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Import state
  const [status, setStatus] = useState("idle");
  const [conns, setConns] = useState([]);
  const [totalTx, setTotalTx] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [importFromDate, setImportFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  });
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/accounts");
      setAccounts(data.accounts || []);
    } catch (e) {
      toast.error(formatApiError(e) || "Could not load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConns = useCallback(async () => {
    try {
      const { data } = await api.get("/truelayer/connections");
      setConns(data.connections);
      setTotalTx(data.total_transactions);
    } catch (err) {
      if (err.response?.status === 500 && err.response?.data?.detail?.includes("configured")) {
        setNeedsSetup(true);
      }
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/statements");
      setUploadHistory(data.statements || data || []);
    } catch {}
  }, []);

  useEffect(() => { 
    loadAccounts(); 
    loadConns(); 
    loadHistory(); 
  }, [loadAccounts, loadConns, loadHistory]);

  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/truelayer/sync");
      toast.success(`Synced: ${data.new_transactions} new, ${data.duplicates_skipped} duplicates`);
      await loadConns();
      await loadAccounts();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Sync failed");
    } finally { setSyncing(false); }
  }, [loadConns, loadAccounts]);

  const connect = async () => {
    setStatus("connecting");
    try {
      const { data } = await api.get("/truelayer/auth-url", {
        params: importFromDate ? { from_date: importFromDate } : {},
      });
      setStatus("redirecting");
      setTimeout(() => { window.location.href = data.auth_url; }, 600);
    } catch (e) {
      setStatus("failed");
      const msg = formatApiError(e.response?.data?.detail);
      if (msg?.includes("not configured") || msg?.includes("administrator")) {
        setNeedsSetup(true);
        toast.error("Banking not configured yet — admin needs to set up TrueLayer");
      } else {
        toast.error(msg || "Could not connect");
      }
    }
  };

  const removeConn = async (id) => {
    try { 
      await api.delete(`/truelayer/connections/${id}`); 
      toast.success("Connection removed"); 
      await loadConns(); 
      await loadAccounts();
    }
    catch { toast.error("Could not remove"); }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File too large — max 5 MB"); return; }
    setUploadBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/statements/upload", fd);
      toast.success(`Statement processed: ${data.transaction_count || 0} transactions found`);
      await loadHistory();
      await loadAccounts();
    } catch (e) { toast.error(formatApiError(e) || "Upload failed"); }
    finally { setUploadBusy(false); }
  };

  const needsReconnect = conns.some((c) => c.status === "reconnect_required");

  const currentAccounts = accounts.filter((a) => a.type !== "savings");
  const savingsAccounts = accounts.filter((a) => a.type === "savings");

  return (
    <div className="space-y-8 pb-8">
      <PageHeader
        eyebrow="Accounts & Import"
        title="Your accounts."
        description="All your bank accounts, wallets, savings, and statement imports in one place."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outlinePill" size="pill" onClick={doSync} disabled={syncing || conns.length === 0}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Sync now
            </Button>
            <Button onClick={() => setShowCreateModal(true)} variant="primary" size="pill">
              <Plus className="h-4 w-4 mr-1.5" /> New Account
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TotalBalanceSection accounts={accounts} loading={loading} />
        </div>
        
        {/* Import Summary Cards */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-5 shadow-card flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-topaz/10 text-topaz">
                <Building2 className="h-4 w-4" />
              </span>
              <p className="label-overline text-[11px]">Bank Connections</p>
            </div>
            <p className="mt-1 text-3xl tracking-tight font-semibold">{conns.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-5 shadow-card flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet/10 text-violet">
                <RefreshCcw className="h-4 w-4" />
              </span>
              <p className="label-overline text-[11px]">Transactions Synced</p>
            </div>
            <p className="mt-1 text-3xl tracking-tight font-semibold">{totalTx.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {(needsSetup || needsReconnect) && (
        <div className={`rounded-xl border p-3 flex items-center gap-2 text-xs ${needsReconnect ? "border-ruby/40 bg-ruby/5 text-ruby" : "border-topaz/40 bg-topaz/5 text-topaz"}`}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          {needsReconnect
            ? "Some bank connections need reconnecting — use the Reconnect button below."
            : "Banking not configured — ask an admin to set up TrueLayer in Settings."}
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <EmptyState
          icon={Landmark}
          title="No accounts yet"
          description="Create your first account or connect a bank to start tracking your money."
          action={
            <div className="flex items-center gap-3">
              <Button onClick={() => setShowCreateModal(true)} variant="primary" size="pill">
                <Plus className="h-4 w-4 mr-1.5" /> Create Account
              </Button>
              <Button variant="outlinePill" size="pill" onClick={connect} disabled={status === "connecting" || status === "redirecting"}>
                {status === "connecting" || status === "redirecting" ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Connecting…</> : <><Building2 className="h-4 w-4 mr-1.5" /> Connect Bank</>}
              </Button>
            </div>
          }
        />
      )}

      {loading && accounts.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border/50 bg-card p-5">
              <Skeleton className="h-10 w-10 rounded-full mb-3" />
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-3 w-24 mb-4" />
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
        </div>
      )}

      {currentAccounts.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Current Accounts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentAccounts.map((a) => (
              <AccountCard key={a.account_id} account={a} />
            ))}
          </div>
        </div>
      )}

      {savingsAccounts.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-violet" /> Savings
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {savingsAccounts.map((a) => (
              <AccountCard key={a.account_id} account={a} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-8">
        {/* Bank Connections */}
        <SectionCard eyebrow="Connections" title="Bank connections" contentClassName="p-0">
          <div className="p-5 border-b border-border/70 flex items-center justify-between gap-3 flex-wrap bg-secondary/20">
            <Button variant="primary" size="pill" onClick={connect} disabled={status === "connecting" || status === "redirecting"}>
              {status === "connecting" || status === "redirecting" ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Working…</> : <><Plus className="h-4 w-4 mr-1" /> Connect Bank</>}
            </Button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              From
              <input type="date" value={importFromDate} onChange={(e) => setImportFromDate(e.target.value)}
                className="h-8 px-2 rounded-lg bg-card border border-border/50 text-xs focus:border-ring focus:outline-none transition-colors" />
            </label>
          </div>
          {conns.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Building2} title="No banks connected" description="Connect a bank to automatically import transactions." />
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {conns.map((c, i) => (
                  <div key={c.connection_id} className={`fade-up delay-${Math.min(i, 5)}`}>
                    <BankCardMockup connection={c} size="xs" showStatus />
                    <div className="mt-2 flex items-center gap-2 justify-between">
                      <p className="text-[10px] text-muted-foreground">
                        {c.config?.institution && <span>{c.config.institution}</span>}
                        {c.last_sync_at && <span>{c.config?.institution ? " · " : ""}synced {new Date(c.last_sync_at).toLocaleDateString()}</span>}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {c.status === "reconnect_required" && (
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation();
                            (async () => { try { const { data } = await api.post(`/truelayer/reconnect/${c.connection_id}`); setTimeout(() => { window.location.href = data.auth_url; }, 600); } catch { toast.error("Reconnect failed"); } })();
                          }} className="text-xs px-2 py-1 rounded-lg border border-ruby/30 text-ruby hover:bg-ruby/5 transition-colors">Reconnect</button>
                        )}
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeConn(c.connection_id); }}
                          className="text-xs px-2 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-ruby hover:border-ruby/30 transition-colors">
                          <Trash2 className="h-3 w-3 inline mr-1" />Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Statement Upload */}
        <SectionCard eyebrow="Manual import" title="Upload a statement" contentClassName="p-0">
          <div
            className={`p-8 sm:p-10 text-center border-b border-border/70 transition-all duration-300 ${dragOver ? "bg-emerald/5 border-emerald/30 border-dashed" : "bg-secondary/20"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files[0]); }}
          >
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-card border border-border/50 shadow-sm text-emerald">
              <Upload className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium">Drop a CSV or PDF here</p>
            <p className="text-xs text-muted-foreground mt-1">or click to browse — max 5 MB</p>
            <input ref={fileRef} type="file" accept=".csv,.pdf" onChange={(e) => { handleUpload(e.target.files[0]); e.target.value = ""; }}
              className="hidden" />
            <Button variant="outlinePill" size="pill" onClick={() => fileRef.current?.click()} disabled={uploadBusy} className="mt-5">
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
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.created_at ? new Date(s.created_at).toLocaleDateString() : ""}</p>
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

      <AccountFormModal open={showCreateModal} onClose={() => setShowCreateModal(false)} onCreated={() => { loadAccounts(); setShowCreateModal(false); }} />
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useActions } from "../contexts/ActionContext";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  ChevronRight,
  CreditCard,
  Landmark,
  Loader2,
  Lock,
  PiggyBank,
  Plus,
  RefreshCcw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "../lib/api";
import { getDisplayName } from "../lib/utils";
import { accountGradient } from "../design-system/account-gradients";
import { getBankLogoOrFallback, pickBankInstitution } from "../data/bankLogos";
import { formatCurrency } from "../lib/format";
import { buildDailyBalanceTrend } from "../lib/balanceTrend";
import Sparkline from "../components/ui/Sparkline";
import { humanizeCategoryName } from "../lib/categories";
import Skeleton from "../components/ui/Skeleton";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { EmptyPanel, PageHeader, Surface } from "../components/ui/page";
import AccountFormModal from "../components/AccountFormModal";

const ACCOUNT_TYPE_META = {
  current: { icon: Wallet, label: "Current account" },
  savings: { icon: PiggyBank, label: "Savings" },
  cash: { icon: Wallet, label: "Cash" },
  credit: { icon: CreditCard, label: "Credit card" },
  credit_card: { icon: CreditCard, label: "Credit card" },
  investment: { icon: TrendingUp, label: "Investment" },
  other: { icon: Wallet, label: "Other" },
};

function AccountLogo({ account, size = "md" }) {
  const sizes = {
    sm: "h-8 w-8 text-[10px]",
    md: "h-10 w-10 text-xs",
    lg: "h-12 w-12 text-sm",
  };
  const sizeClass = sizes[size] || sizes.md;
  const displayName = getDisplayName(account);
  const initials = displayName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const brandInstitution = pickBankInstitution(account?.institution, account?.provider, account?.name);
  const bankLogoUrl = !account?.image && brandInstitution ? getBankLogoOrFallback(brandInstitution) : null;
  const [imgError, setImgError] = useState(false);

  if (account.image && !imgError) {
    return (
      <span className={`shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-black/[0.04] ${sizeClass}`}>
        <img src={account.image} alt={account.name} className="h-full w-full object-cover" onError={() => setImgError(true)} />
      </span>
    );
  }

  if (bankLogoUrl && !imgError) {
    return (
      <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/[0.04] dark:bg-white/10 ${sizeClass}`}>
        <img src={bankLogoUrl} alt={displayName} className="h-full w-full object-contain p-1.5" onError={() => setImgError(true)} />
      </span>
    );
  }

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${sizeClass}`}
      style={{ background: account.color || "#2f9e73" }}
    >
      {initials}
    </span>
  );
}

function AccountCard({ account, connection, onSelect }) {
  const meta = ACCOUNT_TYPE_META[account.type] || ACCOUNT_TYPE_META.current;
  const Icon = meta.icon;
  const isSavings = account.type === "savings";
  const displayName = getDisplayName(account);
  const isTokenExpired = connection?.expires_at && new Date(connection.expires_at) < new Date();
  const needsReconnect = connection && (connection.status === "reconnect_required" || isTokenExpired);

  return (
    <Link
      to={`/accounts/${account.account_id}`}
      onClick={onSelect ? event => { event.preventDefault(); onSelect(account); } : undefined}
      className="penni-account-card penni-interactive group relative flex flex-col justify-between overflow-hidden p-5"
      style={{ "--account-gradient": accountGradient(account) }}
    >
      
      <div className="flex min-w-0 items-start gap-3">
        <AccountLogo account={account} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[13px] font-semibold transition-colors group-hover:text-emerald">{displayName}</h3>
            {isSavings ? <Lock className="h-2.5 w-2.5 shrink-0 text-violet" /> : null}
          </div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] text-muted-foreground">
            <Icon className="h-2.5 w-2.5" /> {meta.label}
            <span className="text-border">·</span>
            {account.currency || "GBP"}
          </p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>

      <div className="relative mt-8 flex items-end justify-between gap-2">
        <div>
          <p className="text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
            {isSavings ? "Saved" : "Available"}
          </p>
          <p className="money-tabular mt-0.5 text-lg font-semibold leading-none">{formatCurrency(account.balance)}</p>
        </div>
        {account.is_offline ? (
          <span className="rounded-full border border-border/60 bg-secondary/60 px-2 py-0.5 text-[9px] text-muted-foreground">
            Offline
          </span>
        ) : needsReconnect ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-ruby/20 bg-ruby/10 px-2 py-0.5 text-[9px] text-ruby">
            <AlertCircle className="h-2.5 w-2.5" /> Reconnect
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald/15 bg-emerald/10 px-2 py-0.5 text-[9px] text-emerald">
            <RefreshCcw className="h-2.5 w-2.5" /> Connected
          </span>
        )}
      </div>
    </Link>
  );
}

function BalanceHero({ accounts, loading, connections, totalTx, onConnect, connecting, onSync, syncing }) {
 const balance = accounts.reduce((sum,a)=>sum+(Number(a.balance)||0),0);
 const savings = accounts.filter(a=>a.type==="savings").reduce((sum,a)=>sum+(Number(a.balance)||0),0);
 const current = balance-savings;
 if(loading) return <Skeleton className="h-36 rounded-[24px]"/>;
 return <section className="penni-reference-account-summary grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Account summary">
  {[
    {label:"Net worth",value:formatCurrency(balance)},
    {label:"Available",value:formatCurrency(current)},
    {label:"Savings",value:formatCurrency(savings)},
    {label:"Connected accounts",value:String(accounts.length)},
  ].map(metric=><div key={metric.label} className="surface p-4 sm:p-5">
    <p className="text-[11px] font-semibold uppercase tracking-[.09em] text-muted-foreground">{metric.label}</p>
    <p className="money-tabular mt-3 truncate text-[clamp(19px,2.3vw,29px)] font-semibold tracking-[-.04em]">{metric.value}</p>
  </div>)}
  <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-4">
   <button type="button" onClick={onConnect} disabled={connecting}
     className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-medium transition-colors hover:border-primary/40">
     {connecting?<Loader2 className="h-4 w-4 animate-spin"/>:<Building2 className="h-4 w-4"/>} Connect bank
   </button>
   <button type="button" onClick={onSync} disabled={syncing||connections===0}
     className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-medium transition-colors hover:border-primary/40">
     {syncing?<Loader2 className="h-4 w-4 animate-spin"/>:<RefreshCcw className="h-4 w-4"/>} Sync balances
   </button>
   <span className="ml-auto text-[11px] text-muted-foreground">{connections} bank connections · {Number(totalTx||0).toLocaleString("en-GB")} synced transactions</span>
  </div>
 </section>;
}

export default function AccountsPage() {
  const { openAction } = useActions();
  useEffect(() => {
    document.title = "Accounts & Import | Penni";
  }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [accountTransactions, setAccountTransactions] = useState([]);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionQuery, setTransactionQuery] = useState("");
  const [transactionType, setTransactionType] = useState("all");
  const [status, setStatus] = useState("idle");
  const [conns, setConns] = useState([]);
  const [totalTx, setTotalTx] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [importFromDate, setImportFromDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 90);
    return date.toISOString().slice(0, 10);
  });

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/accounts");
      setAccounts(data.accounts || []);
    } catch (error) {
      toast.error(formatApiError(error) || "Could not load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConns = useCallback(async () => {
    try {
      const { data } = await api.get("/truelayer/connections");
      setConns(Array.isArray(data.connections) ? data.connections : []);
      setTotalTx(Number(data.total_transactions || 0));
    } catch (error) {
      if (error.response?.status === 500 && error.response?.data?.detail?.includes("configured")) {
        setNeedsSetup(true);
      }
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadConns();
  }, [loadAccounts, loadConns]);
  useEffect(() => {
    const refresh = () => { loadAccounts(); loadConns(); };
    window.addEventListener("penni:data-changed", refresh);
    return () => window.removeEventListener("penni:data-changed", refresh);
  }, [loadAccounts, loadConns]);

  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/truelayer/sync");
      toast.success(`Synced: ${data.new_transactions} new, ${data.duplicates_skipped} duplicates`);
      await loadConns();
      await loadAccounts();
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail) || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [loadConns, loadAccounts]);

  useEffect(() => {
    const result = searchParams.get("status");
    const reason = searchParams.get("reason");
    const accountCount = parseInt(searchParams.get("accounts") || "0", 10);
    if (result === "success") {
      toast.success(`Bank connected - ${accountCount || ""} account(s) linked`);
      if (accountCount > 0) {
        setSyncing(true);
        doSync().finally(() => setSyncing(false));
      }
      const next = new URLSearchParams(searchParams);
      next.delete("status");
      next.delete("accounts");
      next.delete("reason");
      setSearchParams(next, { replace: true });
    } else if (result === "failed") {
      if (reason === "no_accounts") toast.error("No bank accounts were selected");
      else if (reason === "invalid_state") toast.error("Your connect session expired. Please try again.");
      else if (reason === "token_exchange") toast.error("Bank authentication failed. Please reconnect.");
      else toast.error(reason || "Connection failed");
      const next = new URLSearchParams(searchParams);
      next.delete("status");
      next.delete("accounts");
      next.delete("reason");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const connect = async () => {
    setStatus("connecting");
    try {
      const { data } = await api.get("/truelayer/auth-url", {
        params: importFromDate ? { from_date: importFromDate } : {},
      });
      setStatus("redirecting");
      setTimeout(() => {
        window.location.href = data.auth_url;
      }, 600);
    } catch (error) {
      setStatus("failed");
      const message = formatApiError(error.response?.data?.detail);
      if (message?.includes("not configured") || message?.includes("administrator")) {
        setNeedsSetup(true);
        toast.error("Banking is not configured yet. An admin needs to set up TrueLayer.");
      } else {
        toast.error(message || "Could not connect");
      }
    }
  };

  const isTokenExpired = (connection) => connection.expires_at && new Date(connection.expires_at) < new Date();
  const needsReconnectConn = (connection) => connection.status === "reconnect_required" || isTokenExpired(connection);
  const needsReconnect = conns.some(needsReconnectConn);
  const connByAccountId = Object.fromEntries(conns.map((connection) => [connection.account_id, connection]));
  const connecting = status === "connecting" || status === "redirecting";
  const selectedAccount = accounts.find(a => String(a.account_id) === String(selectedAccountId)) || accounts[0] || null;
  const selectedId = selectedAccount?.account_id;
  useEffect(() => {
    if(!selectedId) {setAccountTransactions([]);return;}
    let active = true;
    setTransactionLoading(true);
    api.get("/transactions", {params:{account_id:selectedId,limit:200,sort:"date",order:"desc"}})
      .then(({data})=>{if(active)setAccountTransactions(data.transactions||[]);})
      .catch(()=>{if(active)setAccountTransactions([]);})
      .finally(()=>{if(active)setTransactionLoading(false);});
    return ()=>{active=false;};
  },[selectedId]);
  const filteredTransactions = useMemo(()=>accountTransactions.filter(t=>{
    const text=(t.description||t.merchant||t.category||"").toLowerCase();
    const matches=text.includes(transactionQuery.toLowerCase());
    return matches && (transactionType==="all"||(transactionType==="in"?Number(t.amount)>0:Number(t.amount)<0));
  }),[accountTransactions,transactionQuery,transactionType]);
  const selectedHistory = useMemo(()=>buildDailyBalanceTrend(
    accountTransactions, Number(selectedAccount?.balance||0), 90, new Date(), selectedId?[selectedId]:[]
  ).map(row=>row.balance),[accountTransactions,selectedAccount?.balance,selectedId]);
  const monthKey = new Date().toISOString().slice(0,7);
  const thisMonthTransactions = accountTransactions.filter(t=>String(t.date||"").slice(0,7)===monthKey);
  const monthIn = thisMonthTransactions.reduce((n,t)=>n+(Number(t.amount)>0?Number(t.amount):0),0);
  const monthOut = thisMonthTransactions.reduce((n,t)=>n+(Number(t.amount)<0?Math.abs(Number(t.amount)):0),0);

  return (
    <div className="accounts-workspace page-stack pb-4">
      <PageHeader
        eyebrow="Accounts & Import"
        title="Accounts"
        description="All your bank accounts, savings and manual balances, kept in one place."
        actions={
          <>
            <Button variant="outlinePill" size="pill" onClick={doSync} disabled={syncing || conns.length === 0}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Sync now
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="primary" size="pill">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New account
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl p-1.5">
                <DropdownMenuItem onClick={connect} disabled={connecting} className="cursor-pointer gap-2 py-2.5">
                  <Building2 className="h-4 w-4 text-emerald" />
                  Connect bank
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowCreateModal(true)} className="cursor-pointer gap-2 py-2.5">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  Offline account
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="accounts-panels subtle-scroll" aria-label="Accounts overview and account lists">
      <BalanceHero
        accounts={accounts}
        loading={loading && accounts.length === 0}
        connections={conns.length}
        totalTx={totalTx}
        onConnect={connect}
        connecting={connecting}
        onSync={doSync}
        syncing={syncing}
      />

      {(needsSetup || needsReconnect) ? (
        <div className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[11px] ${needsReconnect ? "border-ruby/30 bg-ruby/[0.05] text-ruby" : "border-topaz/30 bg-topaz/[0.05] text-topaz"}`}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {needsReconnect
            ? "Some bank connections need reconnecting. Open the affected account or connections page."
            : "Banking is not configured yet. Ask an admin to set up TrueLayer in Settings."}
        </div>
      ) : null}

      {loading && accounts.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="surface p-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="mt-3 h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-24" />
              <Skeleton className="mt-5 h-6 w-28" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && accounts.length === 0 ? (
        <Surface>
          <EmptyPanel
            icon={Landmark}
            title="No accounts yet"
            description="Create your first account or connect a UK bank to start tracking your money."
            action={
              <div className="flex items-center gap-2">
                <Button onClick={() => setShowCreateModal(true)} variant="outlinePill" size="pill">
                  <Plus className="mr-1.5 h-4 w-4" /> Offline account
                </Button>
                <Button variant="primary" size="pill" onClick={connect} disabled={connecting}>
                  {connecting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Building2 className="mr-1.5 h-4 w-4" />}
                  Connect bank
                </Button>
              </div>
            }
          />
        </Surface>
      ) : null}

      {accounts.length > 0 && (
        <>
          <section className="penni-reference-account-select" aria-label="Select an account">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold tracking-[-.035em]">Your accounts</h2>
              <button type="button" onClick={()=>{setEditAccount(null);setShowCreateModal(true);}}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
                <Plus className="h-4 w-4"/> Add account
              </button>
            </div>
            <div className="penni-account-selector flex min-w-0 gap-4 overflow-x-auto pb-3">
              {accounts.map(account=>(
                <div key={account.account_id}
                  className={`penni-selected-account w-[290px] min-w-[290px] shrink-0 rounded-[27px] p-[2px] ${String(selectedId)===String(account.account_id)?"is-selected":""}`}>
                  <AccountCard account={account} connection={connByAccountId[account.account_id]}
                    onSelect={selected=>{setSelectedAccountId(selected.account_id);setTransactionQuery("");setTransactionType("all");}}/>
                </div>
              ))}
            </div>
          </section>
          {selectedAccount && <div className="penni-account-workspace grid min-h-0 gap-5 lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.15fr)]">
            <section className="min-w-0 space-y-5">
              <div className="surface min-w-0 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{getDisplayName(selectedAccount)} · {ACCOUNT_TYPE_META[selectedAccount.type]?.label||"Account"}</p>
                    <h2 className="mt-1 truncate text-[19px] font-semibold tracking-[-.03em]">{selectedAccount.name||selectedAccount.account_name}</h2>
                  </div>
                  <button type="button" onClick={()=>{setEditAccount(selectedAccount);setShowCreateModal(true);}}
                    className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 text-xs font-semibold hover:bg-secondary">
                    Edit
                  </button>
                </div>
                <p className="money-tabular mt-5 text-[clamp(32px,3vw,40px)] font-semibold tracking-[-.05em]">{formatCurrency(selectedAccount.balance)}</p>
                <div className="mt-5">
                  {transactionLoading?<Skeleton className="h-36 w-full rounded-xl"/>:<Sparkline values={selectedHistory} height={155} stroke="var(--penni-accent)" />}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Estimated 90-day balance movement based on recorded transactions.</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-secondary/60 p-4">
                    <p className="text-xs text-muted-foreground">In this month</p>
                    <p className="money-tabular mt-2 text-[19px] font-semibold text-emerald">{formatCurrency(monthIn)}</p>
                  </div>
                  <div className="rounded-2xl bg-secondary/60 p-4">
                    <p className="text-xs text-muted-foreground">Out this month</p>
                    <p className="money-tabular mt-2 text-[19px] font-semibold">{formatCurrency(monthOut)}</p>
                  </div>
                </div>
              </div>
              <div className="surface p-5">
                <h3 className="text-[16px] font-semibold">Details</h3>
                <p className="mt-2 text-xs text-muted-foreground">Account type: {ACCOUNT_TYPE_META[selectedAccount.type]?.label||"Account"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Currency: {selectedAccount.currency||"GBP"}</p>
                <Link to={`/accounts/${selectedId}`} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  Full account dashboard <ArrowRight className="h-4 w-4"/>
                </Link>
              </div>
            </section>
            <section className="surface penni-account-history flex min-w-0 flex-col overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
                <div>
                  <h2 className="text-[17px] font-semibold tracking-[-.03em]">Transaction history</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{accountTransactions.length} recent transactions</p>
                </div>
                <button type="button" onClick={()=>openAction("transaction-new",{accountId:selectedId})}
                  className="inline-flex h-9 items-center gap-1 rounded-xl bg-primary/10 px-3 text-xs font-semibold text-primary">
                  <Plus className="h-4 w-4"/> Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2 px-5 pb-3">
                <input aria-label="Search this account" placeholder="Search this account..."
                  value={transactionQuery} onChange={e=>setTransactionQuery(e.target.value)}
                  className="h-10 min-w-[180px] flex-1 rounded-xl border border-border bg-secondary/50 px-3 text-xs"/>
                <div className="inline-flex items-center rounded-xl border border-border bg-secondary/40 p-1" role="group" aria-label="Transaction direction">
                  {[{v:"all",t:"All"},{v:"in",t:"In"},{v:"out",t:"Out"}].map(x=>
                    <button type="button" key={x.v} aria-pressed={transactionType===x.v}
                      onClick={()=>setTransactionType(x.v)}
                      className={`h-8 rounded-lg px-3 text-xs ${transactionType===x.v?"bg-card font-semibold shadow-sm":"text-muted-foreground"}`}>{x.t}</button>)}
                </div>
              </div>
              <div className="penni-account-history-list min-h-0 flex-1 overflow-y-auto border-t border-border/60">
                {transactionLoading?<p className="p-5 text-xs text-muted-foreground">Loading transactions…</p>:
                filteredTransactions.length ? filteredTransactions.map((t,i)=>
                  <button type="button" key={t.transaction_id||i}
                    onClick={()=>openAction("transaction-info",{transaction:t})}
                    className="flex w-full items-center gap-3 border-b border-border/50 px-5 py-3 text-left transition-colors hover:bg-secondary/40">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-secondary text-muted-foreground">
                      <ArrowRight className={`h-4 w-4 ${Number(t.amount)<0?"rotate-45":"-rotate-45"}`}/>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{t.description||t.merchant||"Transaction"}</span>
                      <span className="mt-1 block truncate text-[11px] text-muted-foreground">{humanizeCategoryName(t.category)} · {String(t.date||"").slice(0,10)}</span>
                    </span>
                    <span className={`money-tabular shrink-0 text-[13px] font-semibold ${Number(t.amount)>0?"text-emerald":""}`}>{formatCurrency(t.amount,{signed:true})}</span>
                  </button>
                ):<p className="p-6 text-center text-xs text-muted-foreground">No matching transactions.</p>}
              </div>
            </section>
          </div>}
        </>
      ) : null}

      </div>

      <AccountFormModal
        key={editAccount?.account_id || "new"}
        editAccount={editAccount}
        open={showCreateModal}
        onClose={() => {setShowCreateModal(false);setEditAccount(null);}}
        onCreated={() => {
          loadAccounts();
          setShowCreateModal(false);
          setEditAccount(null);
        }}
      />
    </div>
  );
}

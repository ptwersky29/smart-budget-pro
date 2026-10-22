import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { getBankLogoOrFallback, pickBankInstitution } from "../data/bankLogos";
import { formatCurrency } from "../lib/format";
import Skeleton from "../components/ui/Skeleton";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { EmptyPanel, PageHeader, Surface, SurfaceHeader } from "../components/ui/page";
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

function AccountCard({ account, connection }) {
  const meta = ACCOUNT_TYPE_META[account.type] || ACCOUNT_TYPE_META.current;
  const Icon = meta.icon;
  const isSavings = account.type === "savings";
  const displayName = getDisplayName(account);
  const isTokenExpired = connection?.expires_at && new Date(connection.expires_at) < new Date();
  const needsReconnect = connection && (connection.status === "reconnect_required" || isTokenExpired);

  return (
    <Link
      to={`/accounts/${account.account_id}`}
      className="surface surface-hover group relative flex flex-col overflow-hidden p-4"
    >
      <span className="absolute inset-y-4 left-0 w-[3px] rounded-r-full" style={{ background: account.color || "#2f9e73" }} />
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

      <div className="mt-4 flex items-end justify-between gap-2">
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
  const totalBalance = accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  const savingsBalance = accounts.filter((account) => account.type === "savings").reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  const currentBalance = totalBalance - savingsBalance;

  if (loading) {
    return (
      <div className="rounded-[1.25rem] bg-[#123c30] p-6 text-white sm:p-7">
        <Skeleton className="h-3 w-28 bg-white/10" />
        <Skeleton className="mt-4 h-10 w-56 bg-white/10" />
        <Skeleton className="mt-4 h-4 w-72 max-w-full bg-white/10" />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[1.25rem] bg-[#123c30] p-5 text-white shadow-[0_28px_60px_-36px_rgba(10,42,32,0.95)] sm:p-7">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-[#f3c970]/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">Total balance</p>
          <p className="money-tabular mt-2 text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.055em]">
            {formatCurrency(totalBalance)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/60">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#7fd6b2]" />
              Available <strong className="font-medium text-white/90">{formatCurrency(currentBalance)}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c7b6f5]" />
              Savings <strong className="font-medium text-white/90">{formatCurrency(savingsBalance)}</strong>
            </span>
            <span>{accounts.length} {accounts.length === 1 ? "account" : "accounts"}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConnect}
            disabled={connecting}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[11px] font-semibold text-[#123c30] transition hover:bg-white/90 disabled:opacity-60"
          >
            {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
            Connect bank
          </button>
          <button
            type="button"
            onClick={onSync}
            disabled={syncing || connections === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-4 text-[11px] font-medium text-white/85 transition hover:bg-white/[0.12] disabled:opacity-40"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Sync now
          </button>
        </div>
      </div>

      <div className="relative mt-6 grid grid-cols-2 gap-2.5 border-t border-white/10 pt-4 sm:max-w-sm">
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/40">Connections</p>
          <p className="mt-0.5 text-lg font-semibold">{connections}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/40">Synced transactions</p>
          <p className="mt-0.5 text-lg font-semibold">{Number(totalTx || 0).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  useEffect(() => {
    document.title = "Accounts & Import | Penni";
  }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const currentAccounts = accounts.filter((account) => account.type !== "savings");
  const savingsAccounts = accounts.filter((account) => account.type === "savings");
  const connecting = status === "connecting" || status === "redirecting";

  return (
    <div className="page-stack pb-4">
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

      {currentAccounts.length > 0 ? (
        <Surface className="overflow-hidden">
          <SurfaceHeader
            icon={Wallet}
            title="Current accounts"
            subtitle={`${currentAccounts.length} ${currentAccounts.length === 1 ? "account" : "accounts"}`}
            actions={
              <Link to="/connections" className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald">
                Connections <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
            compact
          />
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border/50 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            {currentAccounts.map((account) => (
              <AccountCard key={account.account_id} account={account} connection={connByAccountId[account.account_id]} />
            ))}
            <Link
              to="/connections"
              className="flex min-h-[124px] flex-col items-center justify-center gap-1.5 rounded-[1rem] border border-dashed border-border/80 p-4 text-muted-foreground transition hover:border-emerald/30 hover:bg-emerald/[0.03] hover:text-emerald"
            >
              <ArrowRight className="h-4 w-4" />
              <span className="text-[11px] font-medium">Connect another bank</span>
            </Link>
          </div>
        </Surface>
      ) : null}

      {savingsAccounts.length > 0 ? (
        <Surface className="overflow-hidden">
          <SurfaceHeader
            icon={PiggyBank}
            title="Savings"
            subtitle={`${formatCurrency(savingsAccounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0))} set aside`}
            compact
          />
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border/50 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            {savingsAccounts.map((account) => (
              <AccountCard key={account.account_id} account={account} connection={connByAccountId[account.account_id]} />
            ))}
          </div>
        </Surface>
      ) : null}

      <AccountFormModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          loadAccounts();
          setShowCreateModal(false);
        }}
      />
    </div>
  );
}

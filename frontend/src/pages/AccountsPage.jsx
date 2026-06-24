import React, { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Link } from "react-router-dom";
import { Plus, Wallet, Landmark, PiggyBank, CreditCard, Banknote, ArrowRight, RefreshCw, Lock, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "../components/ui/layout";
import Skeleton from "../components/ui/Skeleton";
import { Button } from "../components/ui/button";
import AccountFormModal from "../components/AccountFormModal";

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
      <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-card via-card/95 to-card/90 backdrop-blur-xl shadow-card p-6 sm:p-8">
        <Skeleton className="h-10 w-48 mb-4" />
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-card via-card/95 to-card/90 backdrop-blur-xl shadow-card">
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
  useEffect(() => { document.title = "Accounts | FinanceAI"; }, []);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const load = useCallback(async () => {
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

  useEffect(() => { load(); }, [load]);

  const currentAccounts = accounts.filter((a) => a.type !== "savings");
  const savingsAccounts = accounts.filter((a) => a.type === "savings");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accounts"
        title="Your accounts."
        description="All your bank accounts, wallets, and savings in one place."
        actions={
          <Button onClick={() => setShowCreateModal(true)} variant="primary" size="pill">
            <Plus className="h-4 w-4 mr-1.5" /> New Account
          </Button>
        }
      />

      <TotalBalanceSection accounts={accounts} loading={loading} />

      {!loading && accounts.length === 0 && (
        <EmptyState
          icon={Landmark}
          title="No accounts yet"
          description="Create your first account to start tracking your money. You can add current accounts, savings, cash wallets, and more."
          action={
            <Button onClick={() => setShowCreateModal(true)} variant="primary" size="pill">
              <Plus className="h-4 w-4 mr-1.5" /> Create Account
            </Button>
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

      <AccountFormModal open={showCreateModal} onClose={() => setShowCreateModal(false)} onCreated={() => { load(); setShowCreateModal(false); }} />
    </div>
  );
}

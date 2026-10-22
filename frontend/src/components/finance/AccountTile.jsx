import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import {
  getBankLogoOrFallback,
  getBankColor,
  pickBankInstitution,
  toAccountTypeLabel,
} from "../../data/bankLogos";
import { formatCurrency } from "../../lib/format";
import { getDisplayName } from "../../lib/utils";

export default function AccountTile({ account, compact = false, className = "" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const institution = pickBankInstitution(
    account?.institution,
    account?.provider,
    account?.account_name,
    account?.name,
    account?.nickname,
  );
  const logo = imageFailed ? null : getBankLogoOrFallback(institution);
  const color = account?.color || getBankColor(institution);
  const name = getDisplayName({
    name: account?.name || account?.account_name || account?.nickname,
    provider: account?.provider,
  });
  const balance = Number(account?.balance ?? account?.balance_currency?.balance ?? account?.current_balance ?? 0);
  const currency = account?.currency || account?.balance_currency || "GBP";
  const type = toAccountTypeLabel(account?.type || account?.account_type);
  const to = account?.account_id ? `/accounts/${account.account_id}` : "/accounts";

  if (compact) {
    return (
      <Link
        to={to}
        className={`group flex min-w-0 items-center gap-3 rounded-2xl border border-transparent px-2 py-2 transition hover:border-border/70 hover:bg-secondary/40 ${className}`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-black/[0.04] dark:bg-white/10">
          {logo ? (
            <img
              src={logo}
              alt=""
              className="h-6 w-6 object-contain"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <Building2 className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{type}</span>
        </span>
        <span className="money-tabular shrink-0 text-[13px] font-semibold">
          {formatCurrency(balance)}
        </span>
      </Link>
    );
  }

  return (
    <Link
      to={to}
      className={`surface surface-hover group relative flex min-w-0 flex-col justify-between overflow-hidden p-4 ${className}`}
    >
      <span className="absolute inset-y-4 left-0 w-[3px] rounded-r-full" style={{ background: color }} />
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-black/[0.04] dark:bg-white/10">
          {logo ? (
            <img
              src={logo}
              alt={institution || name}
              className="h-7 w-7 object-contain"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <Building2 className="h-5 w-5 text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight">{name}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{type}</p>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <p className="money-tabular text-lg font-semibold leading-none">{formatCurrency(balance)}</p>
        <span className="text-[10px] text-muted-foreground">{currency}</span>
      </div>
    </Link>
  );
}

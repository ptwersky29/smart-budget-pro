import React from "react";
import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import { CURRENCY_SYMBOL } from "../data/constants";
import {
  getBankLogoOrFallback,
  getBankColor,
  pickBankInstitution,
  toAccountTypeLabel,
} from "../data/bankLogos";

function BankAccountCard({ account, connection, variant = "default" }) {
  const c = connection || account;
  const institution =
    c.config?.institution || c.account_name || c.nickname || c.provider;
  const brandInstitution = pickBankInstitution(
    c.config?.institution,
    c.nickname,
    c.account_name,
    c.provider,
  );
  const logoUrl = getBankLogoOrFallback(brandInstitution);
  const bankColor = getBankColor(brandInstitution);
  const name = c.nickname || c.account_name || "Bank Account";
  const balance = c.balance ?? 0;
  const ccy = c.balance_currency || "GBP";
  const connId = c.connection_id;
  const type = c.account_type;

  const balanceFmt = Number(balance).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (variant === "mini") {
    return (
      <Link
        to={`/accounts/${connId}`}
        className="inline-flex items-center gap-2 rounded-xl bg-card/80 border border-border/40 px-3 py-2 hover:ring-2 hover:ring-emerald/30 hover:border-emerald/40 transition-all duration-200 cursor-pointer group"
        style={{ borderLeftColor: bankColor, borderLeftWidth: "3px" }}
      >
        <div className="relative shrink-0 h-8 w-8 rounded-lg bg-white dark:bg-secondary/40 border border-border/30 flex items-center justify-center overflow-hidden">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={brandInstitution || institution}
              className="h-6 w-6 object-contain group-hover:scale-110 transition-transform duration-200"
              loading="lazy"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${bankColor}"/><text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="18" fill="white">${(name || "?")[0].toUpperCase()}</text></svg>`)}`;
              }}
            />
          ) : (
            <Building2 className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="text-xs font-medium leading-tight group-hover:text-emerald transition-colors">
            {name}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {CURRENCY_SYMBOL}{balanceFmt}
          </p>
        </div>
      </Link>
    );
  }

  if (variant === "full") {
    return (
      <Link
        to={`/accounts/${connId}`}
        className="block rounded-xl border border-border/50 bg-card/90 hover:bg-card hover:shadow-md hover:border-border/80 transition-all duration-200 cursor-pointer group overflow-hidden"
      >
        <div className="h-1" style={{ background: bankColor }} />
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="relative shrink-0 h-11 w-11 rounded-xl bg-white dark:bg-secondary/40 border border-border/30 flex items-center justify-center overflow-hidden shadow-sm">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={brandInstitution || institution}
                  className="h-8 w-8 object-contain group-hover:scale-110 transition-transform duration-200"
                  loading="lazy"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.style.display = "none";
                    e.target.nextSibling.style.display = "flex";
                  }}
                />
              ) : null}
              {!logoUrl && (
                <Building2 className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm truncate group-hover:text-emerald transition-colors">
                  {name}
                </p>
                {type && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-secondary/80 text-muted-foreground font-medium leading-none">
                    {toAccountTypeLabel(type)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {institution || type || ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-base font-semibold tracking-tight">
                {CURRENCY_SYMBOL}{balanceFmt}
              </p>
              <p className="text-[10px] text-muted-foreground">{ccy}</p>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/accounts/${connId}`}
      className="inline-flex items-center gap-3 rounded-xl bg-card/80 border border-border/40 px-3.5 py-2.5 hover:ring-2 hover:ring-emerald/30 hover:border-emerald/40 transition-all duration-200 cursor-pointer group"
      style={{ borderLeftColor: bankColor, borderLeftWidth: "3px" }}
    >
      <div className="relative shrink-0 h-9 w-9 rounded-lg bg-white dark:bg-secondary/40 border border-border/30 flex items-center justify-center overflow-hidden">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={brandInstitution || institution}
            className="h-7 w-7 object-contain group-hover:scale-110 transition-transform duration-200"
            loading="lazy"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${bankColor}"/><text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="18" fill="white">${(name || "?")[0].toUpperCase()}</text></svg>`)}`;
            }}
          />
        ) : (
          <Building2 className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div>
        <p className="text-sm font-medium leading-tight group-hover:text-emerald transition-colors">
          {name}
        </p>
        <p className="text-[11px] text-muted-foreground leading-tight">
          {CURRENCY_SYMBOL}{balanceFmt}
        </p>
      </div>
    </Link>
  );
}

export default React.memo(BankAccountCard);

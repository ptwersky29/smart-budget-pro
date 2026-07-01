import React from "react";
import { Link } from "react-router-dom";
import { Building2, Wallet, CheckCircle2, AlertCircle } from "lucide-react";
import {
  getBankLogoOrFallback,
  getBankColor,
  pickBankInstitution,
  toAccountTypeLabel,
} from "../data/bankLogos";

const STATUS_CONFIG = {
  active: { icon: CheckCircle2, label: "Active", text: "text-emerald" },
  reconnect_required: {
    icon: AlertCircle,
    label: "Reconnect",
    text: "text-ruby",
  },
};

function BankCardMockup({ connection, size = "sm", showStatus = false }) {
  const c = connection || {};
  const isManual = c.provider === "manual";
  const customImage = c.config?.image;
  const customColor = c.config?.color;
  const institution =
    c.config?.institution || c.account_name || c.nickname || c.provider;
  const brandInstitution = pickBankInstitution(
    c.config?.institution,
    c.nickname,
    c.account_name,
    c.provider,
  );
  const logoUrl = customImage || getBankLogoOrFallback(brandInstitution);
  const bankColor = customColor || getBankColor(brandInstitution);
  const name = c.nickname || c.account_name || "Bank Account";
  const balance = c.balance ?? 0;
  const ccy = c.balance_currency || "GBP";
  const accountId = c.account_id;
  const connectionId = c.connection_id;
  const linkTo = accountId ? `/accounts/${accountId}` : `/accounts/legacy/${connectionId}`;
  const type = c.account_type;

  const statusInfo = STATUS_CONFIG[c.status] || STATUS_CONFIG.active;
  const StatusIcon = statusInfo.icon;
  const balanceFmt = Number(balance).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const sizes =
    {
      xs: {
        h: "h-14",
        logoBox: "h-8 w-8",
        logoImg: "h-6 w-6",
        nameSize: "text-xs",
        metaSize: "text-[10px]",
        balanceSize: "text-sm",
        iconSize: "h-2.5 w-2.5",
        gap: "gap-2.5",
        badgeSize: "text-[9px]",
      },
      sm: {
        h: "h-16",
        logoBox: "h-10 w-10",
        logoImg: "h-7 w-7",
        nameSize: "text-sm",
        metaSize: "text-[11px]",
        balanceSize: "text-base",
        iconSize: "h-3 w-3",
        gap: "gap-3",
        badgeSize: "text-[10px]",
      },
      md: {
        h: "h-20",
        logoBox: "h-12 w-12",
        logoImg: "h-9 w-9",
        nameSize: "text-sm sm:text-base",
        metaSize: "text-xs",
        balanceSize: "text-lg sm:text-xl",
        iconSize: "h-3 w-3",
        gap: "gap-3 sm:gap-4",
        badgeSize: "text-[10px]",
      },
    }[size] || sizes.sm;

  return (
    <Link
      to={linkTo}
      className={`flex items-center ${sizes.gap} rounded-xl bg-card/90 border border-border/40 px-3 sm:px-4 transition-all duration-200 hover:ring-2 hover:ring-emerald/30 hover:border-emerald/40 cursor-pointer group ${sizes.h}`}
      style={{ borderLeft: `3px solid ${bankColor}` }}
    >
      {/* Logo */}
      <div
        className={`shrink-0 rounded-lg bg-white dark:bg-secondary/40 border border-border/30 flex items-center justify-center overflow-hidden ${sizes.logoBox}`}
      >
        <img
          src={logoUrl || ""}
          alt={brandInstitution || institution}
          className={`object-contain ${sizes.logoImg} group-hover:scale-110 transition-transform duration-200`}
          loading="lazy"
          style={{ display: logoUrl ? "block" : "none" }}
          onError={(e) => {
            e.target.onerror = null;
            e.target.style.display = "none";
          }}
        />
        {isManual ? (
          <Wallet className="h-6 w-6 text-muted-foreground"
            style={{ display: logoUrl ? "none" : "block" }} />
        ) : (
          <Building2 className="h-6 w-6 text-muted-foreground"
            style={{ display: logoUrl ? "none" : "block" }} />
        )}
      </div>

      {/* Name + type */}
      <div className="flex-1 min-w-0">
        <p
          className={`font-medium truncate group-hover:text-emerald transition-colors ${sizes.nameSize}`}
        >
          {name}
        </p>
        <p
          className={`text-muted-foreground truncate flex items-center gap-1.5 ${sizes.metaSize}`}
        >
          {type && (
            <span className="px-1.5 py-0.5 rounded-md bg-secondary/70 font-medium">
              {toAccountTypeLabel(type)}
            </span>
          )}
          {institution && institution !== name && (
            <span className="truncate">{institution}</span>
          )}
        </p>
      </div>

      {/* Balance + status */}
      <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
        {showStatus && (
          <span
            className={`inline-flex items-center gap-0.5 ${sizes.badgeSize} ${statusInfo.text} font-medium`}
          >
            <StatusIcon className={sizes.iconSize} />
            {statusInfo.label}
          </span>
        )}
        <p className={`font-semibold tracking-tight ${sizes.balanceSize}`}>
          £{balanceFmt}
        </p>
        <p className={`text-muted-foreground ${sizes.metaSize}`}>{ccy}</p>
      </div>
    </Link>
  );
}

export default React.memo(BankCardMockup);

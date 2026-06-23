import React from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, AlertCircle } from "lucide-react";
import { getBankLogoOrFallback, getBankColor, toAccountTypeLabel } from "../data/bankLogos";

function darken(hex, amt) {
  if (!hex || hex === "#6b7280") return hex;
  let c = hex.replace("#", "");
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  let num = parseInt(c, 16);
  let r = Math.max((num >> 16) - amt, 0);
  let g = Math.max(((num >> 8) & 0xff) - amt, 0);
  let b = Math.max((num & 0xff) - amt, 0);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const STATUS_CONFIG = {
  active: { icon: CheckCircle2, label: "Active", text: "text-white/80" },
  reconnect_required: { icon: AlertCircle, label: "Reconnect", text: "text-topaz" },
};

function BankCardMockup({ connection, size = "sm", showStatus = false, actions }) {
  const c = connection;
  const institution = c.config?.institution || c.account_name || c.nickname || c.provider;
  const logoUrl = getBankLogoOrFallback(institution);
  const bankColor = getBankColor(institution);
  const name = c.nickname || c.account_name || "Bank Account";
  const balance = c.balance ?? 0;
  const ccy = c.balance_currency || "GBP";
  const connId = c.connection_id;
  const type = c.account_type;

  const darkColor = darken(bankColor, 40);
  const statusInfo = STATUS_CONFIG[c.status] || STATUS_CONFIG.active;
  const StatusIcon = statusInfo.icon;

  const balanceFmt = Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const sizeClasses = {
    xs: { card: "aspect-[1.586/1] p-2", logoBox: "h-6 w-6", logoImg: "h-4 w-4", nameSize: "text-[9px] leading-tight", balanceSize: "text-xs sm:text-sm", badgeSize: "text-[7px]", ccySize: "text-[8px]" },
    sm: { card: "aspect-[1.586/1] p-2.5 sm:p-3", logoBox: "h-7 w-7 sm:h-8 sm:w-8", logoImg: "h-5 w-5 sm:h-6 sm:w-6", nameSize: "text-[10px] sm:text-xs", balanceSize: "text-sm sm:text-base", badgeSize: "text-[8px] sm:text-[9px]", ccySize: "text-[8px] sm:text-[9px]" },
    md: { card: "aspect-[1.586/1] p-3 sm:p-4", logoBox: "h-8 w-8 sm:h-9 sm:w-9 lg:h-10 lg:w-10", logoImg: "h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8", nameSize: "text-xs sm:text-sm lg:text-base", balanceSize: "text-base sm:text-lg lg:text-xl", badgeSize: "text-[9px] sm:text-[10px]", ccySize: "text-[9px] sm:text-[10px]" },
  }[size] || sizeClasses.sm;

  const content = (
    <div
      className={`relative overflow-hidden rounded-2xl sm:rounded-[1.5rem] shadow-lg transition-all duration-300 cursor-pointer group ${sizeClasses.card}`}
      style={{
        background: `linear-gradient(135deg, ${bankColor} 0%, ${darkColor} 100%)`,
        boxShadow: `0 8px 32px ${bankColor}30, 0 2px 8px ${bankColor}20`,
      }}
    >
      {/* Glass overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-50 pointer-events-none" />

      {/* Light grain texture */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: `radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)`, backgroundSize: "3px 3px" }} />

      {/* Hover glow ring */}
      <div className="absolute inset-0 rounded-2xl sm:rounded-[1.5rem] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ring-2 ring-white/30 ring-inset" />

      {/* Status badge — top right */}
      {showStatus && (
        <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 z-10">
          <span className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-black/20 backdrop-blur-sm text-[9px] sm:text-[10px] ${statusInfo.text} font-medium`}>
            <StatusIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            {statusInfo.label}
          </span>
        </div>
      )}

      {/* Balance — bottom area */}
      <div className="absolute bottom-1.5 sm:bottom-2 left-1.5 sm:left-2 right-1.5 sm:right-2 z-10">
        <p className={`font-semibold tracking-tight text-white ${sizeClasses.balanceSize} leading-none drop-shadow-sm`}>
          £{balanceFmt}
        </p>
        <p className={`text-white/60 font-medium mt-0.5 ${sizeClasses.ccySize}`}>{ccy}</p>
      </div>

      {/* Logo + name — top area */}
      <div className="relative z-10 flex items-start gap-2 sm:gap-3">
        <div className={`shrink-0 rounded-lg sm:rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden ${sizeClasses.logoBox}`}>
          {logoUrl ? (
            <img src={logoUrl} alt={institution} className={`object-contain ${sizeClasses.logoImg}`} loading="lazy" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }} />
          ) : (
            <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-white/70" />
          )}
        </div>
        <div className="min-w-0 pt-0.5">
          <p className={`font-semibold text-white truncate ${sizeClasses.nameSize} leading-tight drop-shadow-sm`}>{name}</p>
          {type && (
            <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded-md bg-white/15 backdrop-blur-sm text-white/80 font-medium ${sizeClasses.badgeSize} leading-none`}>
              {toAccountTypeLabel(type)}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (actions) {
    return (
      <div className="space-y-2">
        <Link to={`/accounts/${connId}`}>
          {content}
        </Link>
        {typeof actions === "function" ? actions() : actions}
      </div>
    );
  }

  return (
    <Link to={`/accounts/${connId}`}>
      {content}
    </Link>
  );
}

export default React.memo(BankCardMockup);

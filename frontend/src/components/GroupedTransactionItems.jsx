import React from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CalendarDays, Wallet, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import CategoryBadge from "./CategoryBadge";
import { getBankLogoOrFallback, pickBankInstitution } from "../data/bankLogos";
import { formatCurrency } from "../lib/format";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu";

// The same transaction presentation is used on Overview, Accounts and account details.
export function getTransactionType(transaction) {
  const category = String(transaction?.category || "").trim().toLowerCase().replace(/[_-]/g, " ");
  if (transaction?.is_transfer || transaction?.transfer_pair_id || transaction?.type === "transfer" || category === "transfer" || category === "internal transfer") return "transfer";
  return Number(transaction?.amount || 0) >= 0 ? "income" : "expense";
}

const tones = {
  income: { label: "Income", icon: ArrowDownLeft, mark: "bg-emerald/10 text-emerald", chip: "bg-emerald/10 text-emerald", amount: "text-emerald" },
  expense: { label: "Expense", icon: ArrowUpRight, mark: "bg-ruby/10 text-ruby", chip: "bg-ruby/10 text-ruby", amount: "text-ruby" },
  transfer: { label: "Transfer", icon: ArrowLeftRight, mark: "bg-sky/10 text-sky", chip: "bg-sky/10 text-sky", amount: "text-foreground" },
};

export function TransactionTypeMark({ transaction, badge = false, compact = false }) {
  const tone = tones[getTransactionType(transaction)];
  const Icon = tone.icon;
  if (badge) return <span className={"inline-flex shrink-0 items-center gap-1 rounded-full text-[10px] font-semibold " + (compact ? "px-1.5 py-0.5 " : "px-2 py-1 ") + tone.chip}><Icon className="h-3 w-3" />{tone.label}</span>;
  return <span className={"grid shrink-0 place-items-center rounded-[10px] " + (compact ? "h-[30px] w-[30px] " : "h-9 w-9 ") + tone.mark} title={tone.label} aria-label={tone.label}><Icon className="h-3.5 w-3.5" /></span>;
}

export function TransactionBankMark({ transaction, account, showName = true }) {
  const institution = pickBankInstitution(account?.institution, account?.provider, account?.name, transaction?.institution, transaction?.account_name, transaction?.source_label);
  const logo = institution ? getBankLogoOrFallback(institution) : null;
  const name = account?.name || account?.account_name || transaction?.account_name || transaction?.source_label || institution || "Manual account";
  return <span className="inline-flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground" title={name}>
    <span className="grid h-[23px] w-[23px] shrink-0 place-items-center overflow-hidden rounded-full border border-border/60 bg-white p-[2px] dark:bg-white/10">
      {logo ? <img src={logo} alt={institution || "Bank"} className="h-full w-full object-contain" onError={(event) => { event.currentTarget.style.display = "none"; const fallback = event.currentTarget.nextElementSibling; if (fallback) fallback.style.display = "block"; }} /> : null}
      <Wallet className="h-3.5 w-3.5 text-muted-foreground" style={logo ? { display: "none" } : undefined} aria-hidden="true" />
    </span>
    {showName && <span className="max-w-[165px] min-w-0 truncate">{name}</span>}
  </span>;
}

export function getTransactionStatus(transaction) {
  if (transaction?.approval_status === "failed") return { label: "Failed", className: "bg-ruby/10 text-ruby" };
  if (transaction?.approval_status === "unapproved" || transaction?.category_approval_status === "unapproved") return { label: "Unapproved", className: "bg-topaz/10 text-topaz" };
  if (transaction?.pending) return { label: "Pending", className: "bg-sky/10 text-sky" };
  return { label: "Approved", className: "bg-emerald/10 text-emerald" };
}

export function TransactionStatusBadge({ transaction }) {
  const status = getTransactionStatus(transaction);
  return <span className={"inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium " + status.className}>{status.label}</span>;
}

export function transactionDateKey(transaction) {
  return String(transaction?.date || "").slice(0, 10) || "unknown";
}

export function formatTransactionDay(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) return "Unknown date";
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "Unknown date";
  const today = new Date();
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const difference = Math.round((currentDay - date) / 86400000);
  const formatted = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (difference === 0) return "Today · " + formatted;
  if (difference === 1) return "Yesterday · " + formatted;
  return formatted;
}

export function groupTransactionsByDate(transactions) {
  const groups = [];
  (transactions || []).forEach((transaction, index) => {
    const key = transactionDateKey(transaction);
    const last = groups[groups.length - 1];
    if (last?.date === key) last.items.push(transaction);
    else groups.push({ date: key, startIndex: index, items: [transaction] });
  });
  return groups;
}

export function TransactionDateHeading({ date, count, net, sticky = true }) {
  return <div role="heading" aria-level={3} className={(sticky ? "sticky top-0 z-20 " : "") + "penni-tx-date-heading flex min-h-[34px] items-center justify-between gap-3 border-y border-primary/10 bg-[#f0efff]/95 px-4 py-1 text-[11px] font-semibold text-foreground shadow-[0_2px_10px_rgba(75,85,240,0.06)] backdrop-blur-xl dark:bg-[#252441]/95 sm:px-5"} data-transaction-date={date}>
    <span className="inline-flex min-w-0 items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" /><span className="truncate">{formatTransactionDay(date)}</span></span>
    <span className="inline-flex shrink-0 items-center gap-2">
      {count != null && <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{count} transaction{count === 1 ? "" : "s"}</span>}
      {Number.isFinite(net) && <span className="text-[11px] font-semibold tabular-nums">Net {formatCurrency(net, { signed: true })}</span>}
    </span>
  </div>;
}

export function UnifiedTransactionItem({ transaction: t, account, onSelect, onEdit, onDelete, active = false }) {
  const type = getTransactionType(t);
  const tone = tones[type];
  const amount = Number(t.amount) || 0;
  const title = t.description || t.merchant || "Transaction";
  const merchant = t.merchant || t.normalized_merchant;
  const subtitle = merchant && merchant.toLowerCase() !== title.toLowerCase() ? merchant : t.is_split ? "Split across categories" : "";

  return <div className={"flex min-w-0 items-center border-b border-border/50 last:border-0 transition-colors hover:bg-secondary/30 " + (active ? "bg-primary/5 " : "")}>
    <button type="button" onClick={() => onSelect?.(t)} className="flex min-h-[68px] min-w-0 flex-1 items-center gap-2.5 px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-primary sm:px-5" aria-label={"View " + title}>
      <TransactionTypeMark transaction={t} compact />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="block min-w-0 max-w-full truncate text-[13px] font-semibold tracking-[-0.015em]" title={title}>{title}</span>
        </span>
        {subtitle && <span className="mt-0.5 block max-w-full truncate text-[10.5px] text-muted-foreground">{subtitle}</span>}
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <TransactionTypeMark transaction={t} badge compact />
          <CategoryBadge category={type === "transfer" ? "Transfer" : t.category || "uncategorized"} size="sm" truncate showIcon className="max-w-[160px]" />
          <TransactionBankMark transaction={t} account={account} />
          {t.is_split && <span className="rounded-full bg-violet/10 px-2 py-0.5 text-[10px] font-medium text-violet">Split</span>}
          {t.transfer_pair_id && <span className="text-[10px] font-medium text-sky">Matched</span>}
        </span>
      </span>
      <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
        <span className={"money-tabular whitespace-nowrap text-[13px] font-semibold " + tone.amount}>{amount > 0 ? "+" : amount < 0 ? "−" : ""}{formatCurrency(Math.abs(amount))}</span>
        <TransactionStatusBadge transaction={t} />
      </span>
    </button>
    {(onEdit || onDelete) && <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" aria-label={"Actions for " + title} className="mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit && <DropdownMenuItem onClick={() => onEdit(t)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>}
        {onDelete && <DropdownMenuItem className="text-ruby" onClick={() => onDelete(t)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>}
  </div>;
}

export default function GroupedTransactionItems({ transactions = [], account, accountsById, onSelect, onEdit, onDelete, activeId, groupDates = true }) {
  const groups = groupDates ? groupTransactionsByDate(transactions) : [{ date: null, items: transactions }];
  return <div className="min-w-0">
    {groups.map((group, index) => <section key={(group.date || "ungrouped") + "-" + index} className="min-w-0">
      {groupDates && <TransactionDateHeading date={group.date} count={group.items.length} />}
      <div className="min-w-0">
        {group.items.map((t, itemIndex) => <UnifiedTransactionItem key={t.transaction_id || t.tx_id || itemIndex} transaction={t} account={accountsById?.[t.account_id] || account} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} active={String(activeId || "") === String(t.transaction_id)} />)}
      </div>
    </section>)}
  </div>;
}

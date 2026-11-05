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

export function TransactionTypeMark({ transaction, badge = false }) {
  const tone = tones[getTransactionType(transaction)];
  const Icon = tone.icon;
  if (badge) return <span className={"inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold " + tone.chip}><Icon className="h-3 w-3" />{tone.label}</span>;
  return <span className={"grid h-9 w-9 shrink-0 place-items-center rounded-xl " + tone.mark} title={tone.label} aria-label={tone.label}><Icon className="h-4 w-4" /></span>;
}

export function TransactionBankMark({ transaction, account, showName = true }) {
  const institution = pickBankInstitution(account?.provider, account?.institution, account?.name, transaction?.institution, transaction?.account_name, transaction?.source_label);
  const logo = institution ? getBankLogoOrFallback(institution) : null;
  const name = account?.name || transaction?.account_name || transaction?.source_label || institution || "Manual account";
  return <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground" title={name}>
    {logo ? <img src={logo} alt={institution || "Bank"} className="h-[19px] w-[19px] shrink-0 rounded-full bg-white object-contain p-px" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />}
    {showName && <span className="max-w-[150px] truncate">{name}</span>}
  </span>;
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
  (transactions || []).forEach((transaction) => {
    const key = transactionDateKey(transaction);
    const last = groups[groups.length - 1];
    if (last?.date === key) last.items.push(transaction);
    else groups.push({ date: key, items: [transaction] });
  });
  return groups;
}

export function TransactionDateHeading({ date, count, sticky = true }) {
  return <div className={(sticky ? "sticky top-0 z-20 " : "") + "flex min-h-[39px] items-center justify-between gap-3 border-y border-primary/10 bg-[#f0efff] px-4 py-2 text-[11px] font-semibold text-foreground shadow-[0_1px_0_rgba(75,85,240,0.08)] dark:bg-[#252441] sm:px-5"}>
    <span className="inline-flex min-w-0 items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="truncate">{formatTransactionDay(date)}</span></span>
    {count != null && <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{count} transaction{count === 1 ? "" : "s"}</span>}
  </div>;
}

export function UnifiedTransactionItem({ transaction: t, account, onSelect, onEdit, onDelete, active = false }) {
  const type = getTransactionType(t);
  const tone = tones[type];
  const amount = Number(t.amount) || 0;
  const title = t.description || t.merchant || "Transaction";
  const merchant = t.merchant || t.normalized_merchant;
  const subtitle = merchant && merchant.toLowerCase() !== title.toLowerCase() ? merchant : t.is_split ? "Split across categories" : "";
  const status = t.approval_status === "failed" ? "Failed" : t.pending ? "Pending" : (t.approval_status === "unapproved" || t.category_approval_status === "unapproved") ? "Unapproved" : "Approved";
  return <div className={"flex min-w-0 items-center border-b border-border/50 last:border-0 transition-colors hover:bg-secondary/30 " + (active ? "bg-primary/5 " : "")}>
    <button type="button" onClick={() => onSelect?.(t)} className="flex min-h-[78px] min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left focus-visible:outline-2 focus-visible:outline-primary sm:px-5" aria-label={"View " + title}>
      <TransactionTypeMark transaction={t} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 max-w-full truncate text-[13px] font-semibold tracking-[-0.015em]">{title}</span>
          <TransactionTypeMark transaction={t} badge />
          {t.is_split && <span className="rounded-full bg-violet/10 px-2 py-0.5 text-[10px] font-medium text-violet">Split</span>}
        </span>
        {subtitle && <span className="mt-0.5 block max-w-full truncate text-[10.5px] text-muted-foreground">{subtitle}</span>}
        <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <CategoryBadge category={type === "transfer" ? "Transfer" : t.category || "uncategorized"} size="sm" truncate showIcon className="max-w-[160px]" />
          <TransactionBankMark transaction={t} account={account} />
        </span>
      </span>
      <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
        <span className={"money-tabular whitespace-nowrap text-[13px] font-semibold " + tone.amount}>{amount > 0 ? "+" : amount < 0 ? "−" : ""}{formatCurrency(Math.abs(amount))}</span>
        <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + (status === "Unapproved" ? "bg-topaz/10 text-topaz" : status === "Failed" ? "bg-ruby/10 text-ruby" : status === "Pending" ? "bg-sky/10 text-sky" : "bg-emerald/10 text-emerald")}>{status}</span>
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

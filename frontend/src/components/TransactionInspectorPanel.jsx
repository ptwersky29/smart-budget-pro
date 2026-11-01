import React, { useState } from "react";
import { Receipt, X, Pencil, MoreHorizontal, CheckCircle2, Sparkles, Scissors, Link2, Link2Off, Trash2, CalendarDays, Tag, Wallet, StickyNote, Building2, AlertTriangle, Calculator, RefreshCw, ArrowDownLeft, ArrowUpRight, ChevronRight } from "lucide-react";
import { formatCurrency, formatLongDate, formatShortDate } from "../lib/format";
import { getBankLogoOrFallback, pickBankInstitution } from "../data/bankLogos";
import CategoryBadge from "./CategoryBadge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "./ui/dropdown-menu";

const SOURCE_LABELS = { manual: "Manual", csv: "CSV", pdf: "PDF", statement: "Statement", sms: "SMS" };

export default function TransactionInspectorPanel({
  transaction,
  account,
  similarTransactions = [],
  onClose,
  onEdit,
  onDelete,
  onApprove,
  onClassify,
  onSplit,
  onPairTransfer,
  onUnpairTransfer,
  onInspect,
  onAsk,
}) {
  const [tab, setTab] = useState("details");

  if (!transaction) {
    return (
      <div className="surface flex min-h-[420px] flex-col items-center justify-center rounded-[14px] p-6 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-muted-foreground">
          <Receipt className="h-5 w-5" />
        </span>
        <p className="mt-3 text-[13px] font-semibold">Select a transaction</p>
        <p className="mt-1 max-w-[190px] text-[11px] leading-relaxed text-muted-foreground">Choose a row to see its full details, approvals and similar activity.</p>
      </div>
    );
  }

  const amount = Number(transaction.amount) || 0;
  const income = amount > 0;
  const unapproved = transaction.approval_status === "unapproved" || transaction.category_approval_status === "unapproved";
  const failed = transaction.approval_status === "failed";
  const accountName = account?.name || transaction.source_label || transaction.institution || "Manual account";
  const institution = pickBankInstitution(account?.provider, account?.name, transaction.institution, transaction.source_label);
  const accountLogo = institution ? getBankLogoOrFallback(institution) : null;
  const transactionType = transaction.is_transfer ? "Transfer" : income ? "Income" : "Expense";
  const addedAt = transaction.created_at
    ? new Date(transaction.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="surface flex h-[calc(100vh-94px)] min-h-[540px] flex-col overflow-hidden rounded-[14px] xl:h-full xl:min-h-0">
      <div className="subtle-scroll flex-1 overflow-y-auto">
        <div className="relative p-4 pb-3">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Close transaction details"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3 pr-7">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-sky/10 text-sky">
              {accountLogo ? (
                <img
                  src={accountLogo}
                  alt=""
                  className="h-8 w-8 rounded-full object-contain"
                  onError={(event) => { event.target.style.display = "none"; }}
                />
              ) : (
                <Receipt className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="line-clamp-2 text-[15px] font-semibold leading-tight tracking-[-0.02em]">{transaction.description || transaction.merchant || "Transaction"}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <p className="truncate text-[10.5px] text-muted-foreground">{transaction.merchant || transaction.normalized_merchant || transaction.source_label || "Transaction"}</p>
                {unapproved ? <span className="rounded-full bg-topaz/10 px-2 py-0.5 text-[9.5px] font-medium text-topaz">Unapproved</span> : null}
                {failed ? <span className="rounded-full bg-ruby/10 px-2 py-0.5 text-[9.5px] font-medium text-ruby">Failed</span> : null}
              </div>
            </div>
          </div>
          <p className={`money-tabular mt-3 text-[1.85rem] font-semibold leading-none tracking-[-0.045em] ${income ? "text-emerald" : "text-ruby"}`}>
            {formatCurrency(amount, { signed: true })}
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            {unapproved && onApprove ? (
              <button type="button" onClick={() => onApprove(transaction)} className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-emerald px-3 text-[11.5px] font-semibold text-white transition hover:bg-emerald/90">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </button>
            ) : onClassify ? (
              <button type="button" onClick={() => onClassify(transaction)} className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-emerald/10 px-3 text-[11.5px] font-semibold text-emerald transition hover:bg-emerald/15">
                <Sparkles className="h-3.5 w-3.5" /> Classify
              </button>
            ) : null}
            <button type="button" onClick={() => onEdit(transaction)} className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-border bg-card px-3 text-[11.5px] font-medium transition hover:bg-secondary/60">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="grid h-[34px] w-[34px] place-items-center rounded-[8px] border border-border bg-card text-muted-foreground transition hover:text-foreground" aria-label="More transaction actions">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!unapproved && onApprove ? (
                  <DropdownMenuItem onClick={() => onApprove(transaction)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                  </DropdownMenuItem>
                ) : null}
                {onClassify ? <DropdownMenuItem onClick={() => onClassify(transaction)}>
                  <Sparkles className="mr-2 h-4 w-4" /> AI classify
                </DropdownMenuItem> : null}
                {onSplit ? <DropdownMenuItem onClick={() => onSplit(transaction)}>
                  <Scissors className="mr-2 h-4 w-4" /> Split transaction
                </DropdownMenuItem> : null}
                {onUnpairTransfer && transaction.transfer_pair_id ? (
                  <DropdownMenuItem onClick={() => onUnpairTransfer(transaction)}>
                    <Link2Off className="mr-2 h-4 w-4" /> Unpair transfer
                  </DropdownMenuItem>
                ) : onPairTransfer ? (
                  <DropdownMenuItem onClick={() => onPairTransfer(transaction)}>
                    <Link2 className="mr-2 h-4 w-4" /> Pair transfer
                  </DropdownMenuItem>
                ) : null}
                {onAsk ? <DropdownMenuItem onClick={() => onAsk(transaction)}>
                  <Sparkles className="mr-2 h-4 w-4" /> Ask Penni
                </DropdownMenuItem> : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(transaction.transaction_id)} className="text-ruby">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex gap-4 border-b border-border px-4">
          {[
            { key: "details", label: "Details" },
            { key: "notes", label: "Notes" },
            { key: "attachments", label: "Attachments" },
            { key: "history", label: "History" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`-mb-px h-10 border-b-2 text-[12px] transition ${tab === item.key ? "border-emerald font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "details" ? (
          <div className="divide-y divide-border/60 px-4">
            <DetailRow icon={CalendarDays} label="Date">
              {formatLongDate(transaction.date, { weekday: false })}
            </DetailRow>
            <DetailRow icon={Receipt} label="Description">
              <span className="line-clamp-2">{transaction.description || "—"}</span>
            </DetailRow>
            <DetailRow icon={Building2} label="Merchant">
              {transaction.merchant || transaction.normalized_merchant || "—"}
            </DetailRow>
            <DetailRow icon={Tag} label="Category">
              <CategoryBadge category={transaction.category || "uncategorized"} size="sm" truncate />
            </DetailRow>
            <DetailRow icon={Wallet} label="Account">
              <span className="inline-flex items-center justify-end gap-1.5">
                {accountLogo ? <img src={accountLogo} alt="" className="h-4 w-4 rounded-sm object-contain" /> : null}
                <span className="truncate">{accountName}</span>
              </span>
            </DetailRow>
            <DetailRow icon={transaction.is_transfer ? Link2 : income ? ArrowDownLeft : ArrowUpRight} label="Type">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${transaction.is_transfer ? "bg-sky/10 text-sky" : income ? "bg-emerald/10 text-emerald" : "bg-ruby/10 text-ruby"}`}>
                {transactionType}
              </span>
            </DetailRow>
            <DetailRow icon={CheckCircle2} label="Status">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${failed ? "bg-ruby/10 text-ruby" : unapproved ? "bg-topaz/10 text-topaz" : "bg-emerald/10 text-emerald"}`}>
                {failed ? "Failed" : unapproved ? "Unapproved" : "Approved"}
              </span>
            </DetailRow>
            <DetailRow icon={Calculator} label="Amount">
              <span className={`money-tabular font-semibold ${income ? "text-emerald" : "text-ruby"}`}>{formatCurrency(amount, { signed: true })}</span>
            </DetailRow>
            <DetailRow icon={Tag} label="Source">
              {transaction.source_label || SOURCE_LABELS[transaction.source] || transaction.source || "Manual"}
            </DetailRow>
            <DetailRow icon={Tag} label="Transaction ID">
              <span className="break-all font-mono text-[10.5px] text-muted-foreground">{transaction.transaction_id}</span>
            </DetailRow>
            {transaction.notes ? (
              <DetailRow icon={StickyNote} label="Notes">
                <span className="line-clamp-3">{transaction.notes}</span>
              </DetailRow>
            ) : null}
            {addedAt ? (
              <DetailRow icon={CalendarDays} label="Added">
                {addedAt}
              </DetailRow>
            ) : null}
          </div>
        ) : null}

        {tab === "notes" ? (
          <div className="p-4">
            {transaction.notes ? (
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">{transaction.notes}</p>
            ) : (
              <p className="text-[12px] text-muted-foreground">No notes on this transaction yet.</p>
            )}
            <button onClick={() => onEdit(transaction)} className="mt-3 text-[11px] font-medium text-emerald hover:underline">Edit notes</button>
          </div>
        ) : null}

        {tab === "attachments" ? (
          <div className="p-4 text-[12px] text-muted-foreground">No attachments linked to this transaction.</div>
        ) : null}

        {tab === "history" ? (
          <div className="divide-y divide-border/60 px-4">
            {addedAt ? <DetailRow icon={CalendarDays} label="Added">{addedAt}</DetailRow> : null}
            {transaction.approved_at ? <DetailRow icon={CheckCircle2} label="Approved">{new Date(transaction.approved_at).toLocaleString("en-GB")}</DetailRow> : null}
            <DetailRow icon={RefreshCw} label="Last sync">{transaction.date ? formatShortDate(transaction.date) : "—"}</DetailRow>
            {transaction.failed_reason ? <DetailRow icon={AlertTriangle} label="Issue">{transaction.failed_reason}</DetailRow> : null}
          </div>
        ) : null}

        {similarTransactions.length > 0 && onInspect ? (
          <div className="border-t border-border/70 p-4">
            <p className="text-[11.5px] font-semibold">Similar transactions</p>
            <div className="mt-2 divide-y divide-border/50">
              {similarTransactions.map((similar) => (
                <button
                  key={similar.transaction_id}
                  type="button"
                  onClick={() => onInspect(similar)}
                  className="flex w-full items-center gap-2 py-2.5 text-left transition hover:opacity-80"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky/10 text-sky">
                    <Receipt className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium">{similar.description}</span>
                    <span className="mt-0.5 block text-[9.5px] text-muted-foreground">{formatShortDate(similar.date, { year: "numeric" })}</span>
                  </span>
                  <span className={`money-tabular shrink-0 text-[10.5px] font-semibold ${Number(similar.amount) > 0 ? "text-emerald" : "text-ruby"}`}>{formatCurrency(similar.amount, { signed: true })}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="grid grid-cols-[100px_minmax(0,1fr)] items-start gap-2 py-2.5">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" /> {label}
      </span>
      <span className="min-w-0 text-right text-[11.5px] text-foreground">{children}</span>
    </div>
  );
}


import { createPortal } from "react-dom";
﻿import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { Plus, Trash2, Loader2, Pencil, Search, Sparkles, Filter, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, BarChart3, Star, Receipt, Download, MoreHorizontal, RefreshCw, CheckCircle2, PieChart as PieChartIcon, ArrowDownLeft, ArrowUpRight, CalendarDays, Tag, Wallet, StickyNote, Building2, Scissors, Link2, Link2Off, AlertTriangle, Calculator, TrendingUp, TrendingDown, LayoutGrid, List, Copy, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "../components/ui/layout";
import { SkeletonTable } from "../components/ui/Skeleton";
import { useAssistant } from "../contexts/AssistantContext";
import { formatCurrency, formatLongDate, formatShortDate } from "../lib/format";
import Sparkline from "../components/ui/Sparkline";
import { withUndo } from "../lib/undo";
import ConfirmModal from "../components/ui/ConfirmModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "../components/ui/dropdown-menu";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../components/ui/sheet";
import ComparePeriods from "../components/ComparePeriods";
import TransactionRow from "../components/TransactionRow";
import { getBankLogoOrFallback, pickBankInstitution } from "../data/bankLogos";
const CategoryPieChart = React.lazy(() => import("../components/CategoryPieChart"));
import TransactionForm from "../components/TransactionForm";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useSwipe } from "../hooks/useSwipe";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";

import CategoryCombobox from "../components/CategoryCombobox";
import CategoryBadge from "../components/CategoryBadge";

const SOURCE_LABELS = { manual: "Manual", csv: "CSV", pdf: "PDF", statement: "Statement", sms: "SMS" };
const emptyForm = { description: "", date: today(), amount: "", category: "", entry_mode: "standard", is_income: false, is_transfer: false, budget_type: "", occasion: "", merchant: "", notes: "", account_id: "", exclude_from_maaser: false };

function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function fmtMonth(y, m) { return `${y}-${String(m).padStart(2, "0")}`; }
function addMonth(mm, delta) {
  const [y, m] = mm.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return fmtMonth(d.getFullYear(), String(d.getMonth() + 1));
}

const fmt = (n) => `\u00A3${Number(n || 0).toFixed(2)}`;
const PIE_COLORS = ["#30a46c", "#e8a838", "#60a5fa", "#a78bfa", "#f472b6", "#fb923c", "#34d399", "#818cf8", "#f87171", "#2dd4bf", "#fbbf24", "#e879f9"];

function transactionDate(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function transactionDayLabel(value, { weekday = true } = {}) {
  const date = transactionDate(value);
  if (!date) return "Unknown date";
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB", {
    ...(weekday ? { weekday: "short" } : {}),
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

function groupCatsBySection(cats) {
  const groups = {};
  for (const c of cats) {
    const section = c.section || "Other";
    if (!groups[section]) groups[section] = [];
    groups[section].push(c);
  }
  return groups;
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (
    typeof window !== "undefined" && window.matchMedia(query).matches
  ));

  useEffect(() => {
    const media = window.matchMedia(query);
    const updateMatches = () => setMatches(media.matches);
    updateMatches();
    media.addEventListener("change", updateMatches);
    return () => media.removeEventListener("change", updateMatches);
  }, [query]);

  return matches;
}

function TransactionActionPanel({ open, title, description, onClose, children, footer, className = "max-w-md" }) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`my-auto rounded-2xl border border-border bg-card shadow-2xl p-6 w-full ${className} animate-[fadeUp_0.2s_ease-out]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h3 className="text-xl tracking-tight font-medium">{title}</h3>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
        {footer && <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

function InspectorRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary/70 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <div className="mt-0.5 break-words text-[12.5px] text-foreground">{children}</div>
      </div>
    </div>
  );
}

function TransactionInspector({ transaction, onClose, onEdit, onDelete, onApprove, onClassify, onSplit, onPairTransfer, onUnpairTransfer, onAsk }) {
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  if (!transaction || isDesktop) return null;
  const income = Number(transaction.amount) > 0;
  const unapproved = transaction.approval_status === "unapproved" || transaction.category_approval_status === "unapproved";
  const failed = transaction.approval_status === "failed";

  return (
    <Sheet open={Boolean(transaction)} onOpenChange={(next) => (next ? null : onClose())}>
      <SheetContent side="right" overlayClassName="xl:hidden" className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-[430px] xl:hidden">
        <div className="border-b border-border/60 px-5 pb-5 pr-14 pt-6">
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 place-items-center rounded-2xl ${income ? "bg-emerald/10 text-emerald" : "bg-secondary text-muted-foreground"}`}>
              {income ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-[15px] font-semibold tracking-[-0.02em]">
                {transaction.description || transaction.merchant || "Transaction"}
              </SheetTitle>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatLongDate(transaction.date, { weekday: false })}
              </p>
            </div>
          </div>
          <p className={`money-tabular mt-5 text-[2rem] font-semibold leading-none tracking-[-0.05em] ${income ? "text-emerald" : "text-foreground"}`}>
            {formatCurrency(transaction.amount, { signed: true })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={transaction.category || "uncategorized"} size="sm" />
            {transaction.is_transfer ? <span className="rounded-full bg-sky/10 px-2 py-0.5 text-[10px] font-medium text-sky">Transfer</span> : null}
            {transaction.is_split ? <span className="rounded-full bg-violet/10 px-2 py-0.5 text-[10px] font-medium text-violet">Split</span> : null}
            {unapproved ? <span className="rounded-full bg-topaz/10 px-2 py-0.5 text-[10px] font-medium text-topaz">Needs approval</span> : null}
            {failed ? <span className="rounded-full bg-ruby/10 px-2 py-0.5 text-[10px] font-medium text-ruby">Failed</span> : null}
          </div>
        </div>

        <div className="divide-y divide-border/50 px-5">
          <InspectorRow icon={CalendarDays} label="Date">{formatLongDate(transaction.date)}</InspectorRow>
          <InspectorRow icon={Tag} label="Category"><span className="capitalize">{transaction.category || "Uncategorized"}</span></InspectorRow>
          {transaction.merchant || transaction.normalized_merchant ? (
            <InspectorRow icon={Building2} label="Merchant">{transaction.merchant || transaction.normalized_merchant}</InspectorRow>
          ) : null}
          {transaction.account_name ? (
            <InspectorRow icon={Wallet} label="Account">{transaction.account_name}</InspectorRow>
          ) : null}
          {transaction.notes ? (
            <InspectorRow icon={StickyNote} label="Notes">{transaction.notes}</InspectorRow>
          ) : null}
          {transaction.failed_reason ? (
            <InspectorRow icon={AlertTriangle} label="Issue">{transaction.failed_reason}</InspectorRow>
          ) : null}
        </div>

        <div className="mt-auto space-y-2 border-t border-border/60 p-4">
          <button
            type="button"
            onClick={() => onAsk(transaction)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald/10 px-4 py-2.5 text-[12px] font-semibold text-emerald transition hover:bg-emerald/15"
          >
            <Sparkles className="h-3.5 w-3.5" /> Ask Penni about this
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onEdit(transaction)} className="flex items-center justify-center gap-1.5 rounded-xl border border-border/70 px-3 py-2.5 text-[11.5px] font-medium transition hover:bg-secondary/60">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            {unapproved ? (
              <button type="button" onClick={() => onApprove(transaction)} className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald/20 bg-emerald/5 px-3 py-2.5 text-[11.5px] font-medium text-emerald transition hover:bg-emerald/10">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </button>
            ) : (
              <button type="button" onClick={() => onClassify(transaction)} className="flex items-center justify-center gap-1.5 rounded-xl border border-border/70 px-3 py-2.5 text-[11.5px] font-medium transition hover:bg-secondary/60">
                <Sparkles className="h-3.5 w-3.5" /> Classify
              </button>
            )}
            <button type="button" onClick={() => onSplit(transaction)} className="flex items-center justify-center gap-1.5 rounded-xl border border-border/70 px-3 py-2.5 text-[11.5px] font-medium transition hover:bg-secondary/60">
              <Scissors className="h-3.5 w-3.5" /> Split
            </button>
            {transaction.transfer_pair_id ? (
              <button type="button" onClick={() => onUnpairTransfer(transaction)} className="flex items-center justify-center gap-1.5 rounded-xl border border-border/70 px-3 py-2.5 text-[11.5px] font-medium transition hover:bg-secondary/60">
                <Link2Off className="h-3.5 w-3.5" /> Unpair
              </button>
            ) : (
              <button type="button" onClick={() => onPairTransfer(transaction)} className="flex items-center justify-center gap-1.5 rounded-xl border border-border/70 px-3 py-2.5 text-[11.5px] font-medium transition hover:bg-secondary/60">
                <Link2 className="h-3.5 w-3.5" /> Pair
              </button>
            )}
          </div>
          <button type="button" onClick={() => onDelete(transaction.transaction_id)} className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[11.5px] font-medium text-ruby transition hover:bg-ruby/5">
            <Trash2 className="h-3.5 w-3.5" /> Delete transaction
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TransactionInspectorPanel({
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
    <div className="surface flex h-[calc(100vh-94px)] min-h-[540px] flex-col overflow-hidden rounded-[14px]">
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
            {unapproved ? (
              <button type="button" onClick={() => onApprove(transaction)} className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-emerald px-3 text-[11.5px] font-semibold text-white transition hover:bg-emerald/90">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </button>
            ) : (
              <button type="button" onClick={() => onClassify(transaction)} className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-emerald/10 px-3 text-[11.5px] font-semibold text-emerald transition hover:bg-emerald/15">
                <Sparkles className="h-3.5 w-3.5" /> Classify
              </button>
            )}
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
                {!unapproved ? (
                  <DropdownMenuItem onClick={() => onApprove(transaction)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => onClassify(transaction)}>
                  <Sparkles className="mr-2 h-4 w-4" /> AI classify
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSplit(transaction)}>
                  <Scissors className="mr-2 h-4 w-4" /> Split transaction
                </DropdownMenuItem>
                {transaction.transfer_pair_id ? (
                  <DropdownMenuItem onClick={() => onUnpairTransfer(transaction)}>
                    <Link2Off className="mr-2 h-4 w-4" /> Unpair transfer
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onPairTransfer(transaction)}>
                    <Link2 className="mr-2 h-4 w-4" /> Pair transfer
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onAsk(transaction)}>
                  <Sparkles className="mr-2 h-4 w-4" /> Ask Penni
                </DropdownMenuItem>
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

        {similarTransactions.length > 0 ? (
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

const Transactions = React.memo(function Transactions() {
  useEffect(() => { document.title = "Transactions | Penni"; }, []);
  const { openAssistant } = useAssistant();
  const [txs, setTxs] = useState([]);
  const [total, setTotal] = useState(0);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedCats, setSelectedCats] = useState({ categories: [], hierarchy: {} });
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassification] = useState(null);
  const [saveAsRecurring, setSaveAsRecurring] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("ledger");
  const now = new Date();
  const urlMonth = (() => {
    const df = searchParams.get("date_from");
    if (df && df.length >= 7) return df.slice(0, 7);
    return null;
  })();
  const [month, setMonth] = useState(urlMonth || fmtMonth(now.getFullYear(), String(now.getMonth() + 1)));
  const [categorySpend, setCategorySpend] = useState([]);
  const [showPie, setShowPie] = useState(false);
  const [overview, setOverview] = useState(null);
  const [monthRows, setMonthRows] = useState([]);
  const [previousMonthRows, setPreviousMonthRows] = useState([]);
  const [ledgerTab, setLedgerTab] = useState("all");
  const [viewMode, setViewMode] = useState("list");
  const defaultFilters = useMemo(() => ({ search: "", category: "", source: "", tx_type: "", approval_status: "", merchant: "", date_from: "", date_to: "", amount_min: "", amount_max: "", sort: "date", order: "desc", account_id: "" }), []);
  const [filters, setFilters] = useState(() => {
    const fromUrl = {};
    for (const k of Object.keys(defaultFilters)) {
      fromUrl[k] = searchParams.get(k) || defaultFilters[k];
    }
    return fromUrl;
  });
  const [offset, setOffset] = useState(() => { const p = searchParams.get("offset"); return p ? parseInt(p, 10) : 0; });
  const [limit] = useState(50);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchInput, setSearchInput] = useState(filters.search);
  const [swipedId, setSwipedId] = useState(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const confirmCb = useRef(null);
  const [newCategoryModal, setNewCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [inspectTx, setInspectTx] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const openInspector = useCallback((transaction) => {
    setInspectTx(transaction);
    setInspectorOpen(true);
  }, []);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTx, setReviewTx] = useState(null);
  const [reviewSuggestions, setReviewSuggestions] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitTxDraft, setSplitTxDraft] = useState(null);
  const [splitLines, setSplitLines] = useState([]);
  const [splitSaving, setSplitSaving] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTx, setTransferTx] = useState(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);


  // â”€â”€ Maaser ledger state â”€â”€
  const [maaserCfg, setMaaserCfg] = useState({ enabled: false, percent: 10 });
  const [maaserSum, setMaaserSum] = useState(null);
  const [maaserBusy, setMaaserBusy] = useState(false);
  const [maaserLoading, setMaaserLoading] = useState(true);
  const [maaserConfirmReset, setMaaserConfirmReset] = useState(false);
  const [maaserShowGive, setMaaserShowGive] = useState(false);
  const [maaserGiveAmount, setMaaserGiveAmount] = useState("");
  const [maaserGiveRecipient, setMaaserGiveRecipient] = useState("");
  const [maaserLedger, setMaaserLedger] = useState([]);
  const [maaserLedgerLoading, setMaaserLedgerLoading] = useState(true);
  const [maaserEditEntry, setMaaserEditEntry] = useState(null);
  const [maaserEditAmount, setMaaserEditAmount] = useState("");
  const [maaserEditPaidTo, setMaaserEditPaidTo] = useState("");
  const [maaserEditNote, setMaaserEditNote] = useState("");
  const [maaserIncomeTxs, setMaaserIncomeTxs] = useState([]);
  const [maaserIncomeTxsLoading, setMaaserIncomeTxsLoading] = useState(false);
  const [maaserTzedakahTxs, setMaaserTzedakahTxs] = useState([]);
  const [maaserTzedakahTxsLoading, setMaaserTzedakahTxsLoading] = useState(false);

  const CHARITY_CATEGORIES = ["maaser_tzedakah", "charity", "other_charity"];
  const refreshMaaser = useCallback(async () => {
    try {
      const charityReqs = CHARITY_CATEGORIES.map(c => api.get("/transactions", { params: { category: c, limit: 200 } }));
      const [s, sum, lg, incRes, ...tzdResArr] = await Promise.all([
        api.get("/jewish/maaser/settings"),
        api.get("/jewish/maaser/summary"),
        api.get("/jewish/maaser/ledger?include_tx=true&limit=500"),
        api.get("/transactions", { params: { tx_type: "income", limit: 200 } }),
        ...charityReqs,
      ]);
      setMaaserCfg(s.data || { enabled: false, percent: 10 });
      setMaaserSum(sum.data || null);
      setMaaserLedger(lg.data?.entries || []);
      setMaaserIncomeTxs((incRes.data?.transactions || []).filter(t => !t.is_transfer && !t.exclude_from_maaser));
      const allCharityTxs = tzdResArr.flatMap(r => r.data?.transactions || []);
      setMaaserTzedakahTxs(allCharityTxs);
    } catch {}
  }, []);

  const loadMaaserSummary = useCallback(async () => {
    setMaaserLoading(true);
    setMaaserLedgerLoading(true);
    setMaaserIncomeTxsLoading(true);
    setMaaserTzedakahTxsLoading(true);
    try {
      const charityReqs = CHARITY_CATEGORIES.map(c => api.get("/transactions", { params: { category: c, limit: 200 } }));
      const [s, sum, lg, incRes, ...tzdResArr] = await Promise.all([
        api.get("/jewish/maaser/settings"),
        api.get("/jewish/maaser/summary"),
        api.get("/jewish/maaser/ledger?include_tx=true&limit=500"),
        api.get("/transactions", { params: { tx_type: "income", limit: 200 } }),
        ...charityReqs,
      ]);
      setMaaserCfg(s.data || { enabled: false, percent: 10 });
      setMaaserSum(sum.data || null);
      setMaaserLedger(lg.data?.entries || []);
      setMaaserIncomeTxs((incRes.data?.transactions || []).filter(t => !t.is_transfer && !t.exclude_from_maaser));
      const allCharityTxs = tzdResArr.flatMap(r => r.data?.transactions || []);
      setMaaserTzedakahTxs(allCharityTxs);
    } catch {}
    finally {
      setMaaserLoading(false);
      setMaaserLedgerLoading(false);
      setMaaserIncomeTxsLoading(false);
      setMaaserTzedakahTxsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "maaser") {
      loadMaaserSummary();
    }
  }, [activeTab, loadMaaserSummary]);

  const handleMaaserSaveCfg = async (next) => {
    setMaaserBusy(true);
    try {
      await api.put("/jewish/maaser/settings", next);
      setMaaserCfg(next);
      toast.success(`Auto-Maaser ${next.enabled ? "enabled" : "disabled"}`);
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not save");
    }
    finally { setMaaserBusy(false); }
  };

  const handleMaaserRecalc = async () => {
    setMaaserBusy(true);
    try {
      const { data } = await api.post("/jewish/maaser/backfill");
      if (data.enabled === false) {
        toast.error("Turn auto-Maaser on first");
      } else {
        const parts = [`Accrued maaser for ${data.created} income tx Â· ${fmt(data.total_amount)}`];
        if (data.charity_applied > 0) {
          parts.push(`\nApplied ${data.charity_applied} charity tx (${fmt(data.charity_amount)}) against obligation`);
        }
        toast.success(parts.join("\n"));
      }
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not recalculate");
    }
    finally { setMaaserBusy(false); }
  };

  const handleMaaserReset = () => setMaaserConfirmReset(true);

  const handleMaaserDoReset = async () => {
    setMaaserConfirmReset(false);
    setMaaserBusy(true);
    try {
      await api.post("/jewish/maaser/reset");
      toast.success("Maaser audit log reset");
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Reset failed");
    }
    finally { setMaaserBusy(false); }
  };

  const handleMaaserGive = () => {
    if (!maaserSum || maaserSum.balance_owed <= 0) {
      toast.success("Nothing owed â€” you're up to date!");
      return;
    }
    setMaaserGiveAmount(maaserSum.balance_owed.toFixed(2));
    setMaaserGiveRecipient("");
    setMaaserShowGive(true);
  };

  const handleMaaserSubmitGive = async () => {
    const num = parseFloat(maaserGiveAmount);
    if (isNaN(num) || num <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const recipient = maaserGiveRecipient.trim() || "Tzedakah";
    try {
      await api.post("/jewish/tzedakah", { amount: num, recipient, note: "Maaser given against balance" });
      toast.success("Maaser given");
      setMaaserShowGive(false);
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not record");
    }
  };

  const handleMaaserEdit = (entry) => {
    setMaaserEditEntry(entry);
    setMaaserEditAmount(String(entry.maaser_paid || entry.amount || ""));
    setMaaserEditPaidTo(entry.paid_to || "");
    setMaaserEditNote(entry.note || "");
  };

  const handleMaaserSaveEdit = async () => {
    const num = parseFloat(maaserEditAmount);
    if (isNaN(num) || num < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      await api.put(`/jewish/maaser/ledger/${maaserEditEntry.entry_id}`, {
        amount: num,
        recipient: maaserEditPaidTo || "Tzedakah",
        note: maaserEditNote,
      });
      toast.success("Entry updated");
      setMaaserEditEntry(null);
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not update");
    }
  };

  const handleMaaserDelete = (entryId) => {
    showConfirm("Delete maaser entry", "Are you sure you want to delete this maaser ledger entry?", async () => {
      try {
        await api.delete(`/jewish/maaser/ledger/${entryId}`);
        toast.success("Entry deleted");
        await refreshMaaser();
      } catch (e) {
        toast.error(formatApiError(e?.response?.data?.detail) || "Could not delete");
      }
    });
  };

  const handleMaaserPay = async (entryId) => {
    try {
      await api.post(`/jewish/maaser/pay/${entryId}`);
      toast.success("Entry marked as paid");
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not mark paid");
    }
  };

  const handleMaaserExclude = async (entryId, transactionId) => {
    if (!entryId) { toast.error("Missing entry"); return; }
    setMaaserBusy(true);
    try {
      if (transactionId) {
        await api.post(`/jewish/maaser/exclude/${entryId}`);
      } else {
        await api.delete(`/jewish/maaser/ledger/${entryId}`);
      }
      toast.success("Income excluded from Maaser");
      await refreshMaaser();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not exclude");
    }
    finally { setMaaserBusy(false); }
  };

  const showConfirm = useCallback((title, message, cb) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    confirmCb.current = cb;
    setConfirmOpen(true);
  }, []);

  const debounceRef = useRef(null);

  const setFilter = useCallback((key, value) => {
    setOffset(0);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleFilter = useCallback((key, value) => {
    setOffset(0);
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? "" : value }));
  }, []);

  const debouncedSetSearch = useCallback((value) => {
    setOffset(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: value }));
    }, 300);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  useEffect(() => {
    const params = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v && v !== defaultFilters[k]) params[k] = v;
    }
    if (offset) params.offset = String(offset);
    setSearchParams(params, { replace: true });
  }, [filters, offset]);

  const load = useCallback(async () => {
    setLoading(true); setAiResults(null);
    try {
      const params = { offset, limit, sort: filters.sort, order: filters.order };
      if (filters.search) params.search = filters.search;
      if (filters.category) params.category = filters.category;
      if (filters.source) params.source = filters.source;
      if (filters.tx_type) params.tx_type = filters.tx_type;
      if (filters.approval_status) params.approval_status = filters.approval_status;
      if (filters.merchant) params.merchant = filters.merchant;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.amount_min && !isNaN(filters.amount_min)) params.amount_min = parseFloat(filters.amount_min);
      if (filters.amount_max && !isNaN(filters.amount_max)) params.amount_max = parseFloat(filters.amount_max);
      if (filters.account_id) params.account_id = filters.account_id;
      const { data } = await api.get("/transactions", { params });
      setTxs(data.transactions);
      setTotal(data.total);
      setIncomeTotal(data.income_total || 0);
      setExpenseTotal(data.expense_total || 0);
      if (filters.date_from && filters.date_to) {
        const from = filters.date_from, to = filters.date_to;
        api.get("/transactions", { params: { date_from: from, date_to: to, limit: 1000, sort: "date", order: "desc" } })
          .then((res) => {
            if (filters.date_from !== from || filters.date_to !== to) return;
            const spend = {};
            (res.data.transactions || []).forEach((tx) => {
              const cat = (tx.category || "uncategorized").toLowerCase().trim();
              const amt = Math.abs(parseFloat(tx.amount) || 0);
              if (tx.tx_type === "expense" || tx.is_income === false || (!tx.is_income && amt > 0)) {
                spend[cat] = (spend[cat] || 0) + amt;
              }
            });
            const cats = Object.entries(spend).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
            setCategorySpend(cats);
          })
          .catch(() => {});
      }
    } catch (err) { toast.error("Could not load transactions"); }
    finally { setLoading(false); }
  }, [offset, limit, filters]);

  const loadCats = useCallback(async () => {
    try {
      const { data } = await api.get("/categories");
      setSelectedCats({ categories: data.categories || [], hierarchy: data.hierarchy || {} });
    } catch { console.warn("[transactions] failed to load categories"); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCats(); }, [loadCats]);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const { data } = await api.get("/accounts");
      setAccounts(data.accounts || []);
    } catch { toast.error("Could not load accounts"); }
    finally { setAccountsLoading(false); }
  }, []);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  useEffect(() => {
    let cancelled = false;
    api.get("/dashboard/overview")
      .then(({ data }) => { if (!cancelled) setOverview(data || null); })
      .catch(() => { if (!cancelled) setOverview(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    const from = `${month}-01`;
    const to = `${month}-${String(lastDay).padStart(2, "0")}`;
    const previous = addMonth(month, -1);
    const [previousYear, previousMonthNumber] = previous.split("-").map(Number);
    const previousLastDay = new Date(previousYear, previousMonthNumber, 0).getDate();
    const params = { limit: 1000, sort: "date", order: "desc" };
    Promise.all([
      api.get("/transactions", { params: { ...params, date_from: from, date_to: to } }),
      api.get("/transactions", { params: { ...params, date_from: `${previous}-01`, date_to: `${previous}-${String(previousLastDay).padStart(2, "0")}` } }),
    ])
      .then(([currentResponse, previousResponse]) => {
        if (cancelled) return;
        setMonthRows(currentResponse.data?.transactions || []);
        setPreviousMonthRows(previousResponse.data?.transactions || []);
      })
      .catch(() => {
        if (cancelled) return;
        setMonthRows([]);
        setPreviousMonthRows([]);
      });
    return () => { cancelled = true; };
  }, [month]);

  const applyGregorianMonth = useCallback((mm) => {
    setOffset(0);
    setMonth(mm);
    const [y, m] = mm.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    setFilters((prev) => ({
      ...prev,
      date_from: `${mm}-01`,
      date_to: `${mm}-${String(lastDay).padStart(2, "0")}`,
    }));
  }, []);

  const monthLabel = (() => {
    const [y, m] = month.split("-").map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  })();

  const isCurrentMonth = month === fmtMonth(new Date().getFullYear(), String(new Date().getMonth() + 1));
  const rangeLabel = useMemo(() => {
    if (!filters.date_from || !filters.date_to) return monthLabel;
    const format = (value) => {
      const date = new Date(`${value}T00:00:00`);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    };
    return `${format(filters.date_from)} \u2013 ${format(filters.date_to)}`;
  }, [filters.date_from, filters.date_to, monthLabel]);

  // Set initial date filters to current month if no date params in URL
  useEffect(() => {
    const hasCustomDates = searchParams.get("date_from") || searchParams.get("date_to");
    if (!hasCustomDates) {
      applyGregorianMonth(month);
    }
  }, []);

  const activeFilters = useMemo(() => {
    const chips = [];
    if (filters.tx_type) chips.push({ key: "tx_type", label: filters.tx_type === "income" ? "Income" : filters.tx_type === "transfer" ? "Transfer" : "Expense" });
    if (filters.approval_status) chips.push({ key: "approval_status", label: filters.approval_status === "unapproved" ? "Unapproved" : filters.approval_status });
    if (filters.source) chips.push({ key: "source", label: SOURCE_LABELS[filters.source] || filters.source });
    if (filters.category) chips.push({ key: "category", label: filters.category });
    if (filters.merchant) chips.push({ key: "merchant", label: filters.merchant });
    if (filters.account_id) chips.push({ key: "account_id", label: accounts.find((account) => account.account_id === filters.account_id)?.name || "Account" });
    if (filters.amount_min) chips.push({ key: "amount_min", label: `â‰¥ ${formatCurrency(filters.amount_min)}` });
    if (filters.amount_max) chips.push({ key: "amount_max", label: `â‰¤ ${formatCurrency(filters.amount_max)}` });
    if (filters.date_from) chips.push({ key: "date_from", label: `From ${filters.date_from}` });
    if (filters.date_to) chips.push({ key: "date_to", label: `To ${filters.date_to}` });
    return chips;
  }, [accounts, filters]);

  const hasRefinements = activeFilters.some(({ key }) => key !== "date_from" && key !== "date_to");

  const selectLedgerTab = useCallback((tab) => {
    setLedgerTab(tab);
    setOffset(0);
    setFilters((previous) => ({
      ...previous,
      tx_type: tab === "expenses" ? "expense" : tab === "income" ? "income" : tab === "transfers" ? "transfer" : "",
      approval_status: tab === "unapproved" ? "unapproved" : "",
    }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearchInput("");
    setLedgerTab("all");
    setOffset(0);
    const mm = fmtMonth(new Date().getFullYear(), String(new Date().getMonth() + 1));
    const [year, monthNumber] = mm.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    setMonth(mm);
    setFilters({
      ...defaultFilters,
      date_from: `${mm}-01`,
      date_to: `${mm}-${String(lastDay).padStart(2, "0")}`,
    });
  }, [defaultFilters]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;
  const defaultAccountId = useMemo(() => {
    const manual = accounts.find((a) => a.is_offline || a.provider === "manual");
    return manual?.account_id || accounts[0]?.account_id || "";
  }, [accounts]);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm({ ...emptyForm, date: today(), account_id: filters.account_id || defaultAccountId });
    setOpen(true);
  }, [defaultAccountId, filters.account_id]);
  const openEdit = useCallback((t) => {
    setEditingId(t.transaction_id);
    setForm({ description: t.description || "", date: t.date?.slice(0, 10) || today(), amount: String(Math.abs(t.amount)), category: t.category || "", account_id: t.account_id || "", entry_mode: t.is_transfer ? "transfer" : t.is_split ? "split" : "standard", is_income: t.amount > 0, is_transfer: t.is_transfer || false, exclude_from_maaser: t.exclude_from_maaser || false, budget_type: "", occasion: "", merchant: t.merchant || "", notes: t.notes || "" });
    setOpen(true);
  }, []);
  const closeForm = useCallback(() => { setOpen(false); setEditingId(null); setForm({ ...emptyForm, date: today() }); setClassification(null); setSaveAsRecurring(false); }, []);

  const handleClassify = useCallback(async ({ description, amount }) => {
    if (!description.trim() || !amount) return;
    setClassifying(true);
    setClassification(null);
    try {
      const { data } = await api.post("/budget-system/classify", { description: description.trim(), amount });
      setClassification(data);
      // Auto-fill category from top suggestion if very confident (â‰¥ 95%)
      const top = data.suggestions?.[0];
      if (top && top.confidence >= 0.95 && !form.category) {
        setForm(prev => ({ ...prev, category: top.category, budget_type: top.budget_type || "", occasion: top.occasion || "", merchant: top.merchant || "" }));
      }
      if (top?.recurring) setSaveAsRecurring(true);
    } catch { toast.error("Classification failed"); }
    finally { setClassifying(false); }
  }, [form.category]);

  const allDisplayed = aiResults?.transactions || txs;
  const splitTx = useCallback(async (t) => {
    const amount = Math.abs(Number(t.amount || 0));
    const firstLine = Number((amount / 2).toFixed(2));
    setSplitTxDraft(t);
    setSplitOpen(true);
    setSplitSaving(false);
    setSplitLines([
      { category: t.category || "uncategorized", amount: firstLine.toFixed(2), description: t.description || "" },
      { category: "uncategorized", amount: Number((amount - firstLine).toFixed(2)).toFixed(2), description: "" },
    ]);
    if (!t.is_split) return;
    try {
      const { data } = await api.get(`/transactions/${t.transaction_id}/splits`);
      const existing = data.splits || data || [];
      if (existing.length) {
        setSplitLines(existing.map((line) => ({
          category: line.category || "uncategorized",
          amount: Math.abs(Number(line.amount || 0)).toFixed(2),
          description: line.description || line.note || "",
        })));
      }
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not load split lines");
    }
  }, []);
  const pairTransfer = useCallback((t) => {
    const selectedOtherId = Array.from(selectedIds).find((id) => {
      const other = allDisplayed.find(row => row.transaction_id === id);
      return other && id !== t.transaction_id && !other.transfer_pair_id && Number(t.amount || 0) * Number(other.amount || 0) < 0;
    });
    setTransferTx(t);
    setTransferTargetId(selectedOtherId || "");
    setTransferOpen(true);
  }, [selectedIds, allDisplayed]);

  const submit = useCallback(async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    const signed = form.is_income ? Math.abs(amt) : -Math.abs(amt);
    const shouldOpenSplit = form.entry_mode === "split" && !editingId;
    const shouldOpenTransferPair = form.entry_mode === "transfer" && !editingId;
    if (editingId) {
      const payload = { description: form.description, amount: signed, category: form.category || undefined, date: form.date || today(), merchant: form.merchant || undefined, notes: form.notes || undefined, is_income: form.is_income, is_transfer: form.is_transfer || undefined, exclude_from_maaser: form.exclude_from_maaser || undefined, account_id: form.account_id || undefined };
      const old = txsRef.current.find(t => t.transaction_id === editingId);
      setTxs(prev => prev.map(t => t.transaction_id === editingId ? { ...t, ...payload } : t));
      setOpen(false); setEditingId(null);
      console.log("[DEBUG_EDIT] PATCH /transactions/" + editingId, JSON.stringify(payload));
      withUndo({
        action: async () => {
          const res = await api.patch(`/transactions/${editingId}`, payload);
          console.log("[DEBUG_EDIT] PATCH response status:", res.status, "data:", JSON.stringify(res.data));
        },
        undo: async () => {
          if (old) { await api.patch(`/transactions/${editingId}`, { description: old.description, amount: old.amount, category: old.category || undefined, is_income: old.is_income, account_id: old.account_id || undefined }); }
          await load();
        },
        onError: () => { if (old) setTxs(prev => prev.map(t => t.transaction_id === editingId ? old : t)); load(); },
        successMsg: "Transaction updated",
        errorMsg: "Could not update",
      });
    } else if ((classification || form.budget_type) && !shouldOpenSplit && !shouldOpenTransferPair) {
      if (!form.account_id) { toast.error("Select an account first"); return; }
      const suggestions = classification?.suggestions || [];
      const chosenIdx = suggestions.findIndex(s => s.category === form.category);
      setOpen(false); setEditingId(null);
      const optimisticTx = { transaction_id: `optimistic-${Date.now()}`, description: form.description, amount: signed, category: form.category, date: form.date || today(), source: "manual", approval_status: "approved", category_approval_status: "approved", notes: form.notes, account_id: form.account_id };
      setTxs(prev => [optimisticTx, ...prev]);
      setTotal(prev => prev + 1);
      if (signed > 0) setIncomeTotal(prev => Number(prev || 0) + signed);
      else setExpenseTotal(prev => Number(prev || 0) + Math.abs(signed));
      try {
        const { data } = await api.post("/budget-system/approve", {
          description: form.description.trim(), amount: signed,
          budget_type: form.budget_type || suggestions[0]?.budget_type || "day_to_day",
          occasion: form.occasion || suggestions[0]?.occasion || "Monthly Living",
          category: form.category || suggestions[0]?.category || "uncategorized",
          merchant: form.merchant || suggestions[0]?.merchant || "",
          account_id: form.account_id,
          suggestion_id: classification?.suggestion_id || null,
          suggestion_index: chosenIdx >= 0 ? chosenIdx : null,
          save_as_recurring: saveAsRecurring,
        });
        setTxs(prev => prev.map(t => t.transaction_id === optimisticTx.transaction_id ? data : t));
        toast.success("Transaction added");
      } catch {
        setTxs(prev => prev.filter(t => t.transaction_id !== optimisticTx.transaction_id));
        setTotal(prev => Math.max(0, prev - 1));
        if (signed > 0) setIncomeTotal(prev => Math.max(0, Number(prev || 0) - signed));
        else setExpenseTotal(prev => Math.max(0, Number(prev || 0) - Math.abs(signed)));
        toast.error("Could not add");
      }
    } else {
      if (!form.account_id) { toast.error("Select an account first"); return; }
      const payload = { description: form.description, amount: signed, category: form.category || undefined, date: form.date || today(), merchant: form.merchant || undefined, notes: form.notes || undefined, account_id: form.account_id, is_income: form.is_income, is_transfer: form.is_transfer || undefined, exclude_from_maaser: form.exclude_from_maaser || undefined };
      setOpen(false); setEditingId(null);
      const optimisticTx = { transaction_id: `optimistic-${Date.now()}`, ...payload, date: payload.date, source: "manual", approval_status: "approved", category_approval_status: "approved" };
      setTxs(prev => [optimisticTx, ...prev]);
      if (!payload.is_transfer) {
        setTotal(prev => prev + 1);
        if (signed > 0) setIncomeTotal(prev => Number(prev || 0) + signed);
        else setExpenseTotal(prev => Number(prev || 0) + Math.abs(signed));
      }
      withUndo({
        action: async () => {
          const { data } = await api.post("/transactions", payload);
          setTxs(prev => prev.map(t => t.transaction_id === optimisticTx.transaction_id ? data : t));
          if (shouldOpenSplit) splitTx(data);
          if (shouldOpenTransferPair) pairTransfer(data);
        },
        undo: async () => {
          await load();
        },
        onError: () => {
          setTxs(prev => prev.filter(t => t.transaction_id !== optimisticTx.transaction_id));
          if (!payload.is_transfer) {
            setTotal(prev => Math.max(0, prev - 1));
            if (signed > 0) setIncomeTotal(prev => Math.max(0, Number(prev || 0) - signed));
            else setExpenseTotal(prev => Math.max(0, Number(prev || 0) - Math.abs(signed)));
          }
        },
        successMsg: "Transaction added",
        errorMsg: "Could not add",
      });
    }
    setForm(emptyForm); setClassification(null); setSaveAsRecurring(false);
  }, [editingId, form, load, classification, saveAsRecurring, pairTransfer, splitTx]);

  const clearClassification = useCallback(() => { setClassification(null); setSaveAsRecurring(false); }, []);

  const transferCandidates = useMemo(() => {
    if (!transferTx) return [];
    const baseAmount = Number(transferTx.amount || 0);
    return allDisplayed.filter((row) => {
      if (row.transaction_id === transferTx.transaction_id || row.transfer_pair_id) return false;
      return Number(row.amount || 0) * baseAmount < 0;
    });
  }, [allDisplayed, transferTx]);
  const splitOriginalAmount = Math.abs(Number(splitTxDraft?.amount || 0));
  const splitEnteredTotal = useMemo(
    () => splitLines.reduce((sum, line) => sum + Math.abs(Number(line.amount || 0)), 0),
    [splitLines]
  );
  const splitDifference = Number((splitOriginalAmount - splitEnteredTotal).toFixed(2));
  const someSelected = selectedIds.size > 0;
  const allDisplayedSelected = useMemo(
    () => allDisplayed.length > 0 && allDisplayed.every(t => selectedIds.has(t.transaction_id)),
    [allDisplayed, selectedIds]
  );

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allDisplayedSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allDisplayed.map(t => t.transaction_id)));
    }
  }, [allDisplayedSelected, allDisplayed]);

  // â”€â”€ Desktop power-user keyboard shortcuts â”€â”€
  useKeyboardShortcut("n", () => { if (!open) openAdd(); }, { enabled: !open });
  useKeyboardShortcut("/", () => { searchRef.current?.focus(); });
  useKeyboardShortcut("r", () => { load(); }, { when: !open });
  useKeyboardShortcut("b", () => {
    if (selectedIds.size > 0) { setSelectedIds(new Set()); }
    else { setSelectedIds(new Set(allDisplayed.map(t => t.transaction_id))); }
  });
  useKeyboardShortcut({ key: "Backspace", meta: true }, () => {
    if (selectedIds.size > 0 && !open) {
      showConfirm("Delete transactions", `Delete ${selectedIds.size} selected transactions?`, async () => {
        try { await withUndo({ action: api.post("/transactions/bulk-delete", { transaction_ids: Array.from(selectedIds) }), undo: api.post("/transactions/undo-bulk-delete", { transaction_ids: Array.from(selectedIds) }), successMsg: `Deleted ${selectedIds.size} transactions`, errorMsg: "Delete failed", undoLabel: "Undo" }); setSelectedIds(new Set()); await load(); } catch { toast.error("Delete failed"); }
      });
    }
  }, { enabled: !open });
  useKeyboardShortcut("j", () => {
    if (open) return;
    setFocusedIndex(i => Math.min((i < 0 ? -1 : i) + 1, allDisplayed.length - 1));
  });
  useKeyboardShortcut("k", () => {
    if (open) return;
    setFocusedIndex(i => Math.max(-1, i - 1));
  });
  useKeyboardShortcut("Escape", () => {
    setSelectedIds(new Set()); setFocusedIndex(-1);
    if (swipedId) setSwipedId(null);
  }, { enabled: !open });
  useKeyboardShortcut("[", () => {
    if (offset > 0 && !open) setOffset(o => Math.max(0, o - limit));
  });
  useKeyboardShortcut("]", () => {
    if (offset + limit < total && !open) setOffset(o => o + limit);
  });

  // Listen for command-palette-triggered actions
  useEffect(() => {
    const handler = (e) => {
      const { action } = e.detail || {};
      if (action === "open-new-transaction") openAdd();
      if (action === "focus-search") searchRef.current?.focus();
    };
    window.addEventListener("app-quick-action", handler);
    return () => window.removeEventListener("app-quick-action", handler);
  }, [openAdd]);

  const bulkCategory = useCallback(async (cat) => {
    if (!cat || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    withUndo({
      action: () => api.post("/transactions/bulk-category", { transaction_ids: ids, category: cat }),
      undo: async () => { await api.post("/transactions/bulk-category", { transaction_ids: ids, category: "" }); await load(); },
      successMsg: `${ids.length} transaction${ids.length > 1 ? "s" : ""} categorised`,
      errorMsg: "Could not update categories",
    });
    setSelectedIds(new Set());
    await load();
  }, [selectedIds, load]);

  const bulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    showConfirm(
      `Delete ${selectedIds.size} transaction${selectedIds.size > 1 ? "s" : ""}?`,
      "This action cannot be undone.",
      async () => {
        try {
          const { data } = await api.post("/transactions/bulk-delete", { transaction_ids: Array.from(selectedIds) });
          toast.success(`Deleted ${data.deleted}`);
          setSelectedIds(new Set());
          await load();
        } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Could not delete"); }
      }
    );
  }, [selectedIds, load, showConfirm]);

  const duplicateSelected = useCallback(async () => {
    const rows = (aiResults?.transactions || txs).filter((transaction) => selectedIds.has(transaction.transaction_id));
    if (rows.length === 0) return;
    try {
      await Promise.all(rows.map((transaction) => api.post("/transactions", {
        amount: transaction.amount,
        currency: transaction.currency || "GBP",
        description: transaction.description || transaction.merchant || "Transaction",
        merchant: transaction.merchant || undefined,
        category: transaction.category || undefined,
        date: today(),
        account_id: transaction.account_id,
        is_income: Number(transaction.amount) > 0,
        is_transfer: Boolean(transaction.is_transfer),
        notes: transaction.notes || undefined,
        source: "manual",
      })));
      toast.success(`Duplicated ${rows.length} transaction${rows.length > 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      await load();
    } catch (error) {
      toast.error(formatApiError(error?.response?.data?.detail) || "Could not duplicate transactions");
    }
  }, [aiResults, load, selectedIds, txs]);

  const clearAllMatching = useCallback(async () => {
    const label = filters.source ? `all "${SOURCE_LABELS[filters.source] || filters.source}"` : "all matching";
    showConfirm(
      `Delete ${label} (${total})?`,
      "This will permanently remove all matching transactions.",
      async () => {
        try {
          const body = {};
          if (filters.source) body.source = filters.source;
          if (filters.category) body.category = filters.category;
          if (filters.tx_type) body.tx_type = filters.tx_type;
          if (filters.search) body.search = filters.search;
          if (filters.date_from) body.date_from = filters.date_from;
          if (filters.date_to) body.date_to = filters.date_to;
          const amountMin = parseFloat(filters.amount_min);
          if (Number.isFinite(amountMin)) body.amount_min = amountMin;
          const amountMax = parseFloat(filters.amount_max);
          if (Number.isFinite(amountMax)) body.amount_max = amountMax;
          if (filters.account_id) body.account_id = filters.account_id;
          const { data } = await api.post("/transactions/clear", body);
          toast.success(`Deleted ${data.deleted}`);
          setSelectedIds(new Set());
          await load();
        } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Could not clear"); }
      }
    );
  }, [filters, total, load, showConfirm]);

  const txsRef = useRef(txs);
  txsRef.current = txs;
  const del = useCallback(async (id) => {
    const tx = txsRef.current.find(t => t.transaction_id === id);
    if (!tx) return;
    setTxs(prev => prev.filter(t => t.transaction_id !== id));
    withUndo({
      action: () => api.delete(`/transactions/${id}`),
      undo: async () => {
        setTxs(prev => [...prev, tx]);
        await api.post("/transactions", tx);
      },
      onError: () => setTxs(prev => [...prev, tx]),
      successMsg: "Transaction deleted",
      errorMsg: "Could not delete",
    });
  }, []);

  const approveTx = useCallback(async (t, categoryOverride) => {
    const category = categoryOverride || t.ai_selected_category || t.category || "uncategorized";
    const optimistic = { ...t, category, ai_selected_category: category, approval_status: "approved", category_approval_status: "approved" };
    setTxs(prev => prev.map(row => row.transaction_id === t.transaction_id ? optimistic : row));
    setReviewTx(optimistic);
    setReviewOpen(false);
    toast.success("Transaction approved");
    try {
      const { data } = await api.patch(`/transactions/${t.transaction_id}/approve-category`, {
        category,
        approve_transaction: true,
      });
      setTxs(prev => prev.map(row => row.transaction_id === t.transaction_id ? data : row));
    } catch (e) {
      setTxs(prev => prev.map(row => row.transaction_id === t.transaction_id ? t : row));
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not approve");
    }
  }, []);

  const classifySavedTx = useCallback(async (t) => {
    setReviewTx(t);
    setReviewSuggestions([]);
    setReviewOpen(true);
    setReviewLoading(true);
    try {
      const { data } = await api.post(`/transactions/${t.transaction_id}/classify`);
      const nextTx = data.transaction || t;
      const suggestions = data.suggestions || nextTx.ai_suggested_categories?.suggestions || [];
      setTxs(prev => prev.map(row => row.transaction_id === t.transaction_id ? nextTx : row));
      setReviewTx(nextTx);
      setReviewSuggestions(suggestions.slice(0, 3));
      toast.success("AI suggestions added");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "AI classification failed");
    } finally {
      setReviewLoading(false);
    }
  }, []);

  const bulkApprove = useCallback(async (highConfidenceOnly = false) => {
    try {
      const candidates = selectedIds.size
        ? allDisplayed.filter((transaction) => selectedIds.has(transaction.transaction_id))
        : allDisplayed;
      const ids = candidates
        .filter((transaction) => transaction.approval_status === "unapproved" || transaction.category_approval_status === "unapproved")
        .map((transaction) => transaction.transaction_id);
      if (ids.length === 0) {
        toast.info("No selected transactions need approval");
        return;
      }
      const { data } = await api.post("/transactions/bulk-approve", {
        transaction_ids: ids,
        high_confidence_only: highConfidenceOnly,
      });
      toast.success(`Approved ${data.approved}`);
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not approve transactions");
    }
  }, [selectedIds, allDisplayed, load]);

  const updateSplitLine = useCallback((index, field, value) => {
    setSplitLines(prev => prev.map((line, i) => i === index ? { ...line, [field]: value } : line));
  }, []);

  const addSplitLine = useCallback(() => {
    setSplitLines(prev => [...prev, { category: "uncategorized", amount: "0.00", description: "" }]);
  }, []);

  const removeSplitLine = useCallback((index) => {
    setSplitLines(prev => prev.filter((_, i) => i !== index));
  }, []);

  const saveSplit = useCallback(async () => {
    if (!splitTxDraft) return;
    const splits = splitLines.map((line) => ({
      category: line.category,
      amount: Math.abs(Number(line.amount || 0)),
      description: line.description || splitTxDraft.description || "",
    })).filter(line => line.category && Number.isFinite(line.amount) && line.amount > 0);
    if (splits.length < 2) {
      toast.error("Add at least two valid split lines");
      return;
    }
    const nextTotal = splits.reduce((sum, line) => sum + line.amount, 0);
    if (Math.abs(nextTotal - splitOriginalAmount) > 0.01) {
      toast.error("Split total must match the transaction amount");
      return;
    }
    setSplitSaving(true);
    try {
      const { data } = await api.put(`/transactions/${splitTxDraft.transaction_id}/splits`, { splits });
      setTxs(prev => prev.map(row => row.transaction_id === splitTxDraft.transaction_id ? { ...row, is_split: true, split_count: data.splits.length } : row));
      setSplitOpen(false);
      toast.success("Transaction split");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not split transaction");
    } finally {
      setSplitSaving(false);
    }
  }, [splitTxDraft, splitLines, splitOriginalAmount]);




  const saveTransferPair = useCallback(async () => {
    if (!transferTx || !transferTargetId) {
      toast.error("Choose a matching transfer transaction");
      return;
    }
    const other = allDisplayed.find(row => row.transaction_id === transferTargetId);
    if (!other || Number(transferTx.amount || 0) * Number(other.amount || 0) >= 0) {
      toast.error("Choose one outgoing expense and one incoming income");
      return;
    }
    const outgoing = Number(transferTx.amount) < 0 ? transferTx.transaction_id : transferTargetId;
    const incoming = Number(transferTx.amount) > 0 ? transferTx.transaction_id : transferTargetId;
    setTransferSaving(true);
    try {
      const { data } = await api.post("/transactions/transfer-pairs", {
        outgoing_transaction_id: outgoing,
        incoming_transaction_id: incoming,
      });
      setTxs(prev => prev.map(row => [outgoing, incoming].includes(row.transaction_id) ? { ...row, is_transfer: true, tx_type: "transfer", transfer_pair_id: data.transfer_pair_id } : row));
      setSelectedIds(new Set());
      setTransferOpen(false);
      toast.success("Transfer paired");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not pair transfer");
    } finally {
      setTransferSaving(false);
    }
  }, [transferTx, transferTargetId, allDisplayed]);

  const unpairTransfer = useCallback(async (t) => {
    if (!t.transfer_pair_id) return;
    try {
      await api.delete(`/transactions/transfer-pairs/${t.transfer_pair_id}`);
      setTxs(prev => prev.map(row => row.transfer_pair_id === t.transfer_pair_id ? { ...row, is_transfer: false, tx_type: null, transfer_pair_id: null } : row));
      toast.success("Transfer unpaired");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not unpair transfer");
    }
  }, []);

  const runAiSearch = useCallback(async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true); setAiResults(null);
    try {
      const { data } = await api.post("/transactions/ai-search", null, { params: { q: aiQuery } });
      setAiResults(data);
      if (data.transactions.length === 0) toast.info("No AI matches found");
      else toast.success(`AI found ${data.total} matches`);
    } catch (e) { toast.error(formatApiError(e) || "AI search failed"); }
    finally { setAiLoading(false); }
  }, [aiQuery]);

  const netTotal = incomeTotal - expenseTotal;
  const [showSearch, setShowSearch] = useState(false);

  const accountsById = useMemo(
    () => Object.fromEntries(accounts.map((account) => [account.account_id, account])),
    [accounts],
  );

  const tabCounts = useMemo(() => {
    const approved = monthRows.filter((transaction) => (
      (transaction.approval_status || "approved") === "approved" &&
      (transaction.category_approval_status || "approved") === "approved"
    ));
    return {
      all: monthRows.length || total,
      expenses: monthRows.filter((transaction) => Number(transaction.amount) < 0 && !transaction.is_transfer).length,
      income: monthRows.filter((transaction) => Number(transaction.amount) > 0 && !transaction.is_transfer).length,
      transfers: monthRows.filter((transaction) => transaction.is_transfer).length,
      unapproved: monthRows.filter((transaction) => (
        transaction.approval_status === "unapproved" || transaction.category_approval_status === "unapproved"
      )).length,
      approved: approved.length,
    };
  }, [monthRows, total]);

  const monthTotals = useMemo(() => {
    const totals = monthRows.reduce((result, transaction) => {
      if (transaction.is_transfer) return result;
      const amount = Number(transaction.amount) || 0;
      if (amount > 0) result.income += amount;
      else result.expenses += Math.abs(amount);
      return result;
    }, { income: 0, expenses: 0 });
    return { ...totals, net: totals.income - totals.expenses };
  }, [monthRows]);

  const previousMonthTotals = useMemo(() => {
    return previousMonthRows.reduce((result, transaction) => {
      if (transaction.is_transfer) return result;
      const amount = Number(transaction.amount) || 0;
      if (amount > 0) result.income += amount;
      else result.expenses += Math.abs(amount);
      return result;
    }, { income: 0, expenses: 0 });
  }, [previousMonthRows]);

  const sparklines = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const days = new Date(year, monthNumber, 0).getDate();
    const income = Array.from({ length: days }, () => 0);
    const expenses = Array.from({ length: days }, () => 0);
    monthRows.forEach((transaction) => {
      if (transaction.is_transfer) return;
      const day = Number(String(transaction.date || "").slice(8, 10));
      if (!day || day > days) return;
      const amount = Number(transaction.amount) || 0;
      if (amount > 0) income[day - 1] += amount;
      else expenses[day - 1] += Math.abs(amount);
    });
    let running = 0;
    const net = income.map((value, index) => {
      running += value - expenses[index];
      return running;
    });
    return { income, expenses, net };
  }, [month, monthRows]);

  const deltaFor = (current, previous) => {
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 100);
  };
  const incomeDelta = deltaFor(monthTotals.income, previousMonthTotals.income);
  const expenseDelta = deltaFor(monthTotals.expenses, previousMonthTotals.expenses);
  const previousMonthName = MONTH_NAMES[Number(addMonth(month, -1).split("-")[1]) - 1];

  const selectedTransactions = (aiResults?.transactions || txs).filter((transaction) => selectedIds.has(transaction.transaction_id));
  const selectedTotal = selectedTransactions.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
  const selectedUnapprovedCount = selectedTransactions.filter((transaction) => (
    transaction.approval_status === "unapproved" || transaction.category_approval_status === "unapproved"
  )).length;

  const mobileRows = aiResults?.transactions || txs;
  const panelTransaction = inspectTx || txs[0] || null;
  const mobileDateGroups = useMemo(() => {
    if (filters.sort !== "date" || mobileRows.length === 0) return null;
    return mobileRows.reduce((groups, tx) => {
      const date = tx.date?.slice(0, 10) || "";
      const last = groups[groups.length - 1];
      if (last?.date === date) last.items.push(tx);
      else groups.push({ date, items: [tx] });
      return groups;
    }, []);
  }, [mobileRows, filters.sort]);

  const exportCsv = useCallback(() => {
    const rows = aiResults?.transactions || txs;
    if (!rows.length) { toast.info("No transactions to export"); return; }
    const header = ["Date", "Description", "Category", "Amount", "Source"];
    const lines = rows.map(t => [
      t.date?.slice(0, 10) ?? "",
      `"${(t.description || "").replace(/"/g, '""')}"`,
      t.category || "",
      t.amount,
      t.source || "",
    ].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Penni-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} transactions`);
  }, [txs, aiResults]);

  return (
    <div className="page-stack pb-4" data-testid="transactions-root">

      <div className={`grid items-start gap-4 ${activeTab === "ledger" && inspectorOpen ? "xl:grid-cols-[minmax(0,1fr)_304px]" : ""}`}>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-4 pl-0 lg:flex-row lg:items-start lg:justify-between xl:pl-[14px]">
            <div className="min-w-0">
              <h1 className="text-[30px] font-semibold leading-none tracking-[-0.045em]">
                {activeTab === "maaser" ? "Maaser" : "Transactions"}
              </h1>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {activeTab === "maaser"
                  ? "Track your giving, review the audit trail and keep your obligation up to date."
                  : "View, search and manage all your income, expenses and transfers."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:mt-2">
              {activeTab === "maaser" ? (
                <button
                  type="button"
                  onClick={() => setActiveTab("ledger")}
                  className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-border bg-card px-3 text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to transactions
                </button>
              ) : (
                <>
                  <div className="inline-flex h-[36px] items-center rounded-[10px] border border-border bg-card px-1 shadow-[0_1px_2px_hsl(var(--foreground)/0.03)]">
                    <button
                      type="button"
                      onClick={() => applyGregorianMonth(addMonth(month, -1))}
                      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[112px] px-1 text-center text-[12px] font-medium">{monthLabel}</span>
                    <button
                      type="button"
                      onClick={() => applyGregorianMonth(addMonth(month, 1))}
                      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompareOpen(true)}
                    className="inline-flex h-[36px] items-center justify-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-[12px] font-medium text-foreground transition hover:bg-secondary/70 shadow-[0_1px_2px_hsl(var(--foreground)/0.03)] active:scale-[0.98]"
                  >
                    <BarChart3 className="h-3.5 w-3.5 text-topaz" />
                    <span>Compare</span>
                  </button>
                  <button
                    type="button"
                    onClick={openAdd}
                    data-testid="add-transaction"
                    className="inline-flex h-[36px] items-center justify-center gap-1.5 rounded-[10px] bg-emerald px-3.5 text-[12px] font-semibold text-white shadow-[0_4px_12px_hsl(var(--emerald)/0.25)] transition hover:bg-emerald/90 active:scale-[0.98]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add transaction</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
                        aria-label="Transaction options"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setCompareOpen(true)}>
                        <BarChart3 className="mr-2 h-4 w-4" /> Compare periods
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={exportCsv}>
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowPie(true)}>
                        <PieChartIcon className="mr-2 h-4 w-4" /> Spend breakdown
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => openAssistant({ prompt: "Help me understand my recent transactions" })}>
                        <Sparkles className="mr-2 h-4 w-4" /> Ask Penni
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setActiveTab("maaser")}>
                        <Star className="mr-2 h-4 w-4" /> Maaser ledger
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>

          {activeTab === "ledger" && (
            <>
              <div className="grid gap-[16px] px-0 sm:grid-cols-3 xl:px-[14px] 2xl:grid-cols-[276px_276px_minmax(0,1fr)]">
                <div className="surface rounded-[16px] p-3.5">
                    <div className="grid min-h-[58px] grid-cols-[38px_minmax(0,1fr)] items-center gap-3 2xl:grid-cols-[38px_minmax(0,1fr)_90px]">
                    <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-emerald/10 text-emerald">
                      <TrendingUp className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10.5px] text-muted-foreground">Income</p>
                      <p className="money-tabular mt-0.5 truncate text-[23px] font-semibold leading-none tracking-[-0.03em]">{formatCurrency(monthTotals.income || incomeTotal)}</p>
                      {incomeDelta !== null ? (
                        <p className={`mt-1.5 text-[10px] font-medium ${incomeDelta >= 0 ? "text-emerald" : "text-ruby"}`}>
                          {incomeDelta >= 0 ? "\u2191" : "\u2193"} {Math.abs(incomeDelta)}% vs {previousMonthName?.slice(0, 3)}
                        </p>
                      ) : null}
                    </div>
                    <div className="hidden 2xl:block"><Sparkline values={sparklines.income} height={38} stroke="hsl(var(--emerald))" /></div>
                  </div>
                </div>
                <div className="surface rounded-[16px] p-3.5">
                    <div className="grid min-h-[58px] grid-cols-[38px_minmax(0,1fr)] items-center gap-3 2xl:grid-cols-[38px_minmax(0,1fr)_90px]">
                    <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-ruby/10 text-ruby">
                      <TrendingDown className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10.5px] text-muted-foreground">Expenses</p>
                      <p className="money-tabular mt-0.5 truncate text-[23px] font-semibold leading-none tracking-[-0.03em]">{formatCurrency(monthTotals.expenses || expenseTotal)}</p>
                      {expenseDelta !== null ? (
                        <p className={`mt-1.5 text-[10px] font-medium ${expenseDelta > 0 ? "text-ruby" : "text-emerald"}`}>
                          {expenseDelta > 0 ? "\u2191" : "\u2193"} {Math.abs(expenseDelta)}% vs {previousMonthName?.slice(0, 3)}
                        </p>
                      ) : null}
                    </div>
                    <div className="hidden 2xl:block"><Sparkline values={sparklines.expenses} height={38} stroke="hsl(var(--ruby))" /></div>
                  </div>
                </div>
                <div className="surface rounded-[16px] p-3.5">
                    <div className="grid min-h-[58px] grid-cols-[38px_minmax(0,1fr)] items-center gap-3 2xl:grid-cols-[38px_minmax(0,1fr)_90px]">
                    <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-secondary text-muted-foreground">
                      <Calculator className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10.5px] text-muted-foreground">Net</p>
                      <p className={`money-tabular mt-0.5 truncate text-[23px] font-semibold leading-none tracking-[-0.03em] ${monthTotals.net >= 0 ? "text-emerald" : "text-ruby"}`}>
                        {formatCurrency(monthTotals.net || netTotal, { signed: true })}
                      </p>
                      <p className="mt-1.5 text-[10px] text-muted-foreground">{monthLabel}</p>
                    </div>
                    <div className="hidden 2xl:block"><Sparkline values={sparklines.net} height={38} stroke={monthTotals.net >= 0 ? "hsl(var(--emerald))" : "hsl(var(--ruby))"} /></div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-[11px]">
                <button
                  type="button"
                  onClick={() => setShowSearch((visible) => !visible)}
                  className={`mr-1 inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[9px] border px-2.5 text-[11px] font-medium transition ${
                    showSearch || filters.search
                      ? "border-emerald/30 bg-emerald/10 text-emerald"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label="Search transactions"
                >
                  <Search className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Search</span>
                </button>
                {showSearch ? (
                  <div className="relative w-full sm:w-48">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      ref={searchRef}
                      value={searchInput}
                      onChange={(event) => { setSearchInput(event.target.value); debouncedSetSearch(event.target.value); }}
                      placeholder="Search transactions..."
                      className="h-9 w-full rounded-[9px] border border-border bg-card pl-8 pr-8 text-[11.5px] outline-none transition focus:border-emerald/40 focus:ring-2 focus:ring-emerald/10"
                    />
                    {filters.search ? (
                      <button onClick={() => { setSearchInput(""); setFilter("search", ""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="inline-flex h-9 w-[218px] shrink-0 items-center gap-1.5 rounded-[9px] border border-border bg-card px-2.5 text-[11px] font-medium text-foreground transition hover:bg-secondary/50">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{rangeLabel}</span>
                      <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => applyGregorianMonth(fmtMonth(new Date().getFullYear(), String(new Date().getMonth() + 1)))}>This month</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => applyGregorianMonth(addMonth(fmtMonth(new Date().getFullYear(), String(new Date().getMonth() + 1)), -1))}>Last month</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => applyGregorianMonth(addMonth(fmtMonth(new Date().getFullYear(), String(new Date().getMonth() + 1)), -2))}>Two months ago</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setMonth(fmtMonth(new Date().getFullYear(), "01")); setFilters((previous) => ({ ...previous, date_from: `${new Date().getFullYear()}-01-01`, date_to: `${new Date().getFullYear()}-12-31` })); }}>This year</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <select value={filters.account_id} onChange={(event) => toggleFilter("account_id", event.target.value)} className="hidden h-9 w-[105px] shrink-0 rounded-[9px] border border-border bg-card px-2 text-[11px] font-medium outline-none focus:border-emerald/40 min-[1700px]:block">
                  <option value="">All Accounts</option>
                  {accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name}</option>)}
                </select>
                <CategoryCombobox
                  value={filters.category}
                  onChange={(value) => toggleFilter("category", value)}
                  categories={selectedCats.categories || selectedCats}
                  placeholder="All Categories"
                  className="hidden h-9 w-[112px] shrink-0 rounded-[9px] border border-border bg-card px-2 text-[11px] font-medium text-foreground min-[1700px]:flex"
                  allowClear
                  onCategoryCreated={loadCats}
                />
                <select value={filters.tx_type} onChange={(event) => { toggleFilter("tx_type", event.target.value); setLedgerTab(event.target.value === "expense" ? "expenses" : event.target.value === "income" ? "income" : event.target.value === "transfer" ? "transfers" : "all"); }} className="hidden h-9 w-[86px] shrink-0 rounded-[9px] border border-border bg-card px-2 text-[11px] font-medium outline-none focus:border-emerald/40 min-[1700px]:block">
                  <option value="">All Types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                  <option value="transfer">Transfer</option>
                </select>
                <select value={filters.approval_status} onChange={(event) => { toggleFilter("approval_status", event.target.value); setLedgerTab(event.target.value === "unapproved" ? "unapproved" : "all"); }} className="hidden h-9 w-[101px] shrink-0 rounded-[9px] border border-border bg-card px-2 text-[11px] font-medium outline-none focus:border-emerald/40 min-[1700px]:block">
                  <option value="">All Statuses</option>
                  <option value="approved">Approved</option>
                  <option value="unapproved">Unapproved</option>
                  <option value="failed">Failed</option>
                </select>
                <input
                  value={filters.merchant}
                  onChange={(event) => { setOffset(0); setFilters((previous) => ({ ...previous, merchant: event.target.value })); }}
                  placeholder="All Merchants"
                  className="hidden h-9 w-[100px] shrink-0 rounded-[9px] border border-border bg-card px-2 text-[11px] outline-none transition focus:border-emerald/40 min-[1700px]:block"
                />
                <Sheet>
                  <SheetTrigger asChild>
                    <button className={`grid h-9 w-8 shrink-0 place-items-center rounded-[9px] border transition ${
                      hasRefinements
                        ? "border-emerald/30 bg-emerald/10 text-emerald"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`} aria-label="Filters">
                      <Filter className="h-3.5 w-3.5" />
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full sm:max-w-md">
                    <SheetHeader>
                      <SheetTitle>Filters</SheetTitle>
                      <SheetDescription className="text-xs sm:text-sm">Refine your transaction list</SheetDescription>
                    </SheetHeader>
                    <div className="mt-4 space-y-4 sm:mt-6 sm:space-y-5">
                      <div className="flex items-center gap-2 sm:hidden">
                        <select value={filters.sort} onChange={(event) => setFilter("sort", event.target.value)} className="h-10 flex-1 rounded-xl border border-transparent bg-secondary/50 px-3 text-sm outline-none focus:border-ring">
                          <option value="date">Sort by date</option>
                          <option value="amount">Sort by amount</option>
                          <option value="description">Sort by description</option>
                        </select>
                        <button onClick={() => setFilter("order", filters.order === "desc" ? "asc" : "desc")} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-transparent bg-secondary/50 transition-colors hover:bg-secondary/80" aria-label="Toggle sort order">
                          {filters.order === "desc" ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                        </button>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Narrow results</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                          <select value={filters.account_id} onChange={(event) => toggleFilter("account_id", event.target.value)} className="h-10 rounded-xl border border-transparent bg-secondary/50 px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30">
                            <option value="">All accounts</option>
                            {accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name}</option>)}
                          </select>
                          <select value={filters.tx_type} onChange={(event) => { toggleFilter("tx_type", event.target.value); setLedgerTab(event.target.value === "expense" ? "expenses" : event.target.value === "income" ? "income" : event.target.value === "transfer" ? "transfers" : "all"); }} className="h-10 rounded-xl border border-transparent bg-secondary/50 px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30">
                            <option value="">All types</option>
                            <option value="income">Income</option>
                            <option value="expense">Expense</option>
                            <option value="transfer">Transfer</option>
                          </select>
                          <select value={filters.approval_status} onChange={(event) => { toggleFilter("approval_status", event.target.value); setLedgerTab(event.target.value === "unapproved" ? "unapproved" : "all"); }} className="h-10 rounded-xl border border-transparent bg-secondary/50 px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30">
                            <option value="">All statuses</option>
                            <option value="approved">Approved</option>
                            <option value="unapproved">Unapproved</option>
                            <option value="failed">Failed</option>
                          </select>
                          <Input value={filters.merchant} onChange={(event) => { setOffset(0); setFilters((previous) => ({ ...previous, merchant: event.target.value })); }} placeholder="Merchant" className="h-10 text-sm" />
                        </div>
                        <CategoryCombobox
                          value={filters.category}
                          onChange={(value) => toggleFilter("category", value)}
                          categories={selectedCats.categories || selectedCats}
                          placeholder="All categories"
                          className="h-10 w-full rounded-xl border border-transparent bg-secondary/50 px-3 text-sm text-foreground"
                          allowClear
                          onCategoryCreated={loadCats}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        <select value={filters.source} onChange={(event) => toggleFilter("source", event.target.value)} className="h-10 rounded-xl border border-transparent bg-secondary/50 px-4 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30">
                          <option value="">All sources</option>
                          {Object.entries(SOURCE_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
                        </select>
                        <Input type="number" min="0" step="0.01" placeholder="Min Â£" value={filters.amount_min} onChange={(event) => { setOffset(0); setFilters((previous) => ({ ...previous, amount_min: event.target.value })); }} className="h-10 text-sm" />
                        <Input type="number" min="0" step="0.01" placeholder="Max Â£" value={filters.amount_max} onChange={(event) => { setOffset(0); setFilters((previous) => ({ ...previous, amount_max: event.target.value })); }} className="h-10 text-sm" />
                        <Input type="date" value={filters.date_from} onChange={(event) => { setOffset(0); setFilters((previous) => ({ ...previous, date_from: event.target.value })); }} className="h-10 text-sm" />
                        <Input type="date" value={filters.date_to} onChange={(event) => { setOffset(0); setFilters((previous) => ({ ...previous, date_to: event.target.value })); }} className="h-10 text-sm" />
                      </div>
                      <div className="space-y-3 border-t border-border pt-4">
                        <p className="text-xs font-medium text-muted-foreground">AI search</p>
                        <div className="flex items-center gap-2">
                          <Input value={aiQuery} onChange={(event) => setAiQuery(event.target.value)} placeholder="e.g. 'grocery spending last month'" className="h-10 flex-1 text-sm" onKeyDown={(event) => event.key === "Enter" && runAiSearch()} />
                          <Button onClick={runAiSearch} disabled={aiLoading || !aiQuery.trim()} variant="outlinePill" size="pillSm">
                            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Search
                          </Button>
                        </div>
                        {aiResults ? (
                          <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-3 text-sm">
                            <p className="mb-1 font-medium text-emerald">AI results for &ldquo;{aiResults.query}&rdquo; ({aiResults.total} matches)</p>
                            <button onClick={() => { setAiResults(null); setAiQuery(""); }} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                          </div>
                        ) : null}
                      </div>
                      {hasRefinements && total > 0 ? (
                        <div className="flex items-center justify-between border-t border-border pt-4">
                          <p className="text-xs text-muted-foreground">{total} transaction{total !== 1 ? "s" : ""} match current filters</p>
                          <button onClick={clearAllMatching} className="rounded-full border border-ruby/40 px-3 py-1.5 text-xs text-ruby transition-colors hover:bg-ruby/5">
                            <Trash2 className="mr-1 inline h-3 w-3" /> Delete all {total}
                          </button>
                        </div>
                      ) : null}
                      <div className="flex justify-end border-t border-border pt-4">
                        <button onClick={clearAllFilters} className="text-sm text-muted-foreground hover:text-foreground">Clear all filters</button>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
                {hasRefinements ? <button onClick={clearAllFilters} className="ml-1.5 h-9 w-[87px] shrink-0 rounded-[9px] border border-border bg-card px-3 text-[11px] font-medium text-muted-foreground transition hover:text-foreground">
                  Reset
                </button> : null}
              </div>

              {activeFilters.filter((chip) => chip.key !== "date_from" && chip.key !== "date_to").length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {activeFilters.filter((chip) => chip.key !== "date_from" && chip.key !== "date_to").map((chip) => (
                    <span key={chip.key} className="inline-flex items-center gap-1 rounded-full border border-emerald/20 bg-emerald/10 px-2 py-0.5 text-[10px] text-emerald">
                      {chip.label}
                      <button onClick={() => { setFilter(chip.key, ""); setOffset(0); }} className="hover:text-emerald/80" aria-label={`Remove ${chip.label} filter`}><X className="h-2.5 w-2.5" /></button>
                    </span>
                  ))}
                  <button onClick={clearAllFilters} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">Clear</button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pt-[8px]">
                <div className="flex min-w-0 items-center gap-4 overflow-x-auto xl:pl-[14px]">
                  {[
                    { key: "all", label: "All Transactions", count: tabCounts.all },
                    { key: "expenses", label: "Expenses", count: tabCounts.expenses },
                    { key: "income", label: "Income", count: tabCounts.income },
                    { key: "transfers", label: "Transfers", count: tabCounts.transfers },
                    { key: "unapproved", label: "Unapproved", count: tabCounts.unapproved },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => selectLedgerTab(tab.key)}
                      className={`-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-[12px] transition ${
                        ledgerTab === tab.key
                          ? "border-emerald font-semibold text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${ledgerTab === tab.key ? "bg-emerald/10 text-emerald" : "bg-secondary text-muted-foreground"}`}>{tab.count}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pb-1 xl:pr-[10px]">
                  <select value={filters.sort} onChange={(event) => setFilter("sort", event.target.value)} className="h-8 rounded-[8px] border border-border bg-card px-2 text-[11px] font-medium outline-none">
                    <option value="date">Sort: Date (newest)</option>
                    <option value="amount">Sort: Amount</option>
                    <option value="description">Sort: Description</option>
                  </select>
                  <div className="flex overflow-hidden rounded-[8px] border border-border bg-card">
                    <button onClick={() => setViewMode("list")} className={`grid h-8 w-8 place-items-center transition ${viewMode === "list" ? "bg-emerald/10 text-emerald" : "text-muted-foreground hover:text-foreground"}`} aria-label="List view">
                      <List className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setViewMode("grid")} className={`grid h-8 w-8 place-items-center border-l border-border transition ${viewMode === "grid" ? "bg-emerald/10 text-emerald" : "text-muted-foreground hover:text-foreground"}`} aria-label="Grid view">
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

      {/* Spend breakdown pie chart */}
      {showPie && categorySpend.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/40 p-3 backdrop-blur-sm sm:rounded-2xl sm:p-5">
          <button onClick={() => setShowPie(!showPie)} className="flex items-center justify-between w-full text-left">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground sm:text-sm">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-muted/70 sm:h-6 sm:w-6"><PieChartIcon className="h-3 w-3 text-muted-foreground/80" /></span>
              Spend breakdown <span className="hidden text-xs font-normal text-muted-foreground min-[360px]:inline">Â· {monthLabel}</span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground min-[360px]:inline">{categorySpend.length} categories</span>
              {showPie ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" />}
            </div>
          </button>
          {showPie && (
            <React.Suspense fallback={<div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">Loading chartâ€¦</div>}>
              <CategoryPieChart data={categorySpend} />
            </React.Suspense>
          )}
        </div>
      )}

      {/* â”€â”€â”€ Tabs â”€â”€â”€ */}


      {/* â”€â”€â”€â”€â”€ Ledger tab â”€â”€â”€â”€â”€ */}
      {activeTab === "ledger" && <>
        {/* Transaction table */}
        <div className="surface overflow-hidden rounded-[14px] p-0">
          {loading ? (
            <SkeletonTable rows={8} className="p-3" />
          ) : (aiResults?.transactions || txs).length === 0 ? (
            <EmptyState icon={Receipt}
              title={filters.search || filters.category || aiResults ? "No matching transactions" : "No transactions yet"}
              description="Try different filters or add your first transaction."
            />
          ) : (
            <>
              {/* Mobile list */}
              <div className="block sm:hidden">
                {mobileDateGroups ? (
                  mobileDateGroups.map((group) => (
                    <section key={group.date || "unknown"}>
                      <div className="flex items-center justify-between border-y border-border/50 bg-secondary/25 px-4 py-1.5 first:border-t-0">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {transactionDayLabel(group.date)}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground/50">
                          {group.items.length}
                        </span>
                      </div>
                      <div className="divide-y divide-border/60">
                        {group.items.map((t) => (
                          <SwipeableCard
                            key={t.transaction_id}
                            t={t}
                            isSelected={selectedIds.has(t.transaction_id)}
                            swipedId={swipedId}
                            setSwipedId={setSwipedId}
                            onToggleSelect={toggleSelect}
                            onEdit={openEdit}
                            onInspect={openInspector}
                            onDelete={del}
                            onApprove={approveTx}
                            onClassify={classifySavedTx}
                            onSplit={splitTx}
                            onPairTransfer={pairTransfer}
                            onUnpairTransfer={unpairTransfer}
                          />
                        ))}
                      </div>
                    </section>
                  ))
                ) : (
                  <div className="divide-y divide-border/60">
                    {mobileRows.map((t) => (
                      <SwipeableCard
                        key={t.transaction_id}
                        t={t}
                        isSelected={selectedIds.has(t.transaction_id)}
                        swipedId={swipedId}
                        setSwipedId={setSwipedId}
                        onToggleSelect={toggleSelect}
                        onEdit={openEdit}
                            onInspect={openInspector}
                        onDelete={del}
                        onApprove={approveTx}
                        onClassify={classifySavedTx}
                        onSplit={splitTx}
                        onPairTransfer={pairTransfer}
                        onUnpairTransfer={unpairTransfer}
                        showDate
                      />
                    ))}
                  </div>
                )}
              </div>
              {viewMode === "grid" ? (
                <div className="hidden gap-3 p-3 sm:grid sm:grid-cols-2 xl:grid-cols-2">
                  {(aiResults?.transactions || txs).map((transaction) => {
                    const account = accountsById[transaction.account_id];
                    const negative = Number(transaction.amount) < 0;
                    const merchant = transaction.merchant || transaction.normalized_merchant || transaction.source_label;
                    const showsDistinctMerchant = merchant && merchant.trim().toLowerCase() !== (transaction.description || "").trim().toLowerCase();
                    return (
                      <button
                        key={transaction.transaction_id}
                        type="button"
                        onClick={() => openInspector(transaction)}
                        className={`rounded-xl border p-3 text-left transition hover:border-emerald/30 hover:bg-emerald/[0.03] ${selectedIds.has(transaction.transaction_id) ? "border-emerald/30 bg-emerald/5" : "border-border bg-card"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-medium">{transaction.description || merchant || "Transaction"}</p>
                            {showsDistinctMerchant ? <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{merchant}</p> : null}
                          </div>
                          <span className={`money-tabular shrink-0 text-[12px] font-semibold ${negative ? "text-ruby" : "text-emerald"}`}>{formatCurrency(transaction.amount, { signed: true })}</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
              <CategoryBadge category={transaction.category || "uncategorized"} size="sm" truncate showIcon={false} />
                          <span className="truncate text-[10.5px] text-muted-foreground">{account?.name || transaction.source_label || "Manual"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] font-medium text-muted-foreground">
                        <th className="w-[40px] px-2.5 py-2.5">
                          <input type="checkbox" checked={allDisplayedSelected} onChange={toggleSelectAll}
                            className="mx-auto block h-3.5 w-3.5 cursor-pointer rounded border-border accent-emerald" aria-label="Select all transactions" />
                        </th>
                        <th className="w-[111px] px-2 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Description</th>
                        <th className="w-[135px] px-2 py-2.5">Category</th>
                        <th className="w-[148px] px-2 py-2.5">Account</th>
                        <th className="w-[98px] px-2 py-2.5 text-right">Amount</th>
                        <th className="w-[123px] px-2 py-2.5">Status</th>
                        <th className="w-[57px] px-1 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(aiResults?.transactions || txs).map((t, idx) => (
                        <TransactionRow key={t.transaction_id} t={t}
                          account={accountsById[t.account_id]}
                          isSelected={selectedIds.has(t.transaction_id)}
                          isFocused={focusedIndex === idx}
                          onToggleSelect={toggleSelect} onEdit={openEdit}
                          onInspect={openInspector} onDelete={del}
                          onApprove={approveTx}
                          onClassify={classifySavedTx}
                          onSplit={splitTx}
                          onPairTransfer={pairTransfer}
                          onUnpairTransfer={unpairTransfer}
                          onSetFocus={() => setFocusedIndex(idx)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!aiResults && totalPages > 1 && (
                <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Showing {offset + 1}â€“{Math.min(offset + limit, total)} of {total}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
                      className="h-7 w-7 rounded-lg grid place-items-center border border-border hover:bg-secondary disabled:opacity-30 text-muted-foreground" aria-label="Previous page">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-muted-foreground min-w-[3rem] text-center">{currentPage} / {totalPages}</span>
                    <button onClick={() => setOffset(Math.min((totalPages - 1) * limit, offset + limit))} disabled={offset + limit >= total}
                      className="h-7 w-7 rounded-lg grid place-items-center border border-border hover:bg-secondary disabled:opacity-30 text-muted-foreground" aria-label="Next page">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </>}

        {activeTab === "ledger" && someSelected ? (
          <div className="surface sticky bottom-[14px] z-20 flex min-h-[56px] flex-wrap items-center gap-2 rounded-[12px] px-4 py-2.5 shadow-[0_18px_40px_-18px_hsl(var(--foreground)/0.28)]">
            <span className="mr-auto text-[11.5px] font-medium">
              {selectedIds.size} transaction{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <span className="mr-3 hidden text-[11.5px] text-muted-foreground sm:inline">
              Total: <span className={`money-tabular font-semibold ${selectedTotal < 0 ? "text-ruby" : "text-emerald"}`}>{formatCurrency(selectedTotal, { signed: true })}</span>
            </span>
            <button onClick={() => bulkApprove(false)} disabled={selectedUnapprovedCount === 0} className="inline-flex h-[34px] items-center gap-1.5 rounded-[8px] bg-emerald px-3 text-[11px] font-semibold text-white transition hover:bg-emerald/90 disabled:cursor-not-allowed disabled:opacity-45" aria-label={selectedUnapprovedCount === 0 ? "No selected transactions need approval" : `Approve ${selectedUnapprovedCount} selected transaction${selectedUnapprovedCount === 1 ? "" : "s"}`}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve{selectedUnapprovedCount > 0 ? ` ${selectedUnapprovedCount}` : ""}
            </button>
            <button onClick={() => selectedTransactions[0] && openEdit(selectedTransactions[0])} disabled={selectedTransactions.length !== 1} className="inline-flex h-[34px] items-center gap-1.5 rounded-[8px] border border-border bg-card px-3 text-[11px] font-medium transition hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-45" aria-label={selectedTransactions.length === 1 ? "Edit selected transaction" : "Select one transaction to edit"}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button onClick={duplicateSelected} className="inline-flex h-[34px] items-center gap-1.5 rounded-[8px] border border-border bg-card px-3 text-[11px] font-medium transition hover:bg-secondary/60">
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </button>
            <button onClick={bulkDelete} className="inline-flex h-[34px] items-center gap-1.5 rounded-[8px] bg-ruby px-3 text-[11px] font-semibold text-white transition hover:bg-ruby/90">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex h-[34px] items-center gap-1.5 rounded-[8px] border border-border bg-card px-3 text-[11px] font-medium transition hover:bg-secondary/60">
                  More <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Set category</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {Object.entries(groupCatsBySection(selectedCats.categories || [])).map(([section, categories]) => (
                      <React.Fragment key={section}>
                        <DropdownMenuLabel className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section}</DropdownMenuLabel>
                        {categories.map((category) => (
                          <DropdownMenuItem key={category.name} onClick={() => bulkCategory(category.name)}>{category.name}</DropdownMenuItem>
                        ))}
                      </React.Fragment>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setNewCategoryName(""); setNewCategoryModal(true); }}>
                      <Plus className="mr-2 h-4 w-4" /> Add custom category
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => bulkApprove(true)}>
                  <Star className="mr-2 h-4 w-4" /> Approve high confidence
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedIds(new Set())}>Clear selection</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
        </div>
        {activeTab === "ledger" && inspectorOpen ? (
          <aside className="sticky top-20 hidden xl:block">
            <TransactionInspectorPanel
              transaction={panelTransaction}
              account={panelTransaction ? accountsById[panelTransaction.account_id] : null}
              similarTransactions={panelTransaction ? (aiResults?.transactions || txs).filter((transaction) => (
                transaction.transaction_id !== panelTransaction.transaction_id &&
                (transaction.normalized_merchant || transaction.merchant || "").toLowerCase() === (panelTransaction.normalized_merchant || panelTransaction.merchant || "").toLowerCase()
              )).slice(0, 3) : []}
              onClose={() => { setInspectorOpen(false); setInspectTx(null); }}
              onEdit={(transaction) => { setInspectorOpen(false); setInspectTx(null); openEdit(transaction); }}
              onDelete={(id) => { setInspectorOpen(false); setInspectTx(null); del(id); }}
              onApprove={approveTx}
              onClassify={classifySavedTx}
              onSplit={splitTx}
              onPairTransfer={pairTransfer}
              onUnpairTransfer={unpairTransfer}
              onInspect={openInspector}
              onAsk={(transaction) => {
                setInspectorOpen(false);
                setInspectTx(null);
                openAssistant({ prompt: `Explain this transaction: ${transaction.description || transaction.merchant || "transaction"} for ${formatCurrency(transaction.amount)} on ${transaction.date}.` });
              }}
            />
          </aside>
        ) : null}
      </div>

      {/* â”€â”€â”€â”€â”€ Maaser tab â”€â”€â”€â”€â”€ */}
      {activeTab === "maaser" && <>
        {/* Summary Stats */}
        {maaserLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="rounded-2xl border border-border bg-background/60 p-4 animate-pulse">
                <div className="h-3 w-20 bg-secondary rounded mb-2" />
                <div className="h-7 w-16 bg-secondary rounded" />
              </div>
            ))}
          </div>
        ) : maaserSum ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Income to date</p>
              <p className="mt-1 text-2xl tracking-tight font-medium text-emerald">{fmt(maaserSum.total_income)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Maaser obligation ({maaserSum.percent}%)</p>
              <p className="mt-1 text-2xl tracking-tight font-medium text-topaz">{fmt(maaserSum.obligation)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Given so far</p>
              <p className="mt-1 text-2xl tracking-tight font-medium text-emerald">{fmt(maaserSum.given_total)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{maaserSum.credit > 0 ? "Credit (over-given)" : "Balance owed"}</p>
              <p className={`mt-1 text-2xl tracking-tight font-medium ${maaserSum.balance_owed > 0 ? "text-ruby" : "text-emerald"}`}>
                {fmt(maaserSum.balance_owed > 0 ? maaserSum.balance_owed : maaserSum.credit)}
              </p>
            </div>
          </div>
        ) : null}

        {/* Settings + Actions Row */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Input type="number" min={0} max={100} step={0.5}
            value={maaserCfg.percent}
            onChange={(e) => setMaaserCfg({ ...maaserCfg, percent: parseFloat(e.target.value) || 0 })}
            onBlur={() => handleMaaserSaveCfg(maaserCfg)}
            className="w-20 text-center font-mono"
            title="Maaser percent" />
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={maaserCfg.enabled} disabled={maaserBusy}
              onChange={(e) => handleMaaserSaveCfg({ ...maaserCfg, enabled: e.target.checked })}
              className="sr-only peer" />
            <span className="w-11 h-6 bg-secondary rounded-full peer-checked:bg-emerald relative transition-colors">
              <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform"
                style={{ transform: maaserCfg.enabled ? "translateX(20px)" : "translateX(0)" }} />
            </span>
            <span className="text-sm">{maaserCfg.enabled ? "On" : "Off"}</span>
          </label>
          {maaserSum?.balance_owed > 0 && (
            <button onClick={handleMaaserGive} disabled={maaserBusy}
              className="inline-flex items-center gap-1 text-sm px-4 py-2.5 rounded-full bg-emerald text-white hover:opacity-90 disabled:opacity-50 ml-auto">
              <CheckCircle2 className="h-3.5 w-3.5" /> Give {fmt(maaserSum.balance_owed)}
            </button>
          )}
          <button onClick={handleMaaserRecalc} disabled={maaserBusy}
            className="inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-full border border-border hover:border-emerald hover:text-emerald disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${maaserBusy ? "animate-spin" : ""}`} /> Recalculate
          </button>
          <button onClick={handleMaaserReset} disabled={maaserBusy}
            className="text-sm px-4 py-2.5 rounded-full border border-border hover:border-ruby hover:text-ruby disabled:opacity-50">
            Reset audit
          </button>
        </div>

        {/* Unified Maaser Activity */}
        <div className="rounded-xl border border-border bg-card/90 backdrop-blur-xl shadow-card overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between border-b border-border/60">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Star className="h-3.5 w-3.5 text-topaz" />
              Maaser Activity
            </h4>
            {!maaserLedgerLoading && (() => {
              const txIds = new Set(maaserLedger.filter(e => e.transaction_id).map(e => e.transaction_id));
              const extraIncome = maaserIncomeTxs.filter(t => !txIds.has(t.transaction_id));
              const extraCharity = maaserTzedakahTxs.filter(t => !txIds.has(t.transaction_id));
              const total = maaserLedger.length + extraIncome.length + extraCharity.length;
              return total > 0 && <span className="text-xs text-muted-foreground">{total} entries</span>;
            })()}
          </div>
          {maaserLedgerLoading ? (
            <SkeletonTable rows={6} className="p-3" />
          ) : (() => {
            const txIds = new Set(maaserLedger.filter(e => e.transaction_id).map(e => e.transaction_id));
            const extraIncome = maaserIncomeTxs.filter(t => !txIds.has(t.transaction_id));
            const extraCharity = maaserTzedakahTxs.filter(t => !txIds.has(t.transaction_id));
            const all = [
              ...maaserLedger.map(e => ({ ...e, _type: "ledger" })),
              ...extraIncome.map(t => ({ _type: "income", entry_id: `inc_${t.transaction_id}`, date: t.date, income_description: t.description || t.merchant || "â€”", income_category: t.category, income_amount: t.amount, maaser_due: 0, maaser_paid: 0, status: "income", transaction_id: t.transaction_id })),
              ...extraCharity.map(t => ({ _type: "charity", entry_id: `tzd_${t.transaction_id}`, date: t.date, income_description: t.description || t.merchant || "â€”", income_category: t.category || t.merchant || "Tzedakah", income_amount: 0, maaser_due: 0, maaser_paid: Math.abs(t.amount), status: "given", transaction_id: t.transaction_id, paid_to: t.merchant || "Tzedakah" })),
            ].sort((a, b) => {
              const da = a.date || a.income_date || "";
              const db = b.date || b.income_date || "";
              return db.localeCompare(da);
            });
            if (all.length === 0) return (
              <EmptyState icon={Star} title="No maaser activity" description="Income transactions, giving, and ledger entries will appear here." />
            );
            return (
              <div className="divide-y divide-border/60">
                {all.map(e => (
                  <div key={e.entry_id} className="px-4 py-3 flex items-center gap-3 text-sm hover:bg-secondary/20 transition-colors">
                    <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1 items-center">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {e.date || e.income_date ? new Date(e.date || e.income_date).toLocaleDateString("en-GB") : "-"}
                      </span>
                      <div className="min-w-0">
                        {e.income_description ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="truncate max-w-[200px]">{e.income_description}</span>
                            {e.income_category && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary capitalize">{e.income_category}</span>}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Manual entry</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        {e._type === "income" ? (
                          <span className="text-xs font-medium text-emerald shrink-0">+{fmt(e.income_amount)}</span>
                        ) : e._type === "charity" ? (
                          <span className="text-xs font-medium text-rose-600 shrink-0">-{fmt(e.maaser_paid)}</span>
                        ) : e._type === "ledger" && e.income_amount ? (
                          <>
                            <span className="text-xs text-muted-foreground shrink-0">
                              Income: {fmt(e.income_amount)}
                            </span>
                            {e.status === "given" ? (
                              <span className="text-xs font-medium text-rose-600 shrink-0">
                                Given: {fmt(e.maaser_paid)}
                              </span>
                            ) : (
                              <span className="text-xs shrink-0">
                                <span className="text-muted-foreground">Due: </span>
                                <span className="font-medium">{fmt(e.maaser_due)}</span>
                              </span>
                            )}
                          </>
                        ) : e.status === "given" ? (
                          <span className="text-xs font-medium text-rose-600 shrink-0">-{fmt(e.maaser_paid)}</span>
                        ) : (
                          <span className="text-xs"><span className="text-muted-foreground">Due: </span><span className="font-medium">{fmt(e.maaser_due)}</span></span>
                        )}
                        {e._type === "ledger" && e.status !== "given" && (
                          <span className="text-xs"><span className="text-muted-foreground">Paid: </span>
                            {e.status === "pending" ? <span className="text-amber-500 font-medium">Pending</span> : <span className="font-medium">{fmt(e.maaser_paid)}</span>}
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          e._type === "income" ? "bg-emerald/10 text-emerald" :
                          e._type === "charity" || (e._type === "ledger" && e.status === "given") ? "bg-rose-50 text-rose-600" :
                          e.status === "given" ? "bg-emerald/10 text-emerald" :
                          "bg-amber/10 text-amber-500"
                        }`}>
                          {e._type === "income" ? "Income" :
                           e._type === "charity" ? "Given" :
                           e.status === "given" ? "Given" : "Pending"}
                        </span>
                      </div>
                    </div>
                    {e._type === "ledger" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleMaaserEdit(e)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                          </DropdownMenuItem>
                          {e.status === "pending" && (
                            <DropdownMenuItem onClick={() => handleMaaserPay(e.entry_id)}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Mark Paid
                            </DropdownMenuItem>
                          )}
                          {e.income_amount && (
                            <DropdownMenuItem onClick={() => handleMaaserExclude(e.entry_id, e.transaction_id)}>
                              <X className="h-3.5 w-3.5 mr-2" /> Exclude from Maaser
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleMaaserDelete(e.entry_id)} className="text-ruby">
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Edit Modal */}
        {maaserEditEntry && (
          <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setMaaserEditEntry(null)}>
            <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl tracking-tight font-medium">Edit Maaser Entry</h3>
                <button onClick={() => setMaaserEditEntry(null)} className="p-3 rounded-lg hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="label-overline">Amount (Â£)</label>
                  <Input type="number" step="0.01" value={maaserEditAmount}
                    onChange={(e) => setMaaserEditAmount(e.target.value)} className="mt-1 w-full" />
                </div>
                <div>
                  <label className="label-overline">Recipient / Paid To</label>
                  <Input value={maaserEditPaidTo}
                    onChange={(e) => setMaaserEditPaidTo(e.target.value)} className="mt-1 w-full" />
                </div>
                <div>
                  <label className="label-overline">Note</label>
                  <Input value={maaserEditNote}
                    onChange={(e) => setMaaserEditNote(e.target.value)} className="mt-1 w-full" />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="outlinePill" size="pill" onClick={() => setMaaserEditEntry(null)}>Cancel</Button>
                  <Button variant="primary" size="pill" onClick={handleMaaserSaveEdit}>Save</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Give Modal */}
        {maaserShowGive && (
          <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setMaaserShowGive(false)}>
            <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl tracking-tight font-medium">Give Maaser</h3>
                <button onClick={() => setMaaserShowGive(false)} className="p-3 rounded-lg hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="label-overline">Amount (Â£)</label>
                  <Input type="number" step="0.01" value={maaserGiveAmount}
                    onChange={(e) => setMaaserGiveAmount(e.target.value)} className="mt-1 w-full" />
                </div>
                <div>
                  <label className="label-overline">Recipient</label>
                  <Input value={maaserGiveRecipient}
                    onChange={(e) => setMaaserGiveRecipient(e.target.value)}
                    placeholder="e.g. local shul, JNF, charity" className="mt-1 w-full" />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="outlinePill" size="pill" onClick={() => setMaaserShowGive(false)}>Cancel</Button>
                  <Button variant="primary" size="pill" onClick={handleMaaserSubmitGive}>Give</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Reset */}
        <ConfirmModal open={maaserConfirmReset} title="Reset Maaser audit"
          message="Clear the auto-Maaser audit log? Manual ledger entries are kept."
          onConfirm={handleMaaserDoReset} onCancel={() => setMaaserConfirmReset(false)} />
      </>}

      <TransactionForm open={open} editingId={editingId} form={form} setForm={setForm}
        selectedCats={selectedCats.categories || selectedCats} onClose={closeForm} onSubmit={submit}
        onClassify={handleClassify} classifying={classifying} classification={classification}
        onClearClassification={clearClassification}
        saveAsRecurring={saveAsRecurring} setSaveAsRecurring={setSaveAsRecurring}
        onCategoryCreated={loadCats}
        accounts={accounts} accountsLoading={accountsLoading} />

      <TransactionActionPanel
        open={reviewOpen}
        title="Review category"
        description={reviewTx?.description || "Choose the best category before approving this transaction."}
        className="max-w-xl"
        onClose={() => {
          setReviewOpen(false);
          setReviewTx(null);
          setReviewSuggestions([]);
          setReviewLoading(false);
        }}
        footer={
          <>
            <Button variant="outlinePill" size="pill" onClick={() => setReviewOpen(false)}>Close</Button>
            {reviewTx && (
              <Button variant="primary" size="pill" onClick={() => approveTx(reviewTx)}>
                Approve current
              </Button>
            )}
          </>
        }
      >
          <div className="space-y-4">
            {reviewTx && (
              <div className="rounded-xl border border-border bg-secondary/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{reviewTx.description || reviewTx.merchant || "Transaction"}</div>
                    <div className="text-xs text-muted-foreground">{reviewTx.date} - {reviewTx.account_name || "Account"}</div>
                  </div>
                  <div className={`text-sm font-semibold ${Number(reviewTx.amount || 0) >= 0 ? "text-emerald" : "text-rose-600"}`}>
                    {fmt(reviewTx.amount)}
                  </div>
                </div>
              </div>
            )}
            {reviewLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Getting suggestions...
              </div>
            ) : (
              <div className="grid gap-3">
                {(reviewSuggestions.length ? reviewSuggestions : (reviewTx?.ai_selected_category ? [{ category: reviewTx.ai_selected_category, confidence: reviewTx.ai_confidence, reason: reviewTx.ai_reason }] : [])).map((suggestion, index) => {
                  const category = suggestion.category || suggestion.name || suggestion.value || suggestion;
                  const confidence = suggestion.confidence ?? suggestion.score ?? null;
                  return (
                    <button
                      key={`${category}-${index}`}
                      type="button"
                      onClick={() => approveTx(reviewTx, category)}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-emerald hover:bg-emerald/5"
                    >
                      <div className="min-w-0 space-y-2">
                        <CategoryBadge category={category} size="sm" />
                        {suggestion.reason && <div className="text-xs text-muted-foreground">{suggestion.reason}</div>}
                      </div>
                      <div className="shrink-0 text-xs font-medium text-muted-foreground">
                        {confidence != null ? `${Math.round(Number(confidence) * 100)}%` : "Approve"}
                      </div>
                    </button>
                  );
                })}
                {!reviewLoading && !reviewSuggestions.length && !reviewTx?.ai_selected_category && (
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No suggestions yet. Run AI classify again or approve the current category.
                  </div>
                )}
              </div>
            )}
          </div>
      </TransactionActionPanel>

      <TransactionActionPanel
        open={splitOpen}
        title="Split transaction"
        description={splitTxDraft?.description || "Assign this transaction across multiple categories."}
        className="max-w-3xl"
        onClose={() => {
          setSplitOpen(false);
          setSplitTxDraft(null);
          setSplitLines([]);
          setSplitSaving(false);
        }}
        footer={
          <>
            <Button variant="outlinePill" size="pill" onClick={() => setSplitOpen(false)}>Cancel</Button>
            <Button variant="primary" size="pill" onClick={saveSplit} disabled={splitSaving || Math.abs(splitDifference) > 0.01}>
              {splitSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save split
            </Button>
          </>
        }
      >
          <div className="space-y-4">
            <div className="grid gap-3 max-h-[50vh] overflow-y-auto pr-1">
              {splitLines.map((line, index) => (
                <div key={index} className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[minmax(0,1.2fr)_120px_minmax(0,1fr)_40px]">
                  <CategoryCombobox
                    value={line.category}
                    onChange={(value) => updateSplitLine(index, "category", value)}
                    categories={selectedCats.categories || selectedCats}
                    placeholder="Category"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.amount}
                    onChange={(e) => updateSplitLine(index, "amount", e.target.value)}
                    aria-label="Split amount"
                  />
                  <Input
                    value={line.description}
                    onChange={(e) => updateSplitLine(index, "description", e.target.value)}
                    placeholder="Note"
                    aria-label="Split note"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSplitLine(index)}
                    disabled={splitLines.length <= 2}
                    aria-label="Remove split line"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outlinePill" size="pill" onClick={addSplitLine}>
                <Plus className="h-4 w-4" /> Add line
              </Button>
              <div className={`text-sm font-medium ${Math.abs(splitDifference) <= 0.01 ? "text-emerald" : "text-rose-600"}`}>
                Split total {fmt(splitEnteredTotal)} of {fmt(splitOriginalAmount)}
                {Math.abs(splitDifference) > 0.01 ? ` - ${fmt(Math.abs(splitDifference))} remaining` : ""}
              </div>
            </div>
          </div>
      </TransactionActionPanel>

      <TransactionActionPanel
        open={transferOpen}
        title="Pair transfer"
        description="Match this transaction with the opposite side of the transfer."
        className="max-w-xl"
        onClose={() => {
          setTransferOpen(false);
          setTransferTx(null);
          setTransferTargetId("");
          setTransferSaving(false);
        }}
        footer={
          <>
            <Button variant="outlinePill" size="pill" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button variant="primary" size="pill" onClick={saveTransferPair} disabled={transferSaving || !transferTargetId}>
              {transferSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Pair transfer
            </Button>
          </>
        }
      >
          <div className="space-y-4">
            {transferTx && (
              <div className="rounded-xl border border-border bg-secondary/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{transferTx.description || "Selected transaction"}</div>
                    <div className="text-xs text-muted-foreground">{transferTx.date} - {transferTx.account_name || "Account"}</div>
                  </div>
                  <div className={`text-sm font-semibold ${Number(transferTx.amount || 0) >= 0 ? "text-emerald" : "text-rose-600"}`}>
                    {fmt(transferTx.amount)}
                  </div>
                </div>
              </div>
            )}
            {transferCandidates.length ? (
              <div className="space-y-2">
                <label className="label-overline">Matching transaction</label>
                <select
                  value={transferTargetId}
                  onChange={(e) => setTransferTargetId(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                >
                  <option value="">Choose a match</option>
                  {transferCandidates.map((candidate) => (
                    <option key={candidate.transaction_id} value={candidate.transaction_id}>
                      {candidate.date} - {candidate.description || candidate.merchant || "Transaction"} - {fmt(candidate.amount)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No eligible opposite-side transactions are visible. Adjust filters or load more transactions, then try again.
              </div>
            )}
          </div>
      </TransactionActionPanel>

      <ComparePeriods open={compareOpen} onClose={() => setCompareOpen(false)} />

        <ConfirmModal
        open={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        onConfirm={() => { confirmCb.current?.(); setConfirmOpen(false); }}
        onCancel={() => setConfirmOpen(false)}
      />

      {newCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setNewCategoryModal(false)}>
          <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium mb-4">Add Custom Category</h3>
            <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Category name" autoFocus
              className="w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-ring focus:outline-none text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && newCategoryName.trim()) { bulkCategory(newCategoryName.trim().toLowerCase().replace(/\s+/g, "_")); setNewCategoryModal(false); } }} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setNewCategoryModal(false)} className="flex-1 h-10 rounded-xl bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={() => { if (newCategoryName.trim()) { bulkCategory(newCategoryName.trim().toLowerCase().replace(/\s+/g, "_")); setNewCategoryModal(false); } }} className="flex-1 h-10 rounded-xl bg-emerald text-white text-sm font-medium hover:bg-emerald/90">Add</button>
            </div>
          </div>
        </div>
      )}

      <TransactionInspector
        transaction={inspectTx}
        onClose={() => setInspectTx(null)}
        onEdit={(transaction) => { setInspectTx(null); openEdit(transaction); }}
        onDelete={(id) => { setInspectTx(null); del(id); }}
        onApprove={(transaction) => { setInspectTx(null); approveTx(transaction); }}
        onClassify={(transaction) => { setInspectTx(null); classifySavedTx(transaction); }}
        onSplit={(transaction) => { setInspectTx(null); splitTx(transaction); }}
        onPairTransfer={(transaction) => { setInspectTx(null); pairTransfer(transaction); }}
        onUnpairTransfer={(transaction) => { setInspectTx(null); unpairTransfer(transaction); }}
        onAsk={(transaction) => {
          setInspectTx(null);
          openAssistant({ prompt: `Explain this transaction: ${transaction.description || transaction.merchant || "transaction"} for ${formatCurrency(transaction.amount)} on ${transaction.date}.` });
        }}
      />
    </div>
  );
});

function SwipeableCard({ t, isSelected, swipedId, setSwipedId, onToggleSelect, onEdit, onInspect, onDelete, onApprove, onClassify, onSplit, onPairTransfer, onUnpairTransfer, showDate = false }) {
  const handlers = useSwipe(
    () => setSwipedId(t.transaction_id),
    () => setSwipedId(null),
    50,
  );
  const deleting = swipedId === t.transaction_id;
  const brandInstitution = t.institution ? pickBankInstitution(t.institution, t.source_label) : null;
  const unapproved = t.approval_status === "unapproved" || t.category_approval_status === "unapproved";
  const status = t.approval_status === "failed"
    ? { label: "Failed", className: "bg-ruby/10 text-ruby" }
    : unapproved
      ? { label: "Unapproved", className: "bg-topaz/10 text-topaz" }
      : t.is_transfer
        ? { label: "Transfer", className: "bg-sky/10 text-sky" }
        : t.is_split
          ? { label: "Split", className: "bg-violet/10 text-violet" }
          : null;

  return (
    <div className="relative overflow-hidden tap-highlight-none" {...handlers} onClick={(event) => { if (deleting) { setSwipedId(null); return; } if (event.target.closest("button, input, a, [role='menuitem'], [data-radix-collection-item]")) return; onInspect?.(t); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onInspect?.(t); } }} role="button" tabIndex={0}>
      <div
        className={`transition-transform duration-200 ease-out ${deleting ? "-translate-x-20" : "translate-x-0"} ${isSelected ? "bg-emerald/5" : ""}`}
      >
        <div className="flex items-start gap-2 px-3 py-2.5">
          <label className="-ml-0.5 flex h-11 w-7 shrink-0 items-center justify-center">
            <input type="checkbox" checked={isSelected}
              onChange={() => onToggleSelect(t.transaction_id)}
              aria-label="Select transaction"
              className="h-[18px] w-[18px] rounded-[5px] border-border accent-emerald cursor-pointer shrink-0" />
          </label>
          <div className="min-w-0 flex-1 pt-0.5">
            <p
              className="truncate text-[13px] font-medium leading-5 text-foreground"
              title={t.normalized_merchant && t.normalized_merchant !== t.description ? `${t.description} Â· ${t.normalized_merchant}` : t.description}
            >
              {t.description}
            </p>
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <CategoryBadge category={t.category || "uncategorized"} size="sm" truncate className="min-w-0" />
              {status && (
                <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                  {status.label}
                </span>
              )}
              {showDate && (
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                  {transactionDayLabel(t.date, { weekday: false })}
                </span>
              )}
              {brandInstitution && (
                <img
                  src={getBankLogoOrFallback(brandInstitution)}
                  alt=""
                  title={t.source_label || brandInstitution}
                  className="ml-auto hidden h-4 w-4 shrink-0 rounded-[3px] object-contain min-[360px]:block"
                />
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end justify-between self-stretch pl-0.5">
            <span className={`whitespace-nowrap text-[13px] font-semibold leading-5 tabular-nums ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}>
              {t.amount > 0 ? "+" : ""}Â£{Math.abs(t.amount).toFixed(2)}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger className="-mb-1 -mr-1 grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-transform hover:bg-secondary/50 hover:text-foreground active:scale-95" aria-label="Transaction actions">
                <MoreHorizontal className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(t)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onClassify?.(t)}>
                  <Sparkles className="h-4 w-4 mr-2" /> AI classify
                </DropdownMenuItem>
                {unapproved && (
                  <DropdownMenuItem onClick={() => onApprove?.(t)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onSplit?.(t)}>
                  <PieChartIcon className="h-4 w-4 mr-2" /> Split transaction
                </DropdownMenuItem>
                {!t.transfer_pair_id ? (
                  <DropdownMenuItem onClick={() => onPairTransfer?.(t)}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Pair transfer
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onUnpairTransfer?.(t)}>
                    <X className="h-4 w-4 mr-2" /> Unpair transfer
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(t.transaction_id)} className="text-ruby">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <div className={`absolute right-0 top-0 bottom-0 flex items-center transition-opacity duration-200 ${deleting ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <button
          onClick={() => { onDelete(t.transaction_id); setSwipedId(null); }}
          className="h-full w-20 flex items-center justify-center bg-ruby text-white font-medium text-sm"
          aria-label="Delete transaction"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export default Transactions;


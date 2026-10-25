import React, { useCallback } from "react";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  CheckCircle2,
  Sparkles,
  Scissors,
  Link2,
  Link2Off,
  AlertTriangle,
  Receipt,
  Wallet,
} from "lucide-react";
import { formatCurrency } from "../lib/format";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "./ui/context-menu";
import { toast } from "sonner";
import {
  getBankLogoOrFallback,
  pickBankInstitution,
} from "../data/bankLogos";
import CategoryBadge from "./CategoryBadge";

const TransactionRow = React.memo(
  ({
    t,
    account,
    isSelected,
    isFocused,
    onToggleSelect,
    onEdit,
    onDelete,
    onInspect,
    onSetFocus,
    onApprove,
    onClassify,
    onSplit,
    onPairTransfer,
    onUnpairTransfer,
  }) => {
    const brandInstitution = pickBankInstitution(
      account?.provider,
      account?.name,
      t.institution,
      t.source_label,
    );
    const accountName = account?.name || t.source_label || t.institution || "Manual";
    const brandLogo = brandInstitution ? getBankLogoOrFallback(brandInstitution) : null;
    const amount = Number(t.amount) || 0;
    const negative = amount < 0;
    const income = amount > 0;
    const unapproved = t.approval_status === "unapproved" || t.category_approval_status === "unapproved";
    const failed = t.approval_status === "failed";
    const status = failed ? "Failed" : unapproved ? "Unapproved" : t.pending ? "Pending" : "Approved";
    const dateLabel = t.date
      ? new Date(`${String(t.date).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "—";
    const description = t.description || t.merchant || "Transaction";
    const subtitle = t.merchant || t.normalized_merchant || t.source_label;
    const displaySubtitle = subtitle && subtitle.trim().toLowerCase() !== description.trim().toLowerCase() ? subtitle : null;

    const copyDescription = useCallback(() => {
      navigator.clipboard.writeText(t.description || "");
      toast.success("Description copied");
    }, [t.description]);

    const copyAmount = useCallback(() => {
      navigator.clipboard.writeText(`£${Math.abs(t.amount).toFixed(2)}`);
      toast.success("Amount copied");
    }, [t.amount]);

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <tr
            className={`cursor-pointer border-b border-border last:border-0 transition-colors ${
              isSelected
                ? "bg-emerald/5"
                : isFocused
                  ? "bg-topaz/5"
                  : "hover:bg-secondary/30"
            } ${isFocused ? "ring-1 ring-inset ring-topaz/30" : ""}`}
            onClick={(event) => {
              onSetFocus?.();
              if (event.target.closest("button, input, label, a, [role='menuitem'], [data-radix-collection-item]")) return;
              onToggleSelect?.(t.transaction_id);
            }}
            onDoubleClick={() => onEdit?.(t)}
          >
            <td className="px-2.5 py-2">
              <label
                className="flex min-h-[30px] min-w-[24px] cursor-pointer items-center justify-center"
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(t.transaction_id)}
                  onClick={(event) => event.stopPropagation()}
                  className="h-3.5 w-3.5 rounded border-border accent-emerald"
                  aria-label={`Select ${description}`}
                />
              </label>
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-[11px] text-muted-foreground">
              {dateLabel}
            </td>
            <td className="px-1.5 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full ${income ? "bg-emerald/10 text-emerald" : "bg-secondary text-muted-foreground"}`}>
                  {brandLogo ? (
                    <img
                      src={brandLogo}
                      alt=""
                      className="h-[18px] w-[18px] rounded-full object-contain"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <Receipt className="h-3 w-3" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium leading-tight">{description}</div>
                  {displaySubtitle ? (
                    <div className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">{displaySubtitle}</div>
                  ) : null}
                </div>
              </div>
            </td>
            <td className="px-1.5 py-2">
              <div className="flex min-w-0 items-center gap-1">
                <CategoryBadge
                  category={t.category || "uncategorized"}
                  size="sm"
                  truncate
                  showIcon={false}
                />
                {t.is_split ? <span className="shrink-0 rounded-full bg-violet/10 px-1.5 py-0.5 text-[9px] font-medium text-violet">Split</span> : null}
              </div>
            </td>
            <td className="px-1 py-2">
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-foreground">
                {brandLogo ? <img src={brandLogo} alt="" className="h-4 w-4 shrink-0 rounded-full object-contain" /> : <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="truncate">{accountName}</span>
              </span>
            </td>
            <td className={`money-tabular px-2 py-2 text-right text-[11.5px] font-semibold ${negative ? "text-ruby" : "text-emerald"}`}>
              {amount > 0 ? "+" : "-"}{formatCurrency(Math.abs(amount))}
            </td>
            <td className="px-1.5 py-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                failed
                  ? "bg-ruby/10 text-ruby"
                  : unapproved
                    ? "bg-topaz/10 text-topaz"
                    : t.pending
                      ? "bg-sky/10 text-sky"
                      : "bg-emerald/10 text-emerald"
              }`}>
                {status}
              </span>
            </td>
            <td className="px-1 py-2 text-right">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="p-2 text-muted-foreground hover:text-foreground"
                  aria-label="Transaction actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(t)}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </DropdownMenuItem>
                  {onClassify && (
                    <DropdownMenuItem onClick={() => onClassify(t)}>
                      <Sparkles className="h-4 w-4 mr-2" /> AI classify
                    </DropdownMenuItem>
                  )}
                  {onApprove && (t.approval_status === "unapproved" || t.category_approval_status === "unapproved") && (
                    <DropdownMenuItem onClick={() => onApprove(t)}>
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                    </DropdownMenuItem>
                  )}
                  {onSplit && (
                    <DropdownMenuItem onClick={() => onSplit(t)}>
                      <Scissors className="h-4 w-4 mr-2" /> Split transaction
                    </DropdownMenuItem>
                  )}
                  {onPairTransfer && !t.transfer_pair_id && (
                    <DropdownMenuItem onClick={() => onPairTransfer(t)}>
                      <Link2 className="h-4 w-4 mr-2" /> Pair transfer
                    </DropdownMenuItem>
                  )}
                  {onUnpairTransfer && t.transfer_pair_id && (
                    <DropdownMenuItem onClick={() => onUnpairTransfer(t)}>
                      <Link2Off className="h-4 w-4 mr-2" /> Unpair transfer
                    </DropdownMenuItem>
                  )}
                  {t.failed_reason && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled>
                        <AlertTriangle className="h-4 w-4 mr-2" /> {t.failed_reason}
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(t.transaction_id)}
                    className="text-ruby"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </td>
          </tr>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => onEdit(t)}>
            <Pencil className="h-4 w-4 mr-2" /> Edit
            <span className="ml-auto text-[10px] text-muted-foreground">↵</span>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onDelete(t.transaction_id)}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={copyDescription}>
            <Copy className="h-4 w-4 mr-2" /> Copy description
          </ContextMenuItem>
          <ContextMenuItem onClick={copyAmount}>
            <Copy className="h-4 w-4 mr-2" /> Copy amount
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  },
  (prev, next) =>
    prev.t.transaction_id === next.t.transaction_id &&
    prev.t.amount === next.t.amount &&
    prev.t.category === next.t.category &&
    prev.t.approval_status === next.t.approval_status &&
    prev.t.category_approval_status === next.t.category_approval_status &&
    prev.t.is_split === next.t.is_split &&
    prev.t.transfer_pair_id === next.t.transfer_pair_id &&
    prev.account?.name === next.account?.name &&
    prev.account?.provider === next.account?.provider &&
    prev.isSelected === next.isSelected &&
    prev.isFocused === next.isFocused
);

export default TransactionRow;

import React, { useCallback } from "react";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  ExternalLink,
  Check,
} from "lucide-react";
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
  getBankColor,
  pickBankInstitution,
} from "../data/bankLogos";
import CategoryBadge from "./CategoryBadge";

const TransactionRow = React.memo(
  ({
    t,
    isSelected,
    isFocused,
    onToggleSelect,
    onEdit,
    onDelete,
    onSetFocus,
  }) => {
    const brandInstitution = pickBankInstitution(t.institution, t.source_label);

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
            className={`border-b border-border last:border-0 transition-colors ${
              isSelected
                ? "bg-emerald/5"
                : isFocused
                  ? "bg-topaz/5"
                  : "hover:bg-secondary/30"
            } ${isFocused ? "ring-1 ring-inset ring-topaz/30" : ""}`}
            onClick={() => onSetFocus?.()}
            onDoubleClick={() => onEdit?.(t)}
          >
            <td className="px-4 py-3">
              <label className="flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(t.transaction_id)}
                  className="h-4 w-4 rounded border-border accent-emerald"
                />
              </label>
            </td>
            <td className="px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">
              {t.date?.slice(0, 10)}
            </td>
            <td className="px-6 py-3 max-w-[200px]">
              <div className="font-medium truncate">{t.description}</div>
              {t.normalized_merchant &&
                t.normalized_merchant !== t.description && (
                  <div className="text-xs text-muted-foreground truncate">
                    {t.normalized_merchant}
                  </div>
                )}
            </td>
            <td className="px-6 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {t.is_transfer && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky/10 text-sky text-[10px] font-medium">
                    Transfer
                  </span>
                )}
                <CategoryBadge
                  category={t.category || "uncategorized"}
                  size="sm"
                  truncate
                />
                {t.source_label && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {brandInstitution && (
                      <img
                        src={getBankLogoOrFallback(brandInstitution)}
                        alt=""
                        className="h-5 w-5 object-contain shrink-0 rounded-sm"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${getBankColor(brandInstitution)}"/><text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="18" fill="white">${(brandInstitution || "?")[0].toUpperCase()}</text></svg>`)}`;
                        }}
                      />
                    )}
                    {t.source_label}
                  </span>
                )}
              </div>
            </td>
            <td
              className={`px-6 py-3 text-right font-medium tabular-nums ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}
            >
              {t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}
            </td>
            <td className="px-6 py-3 text-right">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="p-3 text-muted-foreground hover:text-foreground"
                  aria-label="Transaction actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(t)}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </DropdownMenuItem>
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
);

export default TransactionRow;

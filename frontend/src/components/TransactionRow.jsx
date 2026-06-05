import React from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

const TransactionRow = React.memo(({ t, isSelected, onToggleSelect, onEdit, onDelete }) => {
  return (
    <tr className={`border-b border-border last:border-0 hover:bg-secondary/30 ${isSelected ? "bg-emerald/5" : ""}`}>
      <td className="px-4 py-3">
        <label className="flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer">
          <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(t.transaction_id)}
            className="h-4 w-4 rounded border-border accent-emerald" />
        </label>
      </td>
      <td className="px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">{t.date?.slice(0, 10)}</td>
      <td className="px-6 py-3 max-w-[200px]">
        <div className="font-medium truncate">{t.description}</div>
        {t.normalized_merchant && t.normalized_merchant !== t.description && (
          <div className="text-xs text-muted-foreground truncate">{t.normalized_merchant}</div>
        )}
      </td>
      <td className="px-6 py-3">
        <span className="text-xs px-2 py-1 rounded-full bg-secondary capitalize">{t.category || "uncategorized"}</span>
        {t.source_label && <span className="text-xs text-muted-foreground ml-1.5">{t.source_label}</span>}
      </td>
      <td className={`px-6 py-3 text-right font-medium tabular-nums ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}>
        {t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}
      </td>
      <td className="px-6 py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger className="p-3 text-muted-foreground hover:text-foreground" aria-label="Transaction actions">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(t)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(t.transaction_id)} className="text-ruby">
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
});

export default TransactionRow;

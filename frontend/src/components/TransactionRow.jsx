import React from "react";
import { Pencil, Trash2 } from "lucide-react";

const TransactionRow = React.memo(({ t, isSelected, onToggleSelect, onEdit, onDelete }) => {
  return (
    <tr className={`border-b border-border last:border-0 hover:bg-secondary/30 ${isSelected ? "bg-emerald/5" : ""}`}>
      <td className="px-4 py-3">
        <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(t.transaction_id)}
          className="h-4 w-4 rounded border-border accent-emerald cursor-pointer" />
      </td>
      <td className="px-6 py-3 text-xs text-muted-foreground">{t.date?.slice(0, 10)}</td>
      <td className="px-6 py-3">
        <div className="font-medium">{t.description}</div>
        {t.normalized_merchant && t.normalized_merchant !== t.description && (
          <div className="text-xs text-muted-foreground">{t.normalized_merchant}</div>
        )}
      </td>
      <td className="px-6 py-3">
        <span className="text-xs px-2 py-1 rounded-full bg-secondary capitalize">{t.category || "uncategorized"}</span>
        {t.source_label && <span className="text-xs text-muted-foreground ml-1.5">{t.source_label}</span>}
      </td>
      <td className={`px-6 py-3 text-right font-medium tabular-nums ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}>
        {t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}
      </td>
      <td className="px-6 py-3 text-right whitespace-nowrap">
        <button onClick={() => onEdit(t)} data-testid={`edit-${t.transaction_id}`} className="p-2 text-muted-foreground hover:text-emerald" title="Edit" aria-label="Edit transaction"><Pencil className="h-4 w-4" /></button>
        <button onClick={() => onDelete(t.transaction_id)} data-testid={`del-${t.transaction_id}`} className="p-2 text-muted-foreground hover:text-ruby" title="Delete" aria-label="Delete transaction"><Trash2 className="h-4 w-4" /></button>
      </td>
    </tr>
  );
});

export default TransactionRow;

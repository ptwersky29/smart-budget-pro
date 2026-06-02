import React from "react";

const emptyForm = { description: "", amount: "", category: "", is_income: false };

export default function TransactionForm({ open, editingId, form, setForm, selectedCats, onClose, onSubmit }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="page-shell p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl tracking-tight font-medium mb-4">{editingId ? "Edit transaction" : "New transaction"}</h3>
        <form onSubmit={onSubmit} className="space-y-3">
          <input data-testid="tx-desc" required placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full control-shell" />
          <input data-testid="tx-amount" required type="number" step="0.01" placeholder="Amount (£)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full control-shell" />
          <select data-testid="tx-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full control-shell">
            <option value="">Auto-categorise</option>
            {selectedCats.map(c => <option key={c.category_id ?? `default-${c.name}`} value={c.name}>{c.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_income} onChange={(e) => setForm({ ...form, is_income: e.target.checked })} /> This is income</label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary/50 text-sm">Cancel</button>
            <button data-testid="tx-submit" className="btn-pill flex-1 gradient-emerald text-white">{editingId ? "Save changes" : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

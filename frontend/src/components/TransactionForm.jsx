import React, { useState } from "react";
import { Sparkles, Loader2, X, ChevronDown, ChevronUp } from "lucide-react";

const emptyForm = { description: "", amount: "", category: "", is_income: false, budget_type: "", occasion: "", merchant: "" };
const BUDGET_TYPES = ["day_to_day", "yom_tov", "holiday", "simcha", "other"];

export default function TransactionForm({
  open, editingId, form, setForm, selectedCats, onClose, onSubmit,
  onClassify, classifying, classification, onClearClassification,
  saveAsRecurring, setSaveAsRecurring,
}) {
  const [showMore, setShowMore] = useState(false);
  if (!open) return null;

  const canClassify = form.description.trim() && form.amount && !editingId && !classifying;
  const hasManualFields = form.budget_type || form.occasion || form.merchant;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={editingId ? "Edit transaction" : "New transaction"}>
      <div className="page-shell p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl tracking-tight font-medium mb-4">{editingId ? "Edit transaction" : "New transaction"}</h3>
        <form onSubmit={onSubmit} className="space-y-3">
          <input data-testid="tx-desc" required placeholder="Description" value={form.description}
            onChange={(e) => { setForm({ ...form, description: e.target.value }); if (onClearClassification) onClearClassification(); }}
            className="w-full control-shell" />
          <input data-testid="tx-amount" required type="number" step="0.01" placeholder="Amount (£)" value={form.amount}
            onChange={(e) => { setForm({ ...form, amount: e.target.value }); if (onClearClassification) onClearClassification(); }}
            className="w-full control-shell" />
          <select data-testid="tx-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full control-shell">
            <option value="">Auto-categorise</option>
            {selectedCats.map(c => <option key={c.category_id ?? `default-${c.name}`} value={c.name}>{c.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_income} onChange={(e) => setForm({ ...form, is_income: e.target.checked })} /> This is income</label>

          {/* Classify button */}
          {!editingId && (
            <div className="flex gap-2">
              <button type="button" onClick={() => onClassify({ description: form.description, amount: parseFloat(form.amount) })}
                disabled={!canClassify}
                className="btn-pill border border-emerald text-emerald text-sm h-10 flex-1 disabled:opacity-40">
                {classifying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {classifying ? "Classifying…" : "Classify with AI"}
              </button>
              {classification && (
                <button type="button" onClick={onClearClassification} className="btn-pill border border-border text-sm h-10 px-3">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* AI Classification result */}
          {classification && (
            <div className="rounded-xl border-2 border-emerald/20 bg-emerald/5 p-3 text-sm space-y-2 animate-[fadeUp_0.2s_ease-out]">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-emerald" />
                <span className="text-xs font-medium text-emerald">AI Classification</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald/10 text-emerald ml-auto">
                  {Math.round((classification.confidence || 0) * 100)}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Budget type</span>
                <span className="font-medium capitalize">{classification.budget_type?.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">Occasion</span>
                <span className="font-medium">{classification.occasion}</span>
                <span className="text-muted-foreground">Merchant</span>
                <span className="font-medium">{classification.merchant || "—"}</span>
              </div>
              {classification.recurring && (
                <label className="flex items-center gap-2 pt-1 border-t border-emerald/10 text-xs">
                  <input type="checkbox" checked={saveAsRecurring} onChange={(e) => setSaveAsRecurring(e.target.checked)} className="accent-emerald" />
                  Save as recurring transaction
                </label>
              )}
            </div>
          )}

          {/* Manual classification toggle */}
          {!editingId && (
            <button type="button" onClick={() => setShowMore(!showMore)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pt-1">
              {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {hasManualFields ? "Classification fields set" : "More options"}
            </button>
          )}

          {showMore && !editingId && (
            <div className="space-y-2 p-3 rounded-xl bg-secondary/20 border border-border animate-[fadeUp_0.2s_ease-out]">
              <p className="text-xs text-muted-foreground">Manual classification (overrides AI)</p>
              <select value={form.budget_type} onChange={(e) => setForm({ ...form, budget_type: e.target.value })}
                className="w-full control-shell text-sm">
                <option value="">Budget type…</option>
                {BUDGET_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
              <input placeholder="Occasion (e.g. Pesach 2026)" value={form.occasion}
                onChange={(e) => setForm({ ...form, occasion: e.target.value })}
                className="w-full control-shell text-sm" />
              <input placeholder="Merchant (e.g. Tesco)" value={form.merchant}
                onChange={(e) => setForm({ ...form, merchant: e.target.value })}
                className="w-full control-shell text-sm" />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary/50 text-sm">Cancel</button>
            <button data-testid="tx-submit" className="btn-pill flex-1 gradient-emerald text-white">{editingId ? "Save changes" : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

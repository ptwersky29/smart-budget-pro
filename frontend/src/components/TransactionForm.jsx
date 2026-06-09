import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Sparkles, Loader2, X, ChevronDown, ChevronUp, Check, Brain } from "lucide-react";
import CategoryCombobox from "./CategoryCombobox";

const emptyForm = { description: "", amount: "", category: "", is_income: false, budget_type: "", occasion: "", merchant: "" };
const BUDGET_TYPES = ["day_to_day", "yom_tov", "holiday", "simcha", "other"];

export default function TransactionForm({
  open, editingId, form, setForm, selectedCats, onClose, onSubmit,
  onClassify, classifying, classification, onClearClassification,
  saveAsRecurring, setSaveAsRecurring,
  onCategoryCreated,
}) {
  const [showMore, setShowMore] = useState(false);

  if (!open) return null;

  const canClassify = form.description.trim() && form.amount && !editingId && !classifying;
  const hasManualFields = form.budget_type || form.occasion || form.merchant;

  const suggestions = classification?.suggestions || [];
  const topSuggestion = suggestions[0];
  const autoFill = topSuggestion && topSuggestion.confidence >= 0.95;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={editingId ? "Edit transaction" : "New transaction"}>
      <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl tracking-tight font-medium mb-4">{editingId ? "Edit transaction" : "New transaction"}</h3>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input data-testid="tx-desc" required placeholder="Description" value={form.description}
            onChange={(e) => { setForm({ ...form, description: e.target.value }); if (onClearClassification) onClearClassification(); }} />
          <Input data-testid="tx-amount" required type="number" step="0.01" placeholder="Amount (£)" value={form.amount}
            onChange={(e) => { setForm({ ...form, amount: e.target.value }); if (onClearClassification) onClearClassification(); }} />

          {/* Category selector — grouped by section, add custom category */}
          <CategoryCombobox
            value={form.category}
            onChange={(val) => setForm({ ...form, category: val })}
            categories={selectedCats}
            placeholder={autoFill ? `${topSuggestion.category} (AI Suggested — ${Math.round(topSuggestion.confidence * 100)}%)` : "Select category…"}
            onCategoryCreated={onCategoryCreated}
          />

          {/* Source badges for selected category */}
          {form.category && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {(() => {
                const found = selectedCats.find(c => c.name === form.category);
                if (found) {
                  return (
                    <>
                      {found.section && <span className="px-1.5 py-0.5 rounded-full bg-secondary/40">{found.section}</span>}
                      {found.source === "System"
                        ? <span className="px-1.5 py-0.5 rounded-full bg-secondary/60">System</span>
                        : <span className="px-1.5 py-0.5 rounded-full bg-topaz/10 text-topaz">Custom</span>
                      }
                    </>
                  );
                }
                return null;
              })()}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_income} onChange={(e) => setForm({ ...form, is_income: e.target.checked })} /> This is income</label>

          {/* Classify button */}
          {!editingId && (
            <div className="flex gap-2">
              <Button variant="outlinePill" size="pillSm" className="border-emerald text-emerald flex-1" onClick={() => onClassify({ description: form.description, amount: parseFloat(form.amount) })}
                disabled={!canClassify}>
                {classifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {classifying ? "Classifying…" : "Classify with AI"}
              </Button>
              {suggestions.length > 0 && (
                <Button variant="outlinePill" size="pillSm" onClick={onClearClassification}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {/* AI Classification result — show all 4 suggestions */}
          {suggestions.length > 0 && (
            <div className="rounded-xl border-2 border-emerald/20 bg-emerald/5 p-3 text-sm space-y-2 animate-[fadeUp_0.2s_ease-out]">
              <div className="flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 text-emerald" />
                <span className="text-xs font-medium text-emerald">AI Suggestions</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald/10 text-emerald ml-auto">
                  Top: {Math.round(topSuggestion?.confidence * 100)}%
                </span>
              </div>
              <div className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <div key={i} className={`flex items-center justify-between gap-2 rounded-lg p-2 transition-colors ${form.category === s.category ? "bg-emerald/10 border border-emerald/30" : "bg-black/5 dark:bg-white/5"}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, category: s.category, budget_type: s.budget_type || "", occasion: s.occasion || "", merchant: s.merchant || "" })}
                        className={`flex items-center gap-2 min-w-0 ${form.category === s.category ? "text-emerald font-medium" : "text-foreground"}`}
                      >
                        {form.category === s.category ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 h-3.5 shrink-0" />}
                        <span className="text-xs capitalize truncate">{s.category}</span>
                      </button>
                      {s.merchant && <span className="text-[10px] text-muted-foreground truncate">· {s.merchant}</span>}
                      {s.source === "historical" && <span className="text-[10px] px-1 rounded bg-topaz/10 text-topaz shrink-0">Learned</span>}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{Math.round(s.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
              {topSuggestion?.recurring && (
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
                className="flex h-11 w-full rounded-xl bg-secondary/50 border border-transparent px-4 text-sm transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
                <option value="">Budget type…</option>
                {BUDGET_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
              <Input placeholder="Occasion (e.g. Pesach 2026)" value={form.occasion}
                onChange={(e) => setForm({ ...form, occasion: e.target.value })} />
              <Input placeholder="Merchant (e.g. Tesco)" value={form.merchant}
                onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outlinePill" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button variant="primary" className="flex-1" data-testid="tx-submit">{editingId ? "Save changes" : "Add"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

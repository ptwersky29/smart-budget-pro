import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Sparkles,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Check,
  Brain,
} from "lucide-react";
import CategoryCombobox from "./CategoryCombobox";
import CategoryBadge from "./CategoryBadge";

const emptyForm = {
  description: "",
  amount: "",
  category: "",
  account_id: "",
  is_income: false,
  budget_type: "",
  occasion: "",
  merchant: "",
};
const BUDGET_TYPES = ["day_to_day", "yom_tov", "holiday", "simcha", "other"];

export default function TransactionForm({
  open,
  editingId,
  form,
  setForm,
  selectedCats,
  onClose,
  onSubmit,
  onClassify,
  classifying,
  classification,
  onClearClassification,
  saveAsRecurring,
  setSaveAsRecurring,
  onCategoryCreated,
  accounts,
  accountsLoading,
}) {
  const [showMore, setShowMore] = useState(false);

  if (!open) return null;

  const canClassify =
    form.description.trim() && form.amount && !editingId && !classifying;
  const hasManualFields = form.budget_type || form.occasion || form.merchant;

  const suggestions = classification?.suggestions || [];
  const topSuggestion = suggestions[0];
  const autoFill = topSuggestion && topSuggestion.confidence >= 0.95;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={editingId ? "Edit transaction" : "New transaction"}
    >
      <div
        className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          className="text-xl tracking-tight font-medium mb-4"
          id="transaction-form-title"
        >
          {editingId ? "Edit transaction" : "New transaction"}
        </h3>
        <form
          onSubmit={onSubmit}
          className="space-y-3"
          aria-labelledby="transaction-form-title"
        >
          {/* Account selector — required */}
          <div>
            <label htmlFor="tx-account" className="label-overline text-muted-foreground mb-1.5 block">
              Bank Account <span className="text-ruby">*</span>
            </label>
            {accountsLoading ? (
              <div className="h-10 rounded-xl bg-secondary/30 border border-border flex items-center px-3 text-xs text-muted-foreground">
                Loading accounts...
              </div>
            ) : !accounts || accounts.length === 0 ? (
              <div className="h-10 rounded-xl bg-secondary/30 border border-dashed border-ruby/30 flex items-center px-3 text-xs text-ruby">
                No accounts found — create one first
              </div>
            ) : (
              <select
                id="tx-account"
                required
                value={form.account_id}
                onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                className="flex h-11 w-full rounded-xl bg-secondary/30 border border-border px-4 text-sm transition-colors placeholder:text-muted-foreground focus:border-emerald/50 focus:ring-2 focus:ring-emerald/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>Select an account…</option>
                {accounts.map((a) => (
                  <option key={a.account_id} value={a.account_id}>
                    {a.name} {a.type === "savings" ? "(Savings)" : ""} — £{Number(a.balance || 0).toLocaleString()}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="tx-desc" className="sr-only">
              Description
            </label>
            <Input
              id="tx-desc"
              data-testid="tx-desc"
              required
              placeholder="Description"
              value={form.description}
              onChange={(e) => {
                setForm({ ...form, description: e.target.value });
                if (onClearClassification) onClearClassification();
              }}
            />
          </div>
          <div>
            <label htmlFor="tx-amount" className="sr-only">
              Amount in pounds
            </label>
            <Input
              id="tx-amount"
              data-testid="tx-amount"
              required
              type="number"
              step="0.01"
              placeholder="Amount (£)"
              value={form.amount}
              onChange={(e) => {
                setForm({ ...form, amount: e.target.value });
                if (onClearClassification) onClearClassification();
              }}
            />
          </div>

          {/* Category selector — grouped by section, add custom category */}
          <CategoryCombobox
            value={form.category}
            onChange={(val) => setForm({ ...form, category: val })}
            categories={selectedCats}
            placeholder={
              autoFill
                ? `${topSuggestion.category} (AI Suggested — ${Math.round(topSuggestion.confidence * 100)}%)`
                : "Select category…"
            }
            onCategoryCreated={onCategoryCreated}
          />

          {/* Source badges for selected category */}
          {form.category && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {(() => {
                const found = selectedCats.find(
                  (c) => c.name === form.category,
                );
                if (found) {
                  return (
                    <>
                      <CategoryBadge category={found} size="sm" />
                      {found.section && (
                        <span className="px-1.5 py-0.5 rounded-full bg-secondary/40">
                          {found.section}
                        </span>
                      )}
                      {found.source === "System" ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-secondary/60">
                          System
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full bg-topaz/10 text-topaz">
                          Custom
                        </span>
                      )}
                    </>
                  );
                }
                return <CategoryBadge category={form.category} size="sm" />;
              })()}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_income}
              onChange={(e) =>
                setForm({ ...form, is_income: e.target.checked })
              }
              className="accent-emerald h-4 w-4"
              aria-describedby={form.is_income ? "income-hint" : undefined}
            />{" "}
            <span>This is income</span>
          </label>
          <span id="income-hint" className="sr-only">
            Check if this transaction represents money coming in
          </span>

          {/* Classify button */}
          {!editingId && (
            <div className="flex gap-2">
              <Button
                variant="outlinePill"
                size="pillSm"
                className="border-emerald text-emerald flex-1"
                onClick={() =>
                  onClassify({
                    description: form.description,
                    amount: parseFloat(form.amount),
                  })
                }
                disabled={!canClassify}
              >
                {classifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {classifying ? "Classifying…" : "Classify with AI"}
              </Button>
              {suggestions.length > 0 && (
                <Button
                  variant="outlinePill"
                  size="pillSm"
                  onClick={onClearClassification}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {/* AI Classification result — show all suggestions with confidence bars */}
          {suggestions.length > 0 && (
            <div className="rounded-xl border-2 border-emerald/20 bg-emerald/5 p-3 text-sm space-y-2 animate-[fadeUp_0.2s_ease-out]">
              <div className="flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 text-emerald" />
                <span className="text-xs font-medium text-emerald">
                  AI Suggestions
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto ${
                    topSuggestion?.confidence >= 0.9
                      ? "bg-emerald/10 text-emerald"
                      : topSuggestion?.confidence >= 0.7
                        ? "bg-topaz/10 text-topaz"
                        : "bg-ruby/10 text-ruby"
                  }`}
                >
                  {Math.round(topSuggestion?.confidence * 100)}% confidence
                </span>
              </div>
              <div className="space-y-1.5">
                {suggestions.map((s, i) => {
                  const isSelected = form.category === s.category;
                  const confPct = Math.round(s.confidence * 100);
                  return (
                    <div
                      key={i}
                      className={`rounded-lg transition-all ${
                        isSelected
                          ? "bg-emerald/10 ring-1 ring-emerald/30 shadow-sm"
                          : "bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            category: s.category,
                            budget_type: s.budget_type || "",
                            occasion: s.occasion || "",
                            merchant: s.merchant || "",
                          })
                        }
                        className="w-full text-left p-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {isSelected ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-emerald" />
                            ) : (
                              <span
                                className={`w-3.5 h-3.5 shrink-0 rounded-full border-2 ${confPct >= 90 ? "border-emerald/40" : confPct >= 70 ? "border-topaz/40" : "border-ruby/40"}`}
                              />
                            )}
                            <CategoryBadge
                              category={s.category}
                              size="sm"
                              className={
                                isSelected ? "ring-1 ring-emerald/30" : ""
                              }
                              truncate
                            />
                            {s.merchant && (
                              <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                                · {s.merchant}
                              </span>
                            )}
                            {s.source === "historical" && (
                              <span className="text-[10px] px-1 rounded bg-topaz/10 text-topaz shrink-0">
                                Learned
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Confidence bar */}
                        <div className="mt-1 flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-muted/40 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                confPct >= 90
                                  ? "bg-emerald"
                                  : confPct >= 70
                                    ? "bg-topaz"
                                    : "bg-ruby"
                              }`}
                              style={{ width: `${confPct}%` }}
                            />
                          </div>
                          <span
                            className={`text-[10px] tabular-nums shrink-0 ${
                              confPct >= 90
                                ? "text-emerald"
                                : confPct >= 70
                                  ? "text-topaz"
                                  : "text-ruby"
                            }`}
                          >
                            {confPct}%
                          </span>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
              {topSuggestion?.recurring && (
                <label className="flex items-center gap-2 pt-2 border-t border-emerald/10 text-xs">
                  <input
                    type="checkbox"
                    checked={saveAsRecurring}
                    onChange={(e) => setSaveAsRecurring(e.target.checked)}
                    className="rounded border-border accent-emerald h-3.5 w-3.5"
                  />
                  <span className="text-muted-foreground">
                    Save as recurring transaction
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Manual classification toggle */}
          {!editingId && (
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pt-1"
            >
              {showMore ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {hasManualFields ? "Classification fields set" : "More options"}
            </button>
          )}

          {showMore && !editingId && (
            <div className="space-y-2 p-3 rounded-xl bg-secondary/20 border border-border animate-[fadeUp_0.2s_ease-out]">
              <p className="text-xs text-muted-foreground">
                Manual classification (overrides AI)
              </p>
              <select
                value={form.budget_type}
                onChange={(e) =>
                  setForm({ ...form, budget_type: e.target.value })
                }
                className="flex h-11 w-full rounded-xl bg-secondary/50 border border-transparent px-4 text-sm transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Budget type…</option>
                {BUDGET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Occasion (e.g. Pesach 2026)"
                value={form.occasion}
                onChange={(e) => setForm({ ...form, occasion: e.target.value })}
              />
              <Input
                placeholder="Merchant (e.g. Tesco)"
                value={form.merchant}
                onChange={(e) => setForm({ ...form, merchant: e.target.value })}
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outlinePill" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              data-testid="tx-submit"
            >
              {editingId ? "Save changes" : "Add"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

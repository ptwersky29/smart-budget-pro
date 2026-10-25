import React, { useState } from "react";
import { toast } from "sonner";
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
  Receipt,
  Split,
  ArrowLeftRight,
  Plus,
  Pencil,
  Wallet,
  CalendarDays,
} from "lucide-react";
import CategoryCombobox from "./CategoryCombobox";
import CategoryBadge from "./CategoryBadge";
import { formatCurrency } from "../lib/format";

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
    Boolean(form.description?.trim()) && Boolean(form.amount) && !editingId && !classifying;
  const hasManualFields = form.budget_type || form.occasion || form.merchant;
  const entryMode =
    form.entry_mode || (form.is_transfer ? "transfer" : "standard");

  const setEntryMode = (mode) => {
    setForm({
      ...form,
      entry_mode: mode,
      is_transfer: mode === "transfer",
      is_income: mode === "transfer" ? false : form.is_income,
      exclude_from_maaser:
        mode === "transfer" ? true : form.exclude_from_maaser,
    });
  };

  const transactionModes = [
    { value: "standard", label: "Standard", Icon: Receipt },
    { value: "split", label: "Split", Icon: Split },
    { value: "transfer", label: "Transfer", Icon: ArrowLeftRight },
  ];

  const suggestions = classification?.suggestions || [];
  const topSuggestion = suggestions[0];
  const autoFill = topSuggestion && topSuggestion.confidence >= 0.95;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-3 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={editingId ? "Edit transaction" : "New transaction"}
    >
      <div
        className="rounded-2xl border border-border bg-card shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden animate-[fadeUp_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-card/90">
          <div className="flex items-center gap-3">
            <span
              className={`grid h-9 w-9 place-items-center rounded-xl ${
                editingId ? "bg-topaz/10 text-topaz" : "bg-emerald/10 text-emerald"
              }`}
            >
              {editingId ? (
                <Pencil className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </span>
            <div>
              <h3
                className="text-base font-semibold tracking-tight text-foreground"
                id="transaction-form-title"
              >
                {editingId ? "Edit Transaction" : "New Transaction"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {editingId
                  ? "Update transaction details in your ledger"
                  : "Record an income, expense, or transfer"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          onSubmit={onSubmit}
          className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4"
          aria-labelledby="transaction-form-title"
        >
          {/* Type Toggle: Expense vs Income */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Transaction Type
            </label>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-secondary/25 p-1">
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    is_income: false,
                    is_transfer: false,
                    entry_mode: entryMode === "transfer" ? "standard" : entryMode,
                  })
                }
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
                  !form.is_income && !form.is_transfer
                    ? "bg-card text-ruby shadow-sm border border-ruby/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>Expense</span>
                <span className="text-[10px] opacity-75">(-)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    is_income: true,
                    is_transfer: false,
                    entry_mode: entryMode === "transfer" ? "standard" : entryMode,
                  })
                }
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
                  form.is_income && !form.is_transfer
                    ? "bg-card text-emerald shadow-sm border border-emerald/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>Income</span>
                <span className="text-[10px] opacity-75">(+)</span>
              </button>
            </div>
          </div>

          {/* Amount input with currency symbol */}
          <div>
            <label
              htmlFor="tx-amount"
              className="text-xs font-medium text-muted-foreground block mb-1.5"
            >
              Amount <span className="text-ruby">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                £
              </span>
              <Input
                id="tx-amount"
                data-testid="tx-amount"
                required
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => {
                  setForm({ ...form, amount: e.target.value });
                  if (onClearClassification) onClearClassification();
                }}
                className="h-11 pl-8 text-base font-bold tabular-nums"
              />
            </div>
          </div>

          {/* Description input */}
          <div>
            <label
              htmlFor="tx-desc"
              className="text-xs font-medium text-muted-foreground block mb-1.5"
            >
              Description <span className="text-ruby">*</span>
            </label>
            <Input
              id="tx-desc"
              data-testid="tx-desc"
              required
              placeholder="e.g. Sainsbury's, Salary, Electricity"
              value={form.description}
              onChange={(e) => {
                setForm({ ...form, description: e.target.value });
                if (onClearClassification) onClearClassification();
              }}
              className="h-11 text-sm"
            />
          </div>

          {/* Account & Date (2 columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="tx-account"
                className="text-xs font-medium text-muted-foreground block mb-1.5"
              >
                Account <span className="text-ruby">*</span>
              </label>
              {accountsLoading ? (
                <div className="h-11 rounded-xl bg-secondary/30 border border-border flex items-center px-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  Loading accounts...
                </div>
              ) : !accounts || accounts.length === 0 ? (
                <div className="h-11 rounded-xl bg-secondary/30 border border-dashed border-ruby/30 flex items-center px-3 text-xs text-ruby">
                  No accounts found
                </div>
              ) : (
                <select
                  id="tx-account"
                  required
                  value={form.account_id}
                  onChange={(e) =>
                    setForm({ ...form, account_id: e.target.value })
                  }
                  className="flex h-11 w-full rounded-xl bg-secondary/30 border border-border px-3 text-xs transition-colors placeholder:text-muted-foreground focus:border-emerald/50 focus:ring-2 focus:ring-emerald/20 focus:outline-none"
                >
                  <option value="" disabled>
                    Select account...
                  </option>
                  {accounts.map((a) => (
                    <option key={a.account_id} value={a.account_id}>
                      {a.name} ({formatCurrency(a.balance || 0)})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label
                htmlFor="tx-date"
                className="text-xs font-medium text-muted-foreground block mb-1.5"
              >
                Date <span className="text-ruby">*</span>
              </label>
              <Input
                id="tx-date"
                type="date"
                required
                value={form.date || new Date().toISOString().slice(0, 10)}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="h-11 text-xs"
              />
            </div>
          </div>

          {/* Category Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Category
              </label>
              {!editingId && canClassify && (
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseFloat(form.amount);
                    if (isNaN(parsed)) {
                      toast.error("Invalid amount");
                      return;
                    }
                    onClassify({
                      description: form.description,
                      amount: parsed,
                    });
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald hover:underline"
                >
                  {classifying ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {classifying ? "Classifying..." : "Suggest with AI"}
                </button>
              )}
            </div>

            <CategoryCombobox
              value={form.category}
              onChange={(val) => setForm({ ...form, category: val })}
              categories={selectedCats}
              placeholder={
                autoFill
                  ? `${topSuggestion.category} (AI Suggested · ${Math.round(topSuggestion.confidence * 100)}%)`
                  : "Select category..."
              }
              onCategoryCreated={onCategoryCreated}
            />

            {/* Source badges for selected category */}
            {form.category && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {(() => {
                  const found = selectedCats?.find?.(
                    (c) => c.name === form.category,
                  );
                  if (found) {
                    return (
                      <>
                        <CategoryBadge category={found} size="sm" />
                        {found.section && (
                          <span className="px-2 py-0.5 rounded-md bg-secondary/50 text-[10px] font-medium">
                            {found.section}
                          </span>
                        )}
                        {found.source === "System" ? (
                          <span className="px-2 py-0.5 rounded-md bg-secondary/60 text-[10px]">
                            System
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-topaz/10 text-topaz text-[10px] font-medium">
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
          </div>

          {/* AI Suggestions dropdown if classification returned */}
          {suggestions.length > 0 && (
            <div className="rounded-xl border border-emerald/25 bg-emerald/5 p-3 text-sm space-y-2 animate-[fadeUp_0.2s_ease-out]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-3.5 w-3.5 text-emerald" />
                  <span className="text-xs font-semibold text-emerald">
                    AI Suggestions
                  </span>
                </div>
                {onClearClassification && (
                  <button
                    type="button"
                    onClick={onClearClassification}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Clear suggestions"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {suggestions.map((s, i) => {
                  const isSelected = form.category === s.category;
                  const confPct = Math.round(s.confidence * 100);
                  return (
                    <button
                      key={i}
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
                      className={`w-full rounded-lg p-2 text-left transition flex items-center justify-between ${
                        isSelected
                          ? "bg-emerald/15 ring-1 ring-emerald/40"
                          : "bg-card/70 hover:bg-card border border-border/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isSelected ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald" />
                        ) : (
                          <span className="w-3.5 h-3.5 shrink-0 rounded-full border border-border" />
                        )}
                        <CategoryBadge category={s.category} size="sm" truncate />
                        {s.merchant && (
                          <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                            · {s.merchant}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-semibold tabular-nums ${
                          confPct >= 90
                            ? "text-emerald"
                            : confPct >= 70
                              ? "text-topaz"
                              : "text-muted-foreground"
                        }`}
                      >
                        {confPct}%
                      </span>
                    </button>
                  );
                })}
              </div>

              {topSuggestion?.recurring && (
                <label className="flex items-center gap-2 pt-2 border-t border-emerald/15 text-xs cursor-pointer">
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

          {/* Mode Selector (Standard / Split / Transfer) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              {transactionModes.map(({ value, label, Icon }) => {
                const active = entryMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEntryMode(value)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-medium transition ${
                      active
                        ? "border-emerald/40 bg-emerald/10 text-foreground font-semibold shadow-sm"
                        : "border-border bg-secondary/20 text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 ${
                        active ? "text-emerald" : "text-muted-foreground"
                      }`}
                    />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Maaser calculation exclusion (if income or transfer) */}
          {(form.is_income || entryMode === "transfer") && (
            <div className="rounded-xl border border-border bg-secondary/15 p-3 space-y-1">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.exclude_from_maaser || entryMode === "transfer"}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      exclude_from_maaser: e.target.checked,
                    })
                  }
                  disabled={entryMode === "transfer"}
                  className="accent-topaz h-4 w-4 rounded cursor-pointer"
                />
                <span>Exclude from Maaser tithe</span>
              </label>
              <p className="text-[11px] text-muted-foreground pl-6">
                {entryMode === "transfer"
                  ? "Internal transfers are automatically excluded from tithe obligations."
                  : "Check to exclude this income from the 10% Maaser calculation."}
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label
              htmlFor="tx-notes"
              className="text-xs font-medium text-muted-foreground block mb-1.5"
            >
              Notes
            </label>
            <textarea
              id="tx-notes"
              placeholder="Optional notes or receipt details..."
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="flex min-h-[60px] w-full rounded-xl bg-secondary/30 border border-border px-3.5 py-2.5 text-xs transition-colors placeholder:text-muted-foreground focus:border-emerald/50 focus:ring-2 focus:ring-emerald/20 focus:outline-none"
            />
          </div>

          {/* More options accordion */}
          {!editingId && (
            <div>
              <button
                type="button"
                onClick={() => setShowMore(!showMore)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition"
              >
                {showMore ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                <span>
                  {hasManualFields
                    ? "Additional classification fields set"
                    : "Additional details (Occasion, Merchant, Budget Type)"}
                </span>
              </button>

              {showMore && (
                <div className="mt-2 space-y-2 p-3 rounded-xl bg-secondary/20 border border-border animate-[fadeUp_0.2s_ease-out]">
                  <select
                    value={form.budget_type}
                    onChange={(e) =>
                      setForm({ ...form, budget_type: e.target.value })
                    }
                    className="flex h-9 w-full rounded-lg bg-card border border-border px-3 text-xs transition-colors"
                  >
                    <option value="">Budget type (optional)...</option>
                    {BUDGET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Occasion (e.g. Pesach 2026, Wedding)"
                    value={form.occasion}
                    onChange={(e) =>
                      setForm({ ...form, occasion: e.target.value })
                    }
                    className="h-9 text-xs"
                  />
                  <Input
                    placeholder="Merchant name (e.g. Tesco, Amazon)"
                    value={form.merchant}
                    onChange={(e) =>
                      setForm({ ...form, merchant: e.target.value })
                    }
                    className="h-9 text-xs"
                  />
                </div>
              )}
            </div>
          )}

          {/* Hidden submit trigger so Enter in any input triggers onSubmit */}
          <button type="submit" className="hidden" tabIndex={-1} />
        </form>

        {/* Modal Footer */}
        <div className="border-t border-border px-5 py-3.5 bg-card/90 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outlinePill"
            size="sm"
            onClick={onClose}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="tx-submit"
            onClick={onSubmit}
            className="text-xs font-semibold px-4"
          >
            {editingId ? "Save changes" : "Add transaction"}
          </Button>
        </div>
      </div>
    </div>
  );
}

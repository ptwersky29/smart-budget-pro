import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Plus, Trash2, Pencil, Check, Loader2, PiggyBank } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, MetricCard, PageHeader, SectionCard } from "../components/ui/layout";
import { SkeletonCard } from "../components/ui/Skeleton";

export default function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [form, setForm] = useState({ category: "", limit: "" });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/budgets");
      setBudgets(data.budgets || []);
    } catch {
      toast.error("Could not load budgets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]);

  // Calculate summary stats
  const summary = useMemo(() => {
    const totalLimit = budgets.reduce((sum, b) => sum + (Number(b.limit) || 0), 0);
    const totalSpent = budgets.reduce((sum, b) => sum + (Number(b.spent) || 0), 0);
    const overCount = budgets.filter(b => (b.progress_pct || 0) >= 100).length;
    return { totalLimit, totalSpent, overCount };
  }, [budgets]);

  // Create new budget
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.category.trim() || !form.limit) {
      toast.error("Please enter a category and limit");
      return;
    }
    try {
      const { data } = await api.post("/budgets", {
        category: form.category.toLowerCase().trim(),
        limit: parseFloat(form.limit),
      });
      toast.success("Budget created!");
      setForm({ category: "", limit: "" });
      await loadBudgets();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not create budget");
    }
  };

  // Start editing
  const startEdit = (budget) => {
    setEditingId(budget.budget_id);
    setForm({ category: budget.category, limit: String(budget.limit) });
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingId(null);
    setForm({ category: "", limit: "" });
  };

  // Save budget update
  const handleUpdate = async (id) => {
    if (!form.category.trim() || !form.limit) {
      toast.error("Please enter a category and limit");
      return;
    }
    try {
      await api.patch(`/budgets/${id}`, {
        category: form.category.toLowerCase().trim(),
        limit: parseFloat(form.limit),
      });
      toast.success("Budget updated");
      cancelEdit();
      await loadBudgets();
    } catch {
      toast.error("Could not update budget");
    }
  };

  // Delete budget
  const handleDelete = async (id) => {
    if (!window.confirm("Remove this budget?")) return;
    try {
      await api.delete(`/budgets/${id}`);
      toast.success("Budget removed");
      await loadBudgets();
    } catch {
      toast.error("Could not delete budget");
    }
  };

  // Category autocomplete options
  const CATEGORY_OPTIONS = [
    "groceries", "dining", "transport", "rent", "utilities",
    "subscriptions", "tzedakah", "health", "entertainment",
    "shopping", "insurance", "education", "gifts", "charity"
  ];

  return (
    <div className="space-y-6" data-testid="budgets-root">
      <PageHeader
        eyebrow="Money"
        title="Monthly Budgets"
        description="Set spending limits for each category and track your progress"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Active budgets" value={budgets.length.toString()} />
        <MetricCard label="Total monthly limit" value={`£${summary.totalLimit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <MetricCard 
          label="Over budget" 
          value={summary.overCount.toString()} 
          tone={summary.overCount ? "ruby" : "emerald"}
        />
      </div>

      {/* Quick add form */}
      <SectionCard 
        eyebrow="Quick add" 
        title="Add a new budget" 
        className="mt-4"
      >
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="label-overline">Category</label>
            <input
              list="budget-categories"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="e.g., groceries"
              className="mt-1 w-full control-shell"
              required
            />
            <datalist id="budget-categories">
              {CATEGORY_OPTIONS.map(cat => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="label-overline">Monthly limit (£)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.limit}
              onChange={(e) => setForm({ ...form, limit: e.target.value })}
              placeholder="e.g., 300"
              className="mt-1 w-full control-shell"
              required
            />
          </div>
          <button 
            type="submit" 
            className="btn-pill gradient-emerald text-white text-sm h-[42px]"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Budget
          </button>
        </form>
      </SectionCard>

      {/* Loading state */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : (
        /* Budget list */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {budgets.length === 0 ? (
            <EmptyState 
              icon={PiggyBank} 
              title="No budgets yet" 
              description="Start by adding your first budget above. Track spending and stay within your limits." 
              className="col-span-full" 
            />
          ) : (
            budgets.map((budget) => {
              const over = (budget.progress_pct || 0) >= 100;
              const isEditing = editingId === budget.budget_id;

              return (
                <div key={budget.budget_id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  {isEditing ? (
                    /* Edit mode */
                    <div className="space-y-3">
                      <div>
                        <label className="label-overline">Category</label>
                        <input
                          list="budget-categories"
                          value={form.category}
                          onChange={(e) => setForm({ ...form, category: e.target.value })}
                          className="mt-1 w-full control-shell"
                        />
                      </div>
                      <div>
                        <label className="label-overline">Monthly limit (£)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.limit}
                          onChange={(e) => setForm({ ...form, limit: e.target.value })}
                          className="mt-1 w-full control-shell"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdate(budget.budget_id)}
                          className="flex-1 h-9 rounded-xl bg-emerald text-white text-xs font-medium inline-flex items-center justify-center gap-1"
                        >
                          <Check className="h-3 w-3" /> Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="flex-1 h-9 rounded-xl border border-border text-xs font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-semibold capitalize">{budget.category}</p>
                        <div className="flex gap-1">
                          <button
                            onClick={() => startEdit(budget)}
                            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-emerald transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(budget.budget_id)}
                            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-ruby transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      
                      {/* Progress display */}
                      <div className="mb-4">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">
                            £{(budget.spent || 0).toFixed(2)} used
                          </span>
                          <span className="font-medium">
                            £{budget.limit.toFixed(2)} limit
                          </span>
                        </div>
                        <div className="h-3 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              over 
                                ? "bg-ruby" 
                                : "bg-gradient-to-r from-emerald to-emerald/80"
                            }`}
                            style={{ width: `${Math.min(100, budget.progress_pct || 0)}%` }}
                          />
                        </div>
                      </div>

                      {/* Status text */}
                      <p className={`text-sm ${
                        over 
                          ? "text-ruby font-medium" 
                          : "text-muted-foreground"
                      }`}>
                        {over 
                          ? `Over budget by £${Math.abs(budget.remaining || 0).toFixed(2)}`
                          : `${(budget.remaining || 0).toFixed(2)} remaining`
                        }
                      </p>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Quick tips */}
      <div className="rounded-2xl border border-emerald/20 bg-emerald/5 p-4">
        <h4 className="font-semibold text-emerald mb-2">Budget Tips</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Start with 5-7 key categories (groceries, transport, dining, etc.)</li>
          <li>• Set realistic limits based on your average spending</li>
          <li>• Review budgets monthly and adjust as needed</li>
          <li>• Use category colors to quickly spot overages</li>
        </ul>
      </div>
    </div>
  );
}

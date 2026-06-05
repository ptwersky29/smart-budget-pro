import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Plus, Trash2, Pencil, Check, Loader2, PiggyBank, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, MetricCard, PageHeader, SectionCard } from "../components/ui/layout";
import { SkeletonCard } from "../components/ui/Skeleton";
import ConfirmModal from "../components/ui/ConfirmModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../components/ui/collapsible";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export default function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [form, setForm] = useState({ category: "", limit: "" });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showForm, setShowForm] = useState(true);

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
    try {
      await api.delete(`/budgets/${id}`);
      toast.success("Budget removed");
      setConfirmDelete(null);
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

      {/* Quick add — collapsible */}
      <Collapsible open={showForm} onOpenChange={setShowForm} className="rounded-2xl border border-border bg-card">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-5 text-left">
            <span className="font-medium text-sm">Add a new budget</span>
            <span className="text-xs text-muted-foreground">{showForm ? "Hide" : "Show"}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-5 pb-5 border-t border-border pt-4">
            <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="label-overline">Category</label>
                <Input list="budget-categories" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g., groceries" className="mt-1 w-full" required />
                <datalist id="budget-categories">
                  {CATEGORY_OPTIONS.map(cat => <option key={cat} value={cat} />)}
                </datalist>
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="label-overline">Monthly limit (£)</label>
                <Input type="number" step="0.01" min="0" value={form.limit}
                  onChange={(e) => setForm({ ...form, limit: e.target.value })}
                  placeholder="e.g., 300" className="mt-1 w-full" required />
              </div>
              <Button type="submit" variant="primary" size="pill">
                <Plus className="h-4 w-4" /> Add Budget
              </Button>
            </form>
          </div>
        </CollapsibleContent>
      </Collapsible>

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
                    <div className="space-y-3">
                      <div>
                        <label className="label-overline">Category</label>
                        <Input list="budget-categories" value={form.category}
                          onChange={(e) => setForm({ ...form, category: e.target.value })}
                          className="mt-1 w-full" />
                      </div>
                      <div>
                        <label className="label-overline">Monthly limit (£)</label>
                        <Input type="number" step="0.01" min="0" value={form.limit}
                          onChange={(e) => setForm({ ...form, limit: e.target.value })}
                          className="mt-1 w-full" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleUpdate(budget.budget_id)}
                          className="flex-1 h-9 rounded-xl bg-emerald text-white text-xs font-medium inline-flex items-center justify-center gap-1">
                          <Check className="h-3 w-3" /> Save
                        </button>
                        <button onClick={cancelEdit}
                          className="flex-1 h-9 rounded-xl border border-border text-xs font-medium">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-semibold capitalize">{budget.category}</p>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" aria-label="Budget actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => startEdit(budget)}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setConfirmDelete(budget.budget_id)} className="text-ruby">
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="mb-4">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">£{(budget.spent || 0).toFixed(2)} used</span>
                          <span className="font-medium">£{budget.limit.toFixed(2)} limit</span>
                        </div>
                        <div className="h-3 bg-secondary rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${over ? "bg-ruby" : "bg-gradient-to-r from-emerald to-emerald/80"}`}
                            style={{ width: `${Math.min(100, budget.progress_pct || 0)}%` }} />
                        </div>
                      </div>
                      <p className={`text-sm ${over ? "text-ruby font-medium" : "text-muted-foreground"}`}>
                        {over ? `Over budget by £${Math.abs(budget.remaining || 0).toFixed(2)}` : `${(budget.remaining || 0).toFixed(2)} remaining`}
                      </p>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Remove budget?"
          message="This will permanently delete this budget."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

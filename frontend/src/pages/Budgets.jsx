import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Plus, Trash2, Pencil, X, Check, Loader2, PiggyBank } from "lucide-react";
import { toast } from "sonner";
import AIInsightPanel from "../components/AIInsightPanel";
import { EmptyState, MetricCard, PageHeader, SectionCard } from "../components/ui/layout";
import { SkeletonCard } from "../components/ui/Skeleton";

const CATS = ["groceries","dining","transport","utilities","subscriptions","tzedakah","rent","salary","income","shopping","health","entertainment","insurance","education","transfer","cash","tax","fees","mortgage","uncategorized"];

export default function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [form, setForm] = useState({ category: "", limit: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ category: "", limit: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/budgets");
      setBudgets(data.budgets);
    } catch { toast.error("Could not load budgets"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => {
    const totalLimit = budgets.reduce((sum, budget) => sum + Number(budget.limit || 0), 0);
    const totalSpent = budgets.reduce((sum, budget) => sum + Number(budget.spent || 0), 0);
    const overCount = budgets.filter((budget) => Number(budget.progress_pct || 0) >= 100).length;
    return { totalLimit, totalSpent, overCount };
  }, [budgets]);

  const create = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/budgets", { category: form.category.toLowerCase(), limit: parseFloat(form.limit) });
      toast("Budget created", {
        action: { label: "Undo", onClick: async () => { await api.delete(`/budgets/${data.budget_id}`); toast.success("Undone"); await load(); } },
        duration: 6000,
      });
      setForm({ category: "", limit: "" });
      await load();
    } catch {
      toast.error("Could not create");
    }
  };

  const del = async (id) => {
    const budget = budgets.find(b => b.budget_id === id);
    try {
      await api.delete(`/budgets/${id}`);
      toast("Budget removed", {
        action: { label: "Undo", onClick: async () => { await api.post("/budgets", { category: budget.category, limit: Number(budget.limit) }); toast.success("Restored"); await load(); } },
        duration: 6000,
      });
      await load();
    } catch {
      toast.error("Could not delete");
    }
  };

  const startEdit = (b) => {
    setEditingId(b.budget_id);
    setEditForm({ category: b.category, limit: String(b.limit) });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ category: "", limit: "" });
  };

  const saveEdit = async (id) => {
    try {
      await api.patch(`/budgets/${id}`, {
        category: editForm.category.toLowerCase(),
        limit: parseFloat(editForm.limit),
      });
      toast.success("Budget updated");
      cancelEdit();
      await load();
    } catch {
      toast.error("Could not update");
    }
  };

  return (
    <div className="space-y-6" data-testid="budgets-root">
      <PageHeader
        eyebrow="Money"
        title="Plan, don't react."
        description="Keep spending simple with clean budgets, progress tracking, and quick updates."
        actions={
          <button onClick={() => document.getElementById("budget-form")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="btn-pill gradient-emerald text-white text-sm h-11 px-5">
            <Plus className="h-4 w-4 mr-2" /> Add budget
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Budgets" value={budgets.length.toString()} />
        <MetricCard label="Total limit" value={`£${summary.totalLimit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <MetricCard label="Over budget" value={summary.overCount.toString()} tone={summary.overCount ? "ruby" : "emerald"} />
      </div>

      <SectionCard eyebrow="AI coach" title="Smart limits based on your spending" contentClassName="pt-0">
        <AIInsightPanel
          title="AI Budget Coach"
          subtitle="Smart limits based on your spending"
          endpoint="/ai/insights/budget"
          render={(d) => (
            <div className="mt-5 space-y-5">
              {d.summary && <p className="text-base font-medium">{d.summary}</p>}
              {d.recommendations?.length > 0 && (
                <div>
                  <p className="label-overline mb-2">Suggested budgets</p>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {d.recommendations.map((r, i) => (
                      <div key={i} className="rounded-xl border border-border bg-secondary/30 p-4">
                        <p className="text-xs text-muted-foreground capitalize">{r.category}</p>
                        <p className="text-2xl tracking-tight font-medium text-emerald mt-1">£{r.suggested_monthly_limit}<span className="text-xs text-muted-foreground"> /mo</span></p>
                        <p className="text-xs mt-2 text-muted-foreground leading-snug">{r.rationale}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {d.categories_to_reduce?.length > 0 && (
                <div>
                  <p className="label-overline mb-2">Easy wins</p>
                  <div className="space-y-2">
                    {d.categories_to_reduce.map((c, i) => (
                      <div key={i} className="flex gap-3 items-start p-3 rounded-lg bg-topaz/5 border border-topaz/20">
                        <span className="text-topaz font-semibold">−£{c.potential_monthly_saving}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium capitalize">{c.category}</p>
                          <p className="text-xs text-muted-foreground">{c.tip}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        />
      </SectionCard>

      <SectionCard eyebrow="Create" title="New budget">
        <div id="budget-form" className="scroll-mt-24">
          <form onSubmit={create} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="label-overline">Category</label>
              <input list="bud-cats" data-testid="budget-cat" required value={form.category} onChange={(e)=>setForm({...form, category:e.target.value})} placeholder="groceries" className="mt-1 w-full control-shell" />
              <datalist id="bud-cats">{CATS.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="label-overline">Monthly limit (£)</label>
              <input data-testid="budget-limit" required type="number" step="0.01" value={form.limit} onChange={(e)=>setForm({...form, limit:e.target.value})} placeholder="300" className="mt-1 w-full control-shell" />
            </div>
            <button data-testid="budget-submit" className="btn-pill gradient-emerald text-white text-sm"><Plus className="h-4 w-4 mr-2"/>Add budget</button>
          </form>
        </div>
      </SectionCard>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {budgets.length === 0 ? (
          <EmptyState icon={PiggyBank}
            title="No budgets yet"
            description="Add your first monthly budget to start tracking spending."
            className="col-span-full"
          />
        ) : (
          budgets.map((b) => {
            const over = b.progress_pct >= 100;
            const isEditing = editingId === b.budget_id;
            return (
              <div key={b.budget_id} className="section-shell p-5">
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="label-overline">Category</label>
                      <input value={editForm.category} onChange={(e)=>setEditForm({...editForm, category:e.target.value})} className="mt-1 w-full control-shell text-sm" />
                    </div>
                    <div>
                      <label className="label-overline">Monthly limit (£)</label>
                      <input type="number" step="0.01" value={editForm.limit} onChange={(e)=>setEditForm({...editForm, limit:e.target.value})} className="mt-1 w-full control-shell text-sm" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={()=>saveEdit(b.budget_id)} data-testid={`save-budget-${b.budget_id}`} className="flex-1 h-9 rounded-full bg-emerald text-white text-xs inline-flex items-center justify-center gap-1"><Check className="h-3 w-3"/>Save</button>
                      <button onClick={cancelEdit} className="flex-1 h-9 rounded-full border border-border text-xs inline-flex items-center justify-center gap-1"><X className="h-3 w-3"/>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="font-medium capitalize">{b.category}</p>
                      <div className="flex items-center gap-2">
                        <button onClick={()=>startEdit(b)} data-testid={`edit-budget-${b.budget_id}`} className="p-2 text-muted-foreground hover:text-emerald" title="Edit"><Pencil className="h-4 w-4"/></button>
                        <button onClick={()=>del(b.budget_id)} data-testid={`del-budget-${b.budget_id}`} className="p-2 text-muted-foreground hover:text-ruby" title="Delete"><Trash2 className="h-4 w-4"/></button>
                      </div>
                    </div>
                    <p className="text-2xl tracking-tight font-semibold mt-3">£{b.spent} <span className="text-sm text-muted-foreground">/ £{b.limit}</span></p>
                    <div className="mt-4 h-2 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full ${over ? "bg-ruby" : "gradient-emerald"}`} style={{width: `${Math.min(100, b.progress_pct)}%`}} />
                    </div>
                    <p className={`text-xs mt-2 ${over ? "text-ruby" : "text-muted-foreground"}`}>
                      {over ? `Over by £${Math.abs(b.remaining).toFixed(2)}` : `£${b.remaining.toFixed(2)} remaining`}
                    </p>
                  </>
                )}
              </div>
            );
          })
          )}
        )}
      </div>
      )}
    </div>
  );
}

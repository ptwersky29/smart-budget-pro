import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";
import AIInsightPanel from "../components/AIInsightPanel";

const CATS = ["groceries","dining","transport","utilities","subscriptions","tzedakah","rent","salary","income","shopping","health","entertainment","insurance","education","transfer","cash","tax","fees","mortgage","uncategorized"];

export default function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [form, setForm] = useState({ category: "", limit: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ category: "", limit: "" });

  const load = useCallback(async () => {
    const { data } = await api.get("/budgets"); setBudgets(data.budgets);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    try { await api.post("/budgets", { category: form.category.toLowerCase(), limit: parseFloat(form.limit) });
      toast.success("Budget created"); setForm({category:"", limit:""}); await load();
    } catch { toast.error("Could not create"); }
  };

  const del = async (id) => {
    try { await api.delete(`/budgets/${id}`); toast.success("Removed"); await load(); }
    catch { toast.error("Could not delete"); }
  };

  const startEdit = (b) => {
    setEditingId(b.budget_id);
    setEditForm({ category: b.category, limit: String(b.limit) });
  };
  const cancelEdit = () => { setEditingId(null); setEditForm({ category: "", limit: "" }); };
  const saveEdit = async (id) => {
    try {
      await api.patch(`/budgets/${id}`, {
        category: editForm.category.toLowerCase(),
        limit: parseFloat(editForm.limit),
      });
      toast.success("Budget updated");
      cancelEdit();
      await load();
    } catch { toast.error("Could not update"); }
  };

  return (
    <div className="space-y-6" data-testid="budgets-root">
      <div>
        <p className="label-overline text-emerald">Budgets</p>
        <h1 className="text-4xl tracking-tight font-medium mt-1">Plan, don't react.</h1>
      </div>

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

      <form onSubmit={create} className="rounded-2xl border border-border bg-card p-6 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="label-overline">Category</label>
          <input list="bud-cats" data-testid="budget-cat" required value={form.category} onChange={(e)=>setForm({...form, category:e.target.value})} placeholder="groceries" className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
          <datalist id="bud-cats">{CATS.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="label-overline">Monthly limit (£)</label>
          <input data-testid="budget-limit" required type="number" step="0.01" value={form.limit} onChange={(e)=>setForm({...form, limit:e.target.value})} placeholder="300" className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
        </div>
        <button data-testid="budget-submit" className="btn-pill gradient-emerald text-white text-sm"><Plus className="h-4 w-4 mr-2"/>Add budget</button>
      </form>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {budgets.length === 0 ? <p className="text-sm text-muted-foreground col-span-full">No budgets yet — add one above.</p> :
          budgets.map((b)=> {
            const over = b.progress_pct >= 100;
            const isEditing = editingId === b.budget_id;
            return (
              <div key={b.budget_id} className="rounded-2xl border border-border bg-card p-5">
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="label-overline">Category</label>
                      <input value={editForm.category} onChange={(e)=>setEditForm({...editForm, category:e.target.value})} className="mt-1 w-full h-10 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none text-sm" />
                    </div>
                    <div>
                      <label className="label-overline">Monthly limit (£)</label>
                      <input type="number" step="0.01" value={editForm.limit} onChange={(e)=>setEditForm({...editForm, limit:e.target.value})} className="mt-1 w-full h-10 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none text-sm" />
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
                        <button onClick={()=>startEdit(b)} data-testid={`edit-budget-${b.budget_id}`} className="text-muted-foreground hover:text-emerald" title="Edit"><Pencil className="h-4 w-4"/></button>
                        <button onClick={()=>del(b.budget_id)} data-testid={`del-budget-${b.budget_id}`} className="text-muted-foreground hover:text-ruby" title="Delete"><Trash2 className="h-4 w-4"/></button>
                      </div>
                    </div>
                    <p className="text-2xl tracking-tight font-medium mt-3">£{b.spent} <span className="text-sm text-muted-foreground">/ £{b.limit}</span></p>
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
          })}
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Plus, Trash2, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

const CATS = ["groceries","dining","transport","utilities","subscriptions","tzedakah","rent","salary","income","shopping","health","entertainment","insurance","education","transfer","cash","tax","fees","mortgage","uncategorized"];

const emptyForm = { description: "", amount: "", category: "", is_income: false };

export default function Transactions() {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/transactions"); setTxs(data.transactions); }
    catch (err) { console.error("tx load", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (t) => {
    setEditingId(t.transaction_id);
    setForm({
      description: t.description || "",
      amount: String(Math.abs(t.amount)),
      category: t.category || "",
      is_income: t.amount > 0,
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const amt = parseFloat(form.amount);
      const signed = form.is_income ? Math.abs(amt) : -Math.abs(amt);
      if (editingId) {
        await api.patch(`/transactions/${editingId}`, {
          description: form.description,
          amount: signed,
          category: form.category || undefined,
          is_income: form.is_income,
        });
        toast.success("Transaction updated");
      } else {
        await api.post("/transactions", {
          description: form.description,
          amount: signed,
          category: form.category || undefined,
          is_income: form.is_income,
        });
        toast.success("Transaction added");
      }
      setOpen(false); setEditingId(null); setForm(emptyForm); await load();
    } catch { toast.error(editingId ? "Could not update" : "Could not add"); }
  };

  const del = async (id) => {
    try { await api.delete(`/transactions/${id}`); toast.success("Deleted"); await load(); }
    catch { toast.error("Could not delete"); }
  };

  return (
    <div className="space-y-6" data-testid="transactions-root">
      <div className="flex items-center justify-between">
        <div>
          <p className="label-overline text-emerald">Transactions</p>
          <h1 className="text-4xl tracking-tight font-medium mt-1">Every penny.</h1>
        </div>
        <button onClick={openAdd} data-testid="add-transaction" className="btn-pill gradient-emerald text-white text-sm"><Plus className="h-4 w-4 mr-2" /> Add</button>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? <div className="p-10 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-emerald" /></div> :
        txs.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No transactions yet.</div> :
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="px-6 py-3">Date</th><th className="px-6 py-3">Description</th><th className="px-6 py-3">Category</th><th className="px-6 py-3 text-right">Amount</th><th className="px-6 py-3 w-24"></th>
          </tr></thead>
          <tbody>
            {txs.map((t)=>(
              <tr key={t.transaction_id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-6 py-3 text-xs text-muted-foreground">{t.date?.slice(0,10)}</td>
                <td className="px-6 py-3 font-medium">{t.description}</td>
                <td className="px-6 py-3"><span className="text-xs px-2 py-1 rounded-full bg-secondary capitalize">{t.category}</span></td>
                <td className={`px-6 py-3 text-right font-medium ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}>{t.amount > 0 ? "+" : ""}£{Math.abs(t.amount).toFixed(2)}</td>
                <td className="px-6 py-3 text-right whitespace-nowrap">
                  <button onClick={()=>openEdit(t)} data-testid={`edit-${t.transaction_id}`} className="text-muted-foreground hover:text-emerald mr-3" title="Edit"><Pencil className="h-4 w-4"/></button>
                  <button onClick={()=>del(t.transaction_id)} data-testid={`del-${t.transaction_id}`} className="text-muted-foreground hover:text-ruby" title="Delete"><Trash2 className="h-4 w-4"/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={()=>setOpen(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md" onClick={(e)=>e.stopPropagation()}>
            <h3 className="text-xl tracking-tight font-medium mb-4">{editingId ? "Edit transaction" : "New transaction"}</h3>
            <form onSubmit={submit} className="space-y-3">
              <input data-testid="tx-desc" required placeholder="Description" value={form.description} onChange={(e)=>setForm({...form, description:e.target.value})} className="w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
              <input data-testid="tx-amount" required type="number" step="0.01" placeholder="Amount (£)" value={form.amount} onChange={(e)=>setForm({...form, amount:e.target.value})} className="w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
              <select data-testid="tx-category" value={form.category} onChange={(e)=>setForm({...form, category:e.target.value})} className="w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none">
                <option value="">Auto-categorise</option>
                {CATS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_income} onChange={(e)=>setForm({...form, is_income:e.target.checked})} /> This is income</label>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={()=>setOpen(false)} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary/50 text-sm">Cancel</button>
                <button data-testid="tx-submit" className="btn-pill flex-1 gradient-emerald text-white">{editingId ? "Save changes" : "Add transaction"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

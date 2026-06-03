import React, { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Pencil, RefreshCcw, Sparkles, Bell } from "lucide-react";
import { EmptyState, PageHeader, SectionCard } from "../components/ui/layout";

const emptyForm = { name: "", amount: "", category: "", frequency: "monthly", merchant: "", notes: "" };

export default function Subscriptions() {
  const [subs, setSubs] = useState([]);
  const [detected, setDetected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [detecting, setDetecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/subscriptions");
      setSubs(data.subscriptions);
    } catch (err) { console.error("subs load", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const detectRecurring = async () => {
    setDetecting(true);
    try {
      const { data } = await api.post("/transactions/detect-recurring");
      setDetected(data.recurring.filter((r) => r.is_subscription));
      toast.success(`Found ${data.recurring.filter((r) => r.is_subscription).length} potential subscriptions`);
    } catch (e) { toast.error(formatApiError(e) || "Detection failed"); }
    finally { setDetecting(false); }
  };

  const addFromDetected = async (item) => {
    try {
      await api.post("/subscriptions", {
        name: item.normalized_merchant || item.description,
        amount: item.amount,
        category: item.category,
        frequency: item.frequency === "monthly" ? "monthly" : item.frequency,
        merchant: item.normalized_merchant,
      });
      toast.success("Subscription saved");
      setDetected((prev) => prev.filter((d) => d !== item));
      await load();
    } catch (e) { toast.error(formatApiError(e) || "Could not save"); }
  };

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (s) => {
    setEditingId(s.subscription_id);
    setForm({ name: s.name, amount: String(s.amount), category: s.category || "", frequency: s.frequency, merchant: s.merchant || "", notes: s.notes || "" });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = { name: form.name, amount: parseFloat(form.amount), category: form.category || undefined, frequency: form.frequency, merchant: form.merchant || undefined, notes: form.notes || undefined };
      if (editingId) {
        await api.patch(`/subscriptions/${editingId}`, payload);
        toast.success("Updated");
      } else {
        await api.post("/subscriptions", payload);
        toast.success("Added");
      }
      setOpen(false); setEditingId(null); setForm(emptyForm); await load();
    } catch (e) { toast.error(formatApiError(e) || "Could not save"); }
  };

  const toggleActive = async (s) => {
    try { await api.patch(`/subscriptions/${s.subscription_id}`, { active: !s.active }); toast.success(s.active ? "Paused" : "Activated"); await load(); }
    catch (e) { toast.error(formatApiError(e) || "Could not update"); }
  };

  const del = async (id) => {
    const sub = subs.find(s => s.subscription_id === id);
    try { await api.delete(`/subscriptions/${id}`); toast("Subscription deleted", { action: { label: "Undo", onClick: async () => { await api.post("/subscriptions", { name: sub.name, amount: Math.abs(sub.amount), category: sub.category, frequency: sub.frequency, merchant: sub.merchant, notes: sub.notes }); toast.success("Restored"); await load(); } }, duration: 6000 }); await load(); }
    catch (e) { toast.error(formatApiError(e) || "Could not delete"); }
  };

  const monthlyTotal = subs.filter((s) => s.active).reduce((sum, s) => sum + Math.abs(s.amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recurring"
        title="Subscriptions."
        description={`${subs.filter((s) => s.active).length} active — £${monthlyTotal.toFixed(2)} / mo`}
        actions={
          <div className="flex gap-2">
            <button onClick={detectRecurring} disabled={detecting} className="btn-pill border border-emerald text-emerald text-sm h-11 px-4 disabled:opacity-50">
              {detecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Detect
            </button>
            <button onClick={openAdd} className="btn-pill gradient-emerald text-white text-sm h-11 px-5">
              <Plus className="h-4 w-4 mr-2" /> Add
            </button>
          </div>
        }
      />

      {detected.length > 0 && (
        <SectionCard eyebrow="AI Detected" title="Potential subscriptions found" contentClassName="p-0">
          <div className="divide-y divide-border text-sm">
            {detected.map((item, i) => (
              <div key={i} className="px-6 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{item.normalized_merchant || item.description}</p>
                  <p className="text-xs text-muted-foreground">£{item.amount.toFixed(2)} / {item.frequency} &middot; {item.occurrences} occurrences</p>
                </div>
                <button onClick={() => addFromDetected(item)} className="btn-pill border border-emerald text-emerald text-sm">Save</button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard eyebrow="Managed" title={`${subs.length} subscription${subs.length !== 1 ? "s" : ""}`}>
        {loading ? (
          <div className="p-10 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-emerald" /></div>
        ) : subs.length === 0 ? (
            <EmptyState icon={Bell}
              title="No subscriptions yet"
              description="Add one manually or run Detect to find recurring payments."
            />
        ) : (<>
          {/* Mobile card view */}
          <div className="block sm:hidden divide-y divide-border">
            {subs.map((s) => (
              <div key={s.subscription_id} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{s.name}</p>
                    {s.merchant && <p className="text-xs text-muted-foreground truncate">{s.merchant}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(s)} className="p-2 text-muted-foreground hover:text-emerald" title="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(s.subscription_id)} className="p-2 text-muted-foreground hover:text-ruby" title="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-medium">£{Math.abs(s.amount).toFixed(2)}</span>
                    <span className="text-xs text-muted-foreground capitalize">/ {s.frequency}</span>
                  </div>
                  <button onClick={() => toggleActive(s)} className={`text-xs px-2 py-1 rounded-full ${s.active ? "bg-emerald/10 text-emerald" : "bg-muted text-muted-foreground"}`}>
                    {s.active ? "Active" : "Paused"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-6 py-3">Name</th><th className="px-6 py-3">Amount</th><th className="px-6 py-3">Frequency</th><th className="px-6 py-3">Status</th><th className="px-6 py-3 w-24"></th>
              </tr></thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.subscription_id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-6 py-3 font-medium">{s.name}{s.merchant && <span className="text-xs text-muted-foreground ml-2">{s.merchant}</span>}</td>
                    <td className="px-6 py-3 tabular-nums">£{Math.abs(s.amount).toFixed(2)}</td>
                    <td className="px-6 py-3 text-xs capitalize">{s.frequency}</td>
                    <td className="px-6 py-3">
                      <button onClick={() => toggleActive(s)} className={`text-xs px-2 py-1 rounded-full ${s.active ? "bg-emerald/10 text-emerald" : "bg-muted text-muted-foreground"}`}>
                        {s.active ? "Active" : "Paused"}
                      </button>
                    </td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(s)} className="p-2 text-muted-foreground hover:text-emerald" title="Edit"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => del(s.subscription_id)} className="p-2 text-muted-foreground hover:text-ruby" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </SectionCard>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="page-shell p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl tracking-tight font-medium mb-4">{editingId ? "Edit subscription" : "New subscription"}</h3>
            <form onSubmit={submit} className="space-y-3">
              <input required placeholder="Name (e.g. Netflix)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full control-shell" />
              <input required type="number" step="0.01" placeholder="Amount (£)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full control-shell" />
              <input placeholder="Merchant (optional)" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} className="w-full control-shell" />
              <div className="grid grid-cols-2 gap-2">
                <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="control-shell">
                  <option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="weekly">Weekly</option>
                </select>
                <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="control-shell" />
              </div>
              <textarea placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full control-shell" rows={2} />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary/50 text-sm">Cancel</button>
                <button className="btn-pill flex-1 gradient-emerald text-white">{editingId ? "Save" : "Add"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

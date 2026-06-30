import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { withUndo } from "../lib/undo";
import { Loader2, Plus, Trash2, Pencil, RefreshCcw, Sparkles, Bell, ChevronDown, RefreshCw } from "lucide-react";
import { EmptyState, SectionCard } from "../components/ui/layout";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import Skeleton from "../components/ui/Skeleton";
import RecurringTransactionManager from "../components/RecurringTransactionManager";

const emptyForm = { name: "", amount: "", category: "", frequency: "monthly", merchant: "", notes: "" };

export default function Subscriptions() {
  useEffect(() => { document.title = "Subscriptions | FinanceAI"; }, []);
  const [subs, setSubs] = useState([]);
  const subsRef = useRef(subs);
  subsRef.current = subs;
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
    const optimisticSub = { subscription_id: `optimistic-${Date.now()}`, name: item.normalized_merchant || item.description, amount: item.amount, category: item.category, frequency: item.frequency === "monthly" ? "monthly" : item.frequency, active: true, merchant: item.normalized_merchant };
    setSubs(prev => [...prev, optimisticSub]);
    setDetected((prev) => prev.filter((d) => d !== item));
    try {
      const { data } = await api.post("/subscriptions", {
        name: item.normalized_merchant || item.description,
        amount: item.amount,
        category: item.category,
        frequency: item.frequency === "monthly" ? "monthly" : item.frequency,
        merchant: item.normalized_merchant,
      });
      setSubs(prev => prev.map(s => s.subscription_id === optimisticSub.subscription_id ? data : s));
      toast.success("Subscription saved");
    } catch (e) {
      setSubs(prev => prev.filter(s => s.subscription_id !== optimisticSub.subscription_id));
      setDetected((prev) => [...prev, item]);
      toast.error(formatApiError(e) || "Could not save");
    }
  };

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (s) => {
    setEditingId(s.subscription_id);
    setForm({ name: s.name, amount: String(s.amount), category: s.category || "", frequency: s.frequency, merchant: s.merchant || "", notes: s.notes || "" });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = { name: form.name, amount: parseFloat(form.amount), category: form.category || undefined, frequency: form.frequency, merchant: form.merchant || undefined, notes: form.notes || undefined };
    setOpen(false); setEditingId(null); setForm(emptyForm);
    if (editingId) {
      const old = subsRef.current.find(s => s.subscription_id === editingId);
      setSubs(prev => prev.map(s => s.subscription_id === editingId ? { ...s, ...payload } : s));
      withUndo({
        action: () => api.patch(`/subscriptions/${editingId}`, payload),
        undo: async () => { if (old) setSubs(prev => prev.map(s => s.subscription_id === editingId ? old : s)); await load(); },
        onError: () => { if (old) setSubs(prev => prev.map(s => s.subscription_id === editingId ? old : s)); },
        successMsg: "Subscription updated",
        errorMsg: "Could not update",
      });
    } else {
      const optimisticSub = { subscription_id: `optimistic-${Date.now()}`, ...payload, active: true };
      setSubs(prev => [...prev, optimisticSub]);
      try {
        const { data } = await api.post("/subscriptions", payload);
        setSubs(prev => prev.map(s => s.subscription_id === optimisticSub.subscription_id ? data : s));
        toast.success("Subscription added");
      } catch (e) {
        setSubs(prev => prev.filter(s => s.subscription_id !== optimisticSub.subscription_id));
        toast.error(formatApiError(e) || "Could not save");
      }
    }
  };

  const toggleActive = async (s) => {
    setSubs(prev => prev.map(sub => sub.subscription_id === s.subscription_id ? { ...sub, active: !sub.active } : sub));
    try {
      await api.patch(`/subscriptions/${s.subscription_id}`, { active: !s.active });
      toast.success(s.active ? "Paused" : "Activated");
    } catch (e) {
      setSubs(prev => prev.map(sub => sub.subscription_id === s.subscription_id ? { ...sub, active: !!s.active } : sub));
      toast.error(formatApiError(e) || "Could not update");
    }
  };

  const del = async (id) => {
    const sub = subsRef.current.find(s => s.subscription_id === id);
    if (!sub) return;
    setSubs(prev => prev.filter(s => s.subscription_id !== id));
    withUndo({
      action: () => api.delete(`/subscriptions/${id}`),
      undo: async () => {
        setSubs(prev => [...prev, sub]);
        await api.post("/subscriptions", { name: sub.name, amount: Math.abs(sub.amount), category: sub.category, frequency: sub.frequency, merchant: sub.merchant, notes: sub.notes });
      },
      onError: () => setSubs(prev => [...prev, sub]),
      successMsg: "Subscription deleted",
      errorMsg: "Could not delete",
    });
  };

  const monthlyTotal = useMemo(() => {
    return subs.filter((s) => s.active).reduce((sum, s) => sum + Math.abs(s.amount), 0);
  }, [subs]);
  const annualTotal = useMemo(() => {
    return subs.filter((s) => s.active).reduce((sum, s) => {
      switch (s.frequency) {
        case "weekly": return sum + Math.abs(s.amount) * 52;
        case "biweekly": return sum + Math.abs(s.amount) * 26;
        case "monthly": return sum + Math.abs(s.amount) * 12;
        case "quarterly": return sum + Math.abs(s.amount) * 4;
        case "annually": return sum + Math.abs(s.amount);
        default: return sum + Math.abs(s.amount) * 12;
      }
    }, 0);
  }, [subs]);

  const categoryBreakdown = useMemo(() => {
    const map = {};
    subs.filter((s) => s.active).forEach((s) => {
      const cat = s.category || "uncategorized";
      map[cat] = (map[cat] || 0) + Math.abs(s.amount);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [subs]);

  return (
    <div className="space-y-6">

      {/* Summary header */}
      <PageHeader eyebrow="Subscriptions" title="Subscriptions."
        description={`${subs.filter((s) => s.active).length} active · £${monthlyTotal.toFixed(2)} / month · £${annualTotal.toLocaleString()} / year`}
        actions={
          <div className="flex gap-2">
            <Button variant="outlinePill" size="pillSm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="primary" size="pillSm">
                  <Plus className="h-3.5 w-3.5" /> Add <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openAdd}>
                  <Plus className="h-4 w-4 mr-2" /> Add manually
                </DropdownMenuItem>
                <DropdownMenuItem onClick={detectRecurring} disabled={detecting}>
                  {detecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Detect with AI
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Mini stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-secondary/20 p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</p>
          <p className="text-lg font-semibold mt-0.5">{subs.filter((s) => s.active).length}</p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/20 p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Monthly</p>
          <p className="text-lg font-semibold mt-0.5 tabular-nums">£{monthlyTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/20 p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Annual</p>
          <p className="text-lg font-semibold mt-0.5 tabular-nums">£{annualTotal.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/20 p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Paused</p>
          <p className="text-lg font-semibold mt-0.5">{subs.filter((s) => !s.active).length}</p>
        </div>
      </div>

      {/* Category breakdown */}
      {categoryBreakdown.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-5">
          <p className="text-xs font-medium text-muted-foreground mb-2">Spending by category (active)</p>
          <div className="space-y-1.5">
            {categoryBreakdown.map(([cat, amt]) => {
              const pct = (amt / monthlyTotal) * 100;
              return (
                <div key={cat} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate capitalize text-muted-foreground">{cat}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald to-topaz" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="tabular-nums text-muted-foreground w-16 text-right">£{amt.toFixed(2)}</span>
                  <span className="tabular-nums text-muted-foreground w-8 text-right">{Math.round(pct)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <SectionCard eyebrow="Managed" title={`${subs.length} subscription${subs.length !== 1 ? "s" : ""}`}>
        {detected.length > 0 && (
          <div className="border-b border-border/50">
            <div className="px-6 py-2 text-xs font-medium text-emerald">AI detected — review and save</div>
            <div className="divide-y divide-border/40 text-sm">
              {detected.map((item, i) => (
                <div key={i} className="px-6 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.normalized_merchant || item.description}</p>
                    <p className="text-xs text-muted-foreground">£{item.amount.toFixed(2)} / {item.frequency} &middot; {item.occurrences} occurrences</p>
                  </div>
                  <Button variant="outlinePill" size="pillSm" onClick={() => addFromDetected(item)}>Save</Button>
                </div>
              ))}
            </div>
          </div>
        )}
        {loading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
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
                    <button onClick={() => openEdit(s)} className="p-2 text-muted-foreground hover:text-emerald" aria-label={`Edit ${s.name}`}><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(s.subscription_id)} className="p-2 text-muted-foreground hover:text-ruby" aria-label={`Delete ${s.name}`}><Trash2 className="h-4 w-4" /></button>
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
                  <button onClick={() => toggleActive(s)} className={`text-xs px-3 py-2 rounded-full ${s.active ? "bg-emerald/10 text-emerald" : "bg-muted text-muted-foreground"}`}>
                        {s.active ? "Active" : "Paused"}
                      </button>
                    </td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(s)} className="p-2 text-muted-foreground hover:text-emerald" aria-label={`Edit ${s.name}`}><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => del(s.subscription_id)} className="p-2 text-muted-foreground hover:text-ruby" aria-label={`Delete ${s.name}`}><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </SectionCard>

      <SectionCard eyebrow="Automation" title="Recurring transactions">
        <RecurringTransactionManager />
      </SectionCard>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl tracking-tight font-medium mb-4">{editingId ? "Edit subscription" : "New subscription"}</h3>
            <form onSubmit={submit} className="space-y-3">
              <Input required placeholder="Name (e.g. Netflix)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full" />
              <Input required type="number" step="0.01" placeholder="Amount (£)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full" />
              <Input placeholder="Merchant (optional)" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} className="w-full" />
              <div className="grid grid-cols-2 gap-2">
                <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none transition-colors w-full">
                  <option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="weekly">Weekly</option>
                </select>
                <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full" />
              </div>
              <textarea placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-xl bg-secondary/50 border border-transparent px-4 py-3 text-sm focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none transition-colors resize-none" rows={2} />
              <div className="flex gap-2 pt-2">
                <Button variant="outlinePill" size="pill" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
                <Button variant="primary" size="pill" className="flex-1">{editingId ? "Save" : "Add"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import PenniSelect from "../components/PenniSelect";
import NativePopup from "../components/ui/NativePopup";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { withUndo } from "../lib/undo";
import ConfirmModal from "../components/ui/ConfirmModal";
import { Loader2, Plus, Trash2, Pencil, RefreshCcw, Sparkles, Bell, ChevronDown, RefreshCw } from "lucide-react";
import { EmptyState, PageToolbar, SectionCard } from "../components/ui/layout";
import { PageHeader, Surface, StatCard } from "../components/ui/page";
import CategoryCombobox from "../components/CategoryCombobox";
import { useCategories } from "../contexts/CategoriesContext";
import { formatCurrency } from "../lib/format";
import { annualSubscriptionAmount, monthlySubscriptionAmount } from "../lib/subscriptionAmounts";
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
  useEffect(() => { document.title = "Subscriptions | Penni"; }, []);
  const { resolveCategory } = useCategories();
  const [subs, setSubs] = useState([]);
  const subsRef = useRef(subs);
  subsRef.current = subs;
  const [detected, setDetected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [detecting, setDetecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await api.get("/subscriptions");
      setSubs(data.subscriptions);
    } catch (err) { console.error("subs load", err); setLoadError(true); }
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

  const del = (id) => setPendingDeleteId(id);
  const confirmSubscriptionDelete = async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;
    try {
      await api.delete(`/subscriptions/${id}`);
      setSubs(prev => prev.filter(sub => sub.subscription_id !== id));
      toast.success("Subscription permanently deleted");
      await load();
    } catch (error) {
      toast.error(formatApiError(error) || "Could not delete subscription");
      await load();
    }
  };

  const annualTotal = useMemo(
    () => subs.filter((subscription) => subscription.active)
      .reduce((sum, subscription) => sum + annualSubscriptionAmount(subscription), 0),
    [subs],
  );
  const monthlyTotal = annualTotal / 12;

  const categoryBreakdown = useMemo(() => {
    const map = {};
    subs.filter((s) => s.active).forEach((s) => {
      const cat = s.category || "uncategorized";
      map[cat] = (map[cat] || 0) + monthlySubscriptionAmount(s);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [subs]);

  return (
    <div className="page-stack pb-4">

      <PageHeader
        eyebrow="Recurring"
        title="Subscriptions"
        description="See what renews, what it costs and where you can usefully trim back."
      />

      {/* Summary toolbar */}
      <PageToolbar className="justify-between">
        <p className="mr-auto text-sm text-muted-foreground">
          {loading ? "Loading subscriptions…" : loadError ? "Could not refresh subscriptions" : `${subs.filter((s) => s.active).length} active · ${formatCurrency(monthlyTotal)} / month · ${formatCurrency(annualTotal)} / year`}
        </p>
        <Button type="button" aria-label="Refresh subscriptions" variant="outlinePill" size="pillSm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
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
      </PageToolbar>

      {/* Summary cards follow the same visual vocabulary as the main dashboard. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active" value={loading || loadError ? "—" : subs.filter((subscription) => subscription.active).length} />
        <StatCard label="Monthly" value={loading || loadError ? "—" : formatCurrency(monthlyTotal)} />
        <StatCard label="Annual" value={loading || loadError ? "—" : formatCurrency(annualTotal)} />
        <StatCard label="Paused" value={loading || loadError ? "—" : subs.filter((subscription) => !subscription.active).length} tone="topaz" />
      </div>

      {/* Category breakdown */}
      {!loading && !loadError && categoryBreakdown.length > 0 && (
        <Surface className="p-5">
          <p className="text-xs font-medium text-muted-foreground mb-2">Spending by category (active)</p>
          <div className="space-y-1.5">
            {categoryBreakdown.map(([cat, amt]) => {
              const pct = (amt / monthlyTotal) * 100;
              return (
                <div key={cat} className="flex items-center gap-2 text-xs">
                  <span className="min-w-[110px] max-w-[38%] break-words text-muted-foreground" title={resolveCategory(cat)?.label || cat}>{resolveCategory(cat)?.label || cat}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald to-topaz" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="money-tabular shrink-0 text-right text-muted-foreground" title={formatCurrency(amt)}>{formatCurrency(amt, { compact: true })}</span>
                  <span className="tabular-nums text-muted-foreground w-8 text-right">{Math.round(pct)}%</span>
                </div>
              );
            })}
          </div>
        </Surface>
      )}

      <SectionCard eyebrow="Managed" title={`${subs.length} subscription${subs.length !== 1 ? "s" : ""}`} contentClassName="p-0">
        {detected.length > 0 && (
          <div className="border-b border-border/50">
            <div className="px-4 py-3 text-xs font-medium text-emerald sm:px-5">AI detected — review and save</div>
            <div className="divide-y divide-border/40 text-sm">
              {detected.map((item, i) => (
                <div key={item.merchant + item.amount + i} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div>
                    <p className="font-medium">{item.normalized_merchant || item.description}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.amount)} / {item.frequency} &middot; {item.occurrences} occurrences</p>
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
        ) : loadError && subs.length === 0 ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
            <span className="text-muted-foreground">Could not load subscriptions. Your saved records have not been changed.</span>
            <Button type="button" variant="outlinePill" size="sm" onClick={load}>Retry</Button>
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
                    <button onClick={() => openEdit(s)} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Edit ${s.name}`}><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(s.subscription_id)} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-ruby/5 hover:text-ruby focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Delete ${s.name}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="money-tabular font-semibold">{formatCurrency(Math.abs(s.amount))}</span>
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
            <table className="penni-data-table">
              <thead><tr>
                <th scope="col">Name</th><th scope="col">Amount</th><th scope="col">Frequency</th><th scope="col">Status</th><th scope="col" className="w-24"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.subscription_id}>
                    <td className="min-w-[190px] font-medium">{s.name}{s.merchant && <span className="text-xs text-muted-foreground ml-2">{s.merchant}</span>}</td>
                    <td className="money-tabular whitespace-nowrap font-semibold">{formatCurrency(Math.abs(s.amount))}</td>
                    <td className="capitalize text-muted-foreground">{s.frequency}</td>
                    <td>
                  <button onClick={() => toggleActive(s)} className={`text-xs px-3 py-2 rounded-full ${s.active ? "bg-emerald/10 text-emerald" : "bg-muted text-muted-foreground"}`}>
                        {s.active ? "Active" : "Paused"}
                      </button>
                    </td>
                    <td className="whitespace-nowrap">
                      <button onClick={() => openEdit(s)} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Edit ${s.name}`}><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => del(s.subscription_id)} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-ruby/5 hover:text-ruby focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Delete ${s.name}`}><Trash2 className="h-4 w-4" /></button>
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
        <NativePopup open={open} showHeader title={editingId ? "Edit subscription" : "New subscription"}
          description="Manage a recurring payment without leaving your workspace."
          onClose={() => setOpen(false)} size="md" bodyClassName="penni-native-form">
          <form onSubmit={submit} className="space-y-4" aria-label="Subscription details">
            <div className="space-y-1.5">
              <label htmlFor="penni-sub-name" className="block text-xs font-medium text-muted-foreground">Name</label>
              <Input id="penni-sub-name" required placeholder="Subscription name" value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="penni-sub-amount" className="block text-xs font-medium text-muted-foreground">Amount (£)</label>
                <Input id="penni-sub-amount" required type="number" min="0.01" inputMode="decimal" step="0.01"
                  placeholder="0.00" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  className="tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="penni-sub-frequency" className="block text-xs font-medium text-muted-foreground">Frequency</label>
                <PenniSelect id="penni-sub-frequency" aria-label="Billing frequency" value={form.frequency}
                  onChange={(event) => setForm({ ...form, frequency: event.target.value })}
                  className="h-11 w-full rounded-xl border border-border bg-secondary/50 px-3 text-sm">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="weekly">Weekly</option>
                </PenniSelect>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="penni-sub-merchant" className="block text-xs font-medium text-muted-foreground">Merchant (optional)</label>
              <Input id="penni-sub-merchant" placeholder="Merchant" value={form.merchant}
                onChange={(event) => setForm({ ...form, merchant: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">Category</span>
              <CategoryCombobox value={form.category} onChange={(value) => setForm({ ...form, category: value })}
                label="Subscription category" placeholder="Choose a category" allowClear />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="penni-sub-notes" className="block text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <textarea id="penni-sub-notes" placeholder="Add a note" value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                className="w-full resize-none rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                rows={2} />
            </div>
            <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
              <Button type="button" variant="outlinePill" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">{editingId ? "Save subscription" : "Add subscription"}</Button>
            </div>
          </form>
        </NativePopup>
      )}
      <ConfirmModal
        open={Boolean(pendingDeleteId)}
        title="Permanently delete subscription?"
        message="This subscription cannot be restored with Undo after deletion."
        confirmLabel="Delete permanently"
        onConfirm={confirmSubscriptionDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

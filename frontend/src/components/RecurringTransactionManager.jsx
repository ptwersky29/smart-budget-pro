import React, { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Loader2, Calendar, DollarSign, Tag, AlertCircle } from "lucide-react";
import ConfirmModal from "./ui/ConfirmModal";

/**
 * Recurring Transaction Manager
 * Allows users to set up, edit, and manage automatic recurring transactions
 * (rent, salary, subscriptions, etc.)
 */
export default function RecurringTransactionManager() {
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    category: "",
    frequency: "monthly", // monthly, weekly, biweekly, quarterly, annually
    next_date: "",
    is_income: false,
    enabled: true,
  });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const FREQUENCIES = [
    { value: "weekly", label: "Weekly" },
    { value: "biweekly", label: "Bi-weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "annually", label: "Annually" },
  ];

  const CATEGORIES = [
    "rent", "salary", "utilities", "insurance", "subscriptions",
    "groceries", "transport", "health", "entertainment"
  ];

  const loadRecurring = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/transactions/recurring");
      setRecurring(Array.isArray(data) ? data : data.items || []);
    } catch (error) {
      toast.error("Could not load recurring transactions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecurring();
  }, [loadRecurring]);

  const resetForm = () => {
    setForm({
      description: "",
      amount: "",
      category: "",
      frequency: "monthly",
      next_date: "",
      is_income: false,
      enabled: true,
    });
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.description.trim() || !form.amount || !form.category) {
      toast.error("Please fill in all fields");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        category: form.category,
        frequency: form.frequency,
        next_date: form.next_date || new Date().toISOString().split("T")[0],
        is_income: form.is_income,
        enabled: form.enabled,
      };

      if (editingId) {
        await api.put(`/transactions/recurring/${editingId}`, payload);
        toast.success("Recurring transaction updated");
      } else {
        await api.post("/transactions/recurring", payload);
        toast.success("Recurring transaction created");
      }

      resetForm();
      setShowForm(false);
      await loadRecurring();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (item) => {
    setForm({
      description: item.description,
      amount: item.amount.toString(),
      category: item.category,
      frequency: item.frequency,
      next_date: item.next_date || "",
      is_income: item.is_income || false,
      enabled: item.enabled !== false,
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/transactions/recurring/${id}`);
      toast.success("Deleted");
      setConfirmDelete(null);
      await loadRecurring();
    } catch {
      toast.error("Could not delete");
    }
  };

  if (loading) {
    return <div className="h-32 bg-secondary/40 rounded-xl animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Recurring Transactions</h3>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="btn-pill gradient-emerald text-white h-10 px-4 text-sm flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add recurring
        </button>
      </div>

      {/* Recurring Items List */}
      {recurring.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
          <Calendar className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No recurring transactions yet</p>
          <p className="text-xs text-muted-foreground mt-1">Set up recurring payments to automate your finances</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recurring.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border border-border p-4 flex items-start gap-4 ${
                !item.enabled ? "opacity-50" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium truncate">{item.description}</p>
                  {!item.enabled && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Disabled</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    £{Math.abs(item.amount).toFixed(2)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    {item.category}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {item.frequency}
                  </span>
                </div>
                {item.next_date && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Next: {new Date(item.next_date).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(item)}
                  className="p-2 hover:bg-secondary rounded transition"
                  aria-label="Edit recurring transaction"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(item.id)}
                  className="p-2 hover:bg-ruby/10 text-ruby/80 rounded transition"
                  aria-label="Delete recurring transaction"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete recurring transaction"
          message="This will permanently remove this recurring transaction."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => !busy && setShowForm(false)}>
          <div className="page-shell p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-4">
              {editingId ? "Edit recurring transaction" : "New recurring transaction"}
            </h2>

            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
              <div>
                <label className="label-overline">Description *</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g., Monthly rent"
                  className="mt-1 w-full control-shell"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-overline">Amount (£) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    className="mt-1 w-full control-shell"
                    required
                  />
                </div>
                <div>
                  <label className="label-overline">Frequency *</label>
                  <select
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                    className="mt-1 w-full control-shell"
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label-overline">Category *</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="mt-1 w-full control-shell"
                  required
                >
                  <option value="">Select category…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label-overline">Next Date</label>
                <input
                  type="date"
                  value={form.next_date}
                  onChange={(e) => setForm({ ...form, next_date: e.target.value })}
                  className="mt-1 w-full control-shell"
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_income}
                  onChange={(e) => setForm({ ...form, is_income: e.target.checked })}
                />
                This is income
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                />
                Enabled
              </label>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={busy}
                  className="flex-1 btn-pill border border-border disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 btn-pill gradient-emerald text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

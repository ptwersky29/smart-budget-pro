import React, { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { CheckCircle2, RefreshCw, Star, Pencil, Trash2, X, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "./ui/layout";
import Skeleton from "./ui/Skeleton";
import ConfirmModal from "./ui/ConfirmModal";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

const EMPTY_SUM = {
  percent: 10, total_income: 0, obligation: 0, given_total: 0,
  tx_given: 0, ledger_given: 0, accrued_pending: 0,
  balance_owed: 0, credit: 0, enabled: false,
};

const fmt = (n) => `£${Number(n || 0).toFixed(2)}`;

export default function MaaserPanel({ refreshKey = 0, onChange }) {
  const [cfg, setCfg] = useState({ enabled: false, percent: 10 });
  const [sum, setSum] = useState(EMPTY_SUM);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showGiveForm, setShowGiveForm] = useState(false);
  const [giveAmount, setGiveAmount] = useState("");
  const [giveRecipient, setGiveRecipient] = useState("");
  const [loading, setLoading] = useState(true);

  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [editPaidTo, setEditPaidTo] = useState("");
  const [editNote, setEditNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLedgerLoading(true);
    try {
      const [s, sum, lg] = await Promise.all([
        api.get("/jewish/maaser/settings"),
        api.get("/jewish/maaser/summary"),
        api.get("/jewish/maaser/ledger?include_tx=true&limit=500"),
      ]);
      setCfg(s.data || { enabled: false, percent: 10 });
      setSum({ ...EMPTY_SUM, ...(sum.data || {}), enabled: s.data?.enabled });
      setLedger(lg.data?.entries || []);
    } catch {}
    finally { setLoading(false); setLedgerLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const saveCfg = async (next) => {
    setBusy(true);
    try {
      await api.put("/jewish/maaser/settings", next);
      setCfg(next);
      toast.success(`Auto-Maaser ${next.enabled ? "enabled" : "disabled"}`);
      await load();
      onChange?.();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not save");
    }
    finally { setBusy(false); }
  };

  const recalc = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/jewish/maaser/backfill");
      if (data.enabled === false) {
        toast.error("Turn auto-Maaser on first");
      } else {
        toast.success(`Accrued maaser for ${data.created} income tx · ${fmt(data.total_amount)}`);
      }
      await load();
      onChange?.();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Recalculate failed");
    }
    finally { setBusy(false); }
  };

  const reset = async () => {
    setConfirmReset(true);
  };

  const doReset = async () => {
    setConfirmReset(false);
    setBusy(true);
    try {
      await api.post("/jewish/maaser/reset");
      toast.success("Maaser audit log reset");
      await load();
      onChange?.();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Reset failed");
    }
    finally { setBusy(false); }
  };

  const giveFromBalance = async () => {
    if (sum.balance_owed <= 0) {
      toast.success("Nothing owed — you're up to date!");
      return;
    }
    setGiveAmount(sum.balance_owed.toFixed(2));
    setGiveRecipient("");
    setShowGiveForm(true);
  };

  const submitGive = async () => {
    const num = parseFloat(giveAmount);
    if (isNaN(num) || num <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const recipient = giveRecipient.trim() || "Tzedakah";
    try {
      await api.post("/jewish/tzedakah", { amount: num, recipient, note: "Maaser given against balance" });
      toast.success("Maaser given");
      setShowGiveForm(false);
      await load();
      onChange?.();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not record");
    }
  };

  const handleEdit = (entry) => {
    setEditEntry(entry);
    setEditAmount(String(entry.maaser_paid || entry.maaser_due || 0));
    setEditPaidTo(entry.paid_to || "");
    setEditNote(entry.note || "");
  };

  const handleSaveEdit = async () => {
    if (!editEntry) return;
    const num = parseFloat(editAmount);
    if (isNaN(num) || num < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      await api.put(`/jewish/maaser/ledger/${editEntry.entry_id}`, {
        amount: num, recipient: editPaidTo || "Tzedakah", note: editNote || null,
      });
      toast.success("Entry updated");
      setEditEntry(null);
      await load();
      onChange?.();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not update");
    }
  };

  const handlePay = async (entryId) => {
    try {
      await api.post(`/jewish/maaser/pay/${entryId}`);
      toast.success("Marked as paid");
      await load();
      onChange?.();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not mark paid");
    }
  };

  const handleDelete = async (entryId) => {
    try {
      await api.delete(`/jewish/maaser/ledger/${entryId}`);
      toast.success("Entry deleted");
      await load();
      onChange?.();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not delete");
    }
  };

  const handleExclude = async (transactionId) => {
    if (!transactionId) { toast.error("No linked transaction"); return; }
    setBusy(true);
    try {
      await api.patch(`/transactions/${transactionId}`, { exclude_from_maaser: true });
      toast.success("Income excluded from Maaser");
      await load();
      onChange?.();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not exclude");
    }
    finally { setBusy(false); }
  };

  const overGiven = sum.credit > 0;
  const balanceValue = overGiven ? sum.credit : sum.balance_owed;
  const balanceAccent = sum.balance_owed > 0 ? "ruby" : "emerald";
  const balanceLabel = overGiven ? "Credit (over-given)" : "Balance owed";

  return (
    <SectionCard
      eyebrow="Maaser · Tzedakah"
      title={`10% of income minus tzedakah given${sum.enabled ? "" : " — off"}`}
      description="Auto-Maaser accrues 10% of every income transaction, then subtracts everything you've given in the tzedakah category to show your true balance."
      actions={
        <div className="flex items-center gap-2">
          <Input
            data-testid="maaser-pct"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={cfg.percent}
            onChange={(e) => setCfg({ ...cfg, percent: parseFloat(e.target.value) || 0 })}
            onBlur={() => saveCfg(cfg)}
            className="w-20 text-center font-mono"
            title="Maaser percent"
          />
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              data-testid="maaser-toggle"
              type="checkbox"
              checked={cfg.enabled}
              disabled={busy}
              onChange={(e) => saveCfg({ ...cfg, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <span className="w-11 h-6 bg-secondary rounded-full peer-checked:bg-emerald relative transition-colors">
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform"
                style={{ transform: cfg.enabled ? "translateX(20px)" : "translateX(0)" }}
              />
            </span>
            <span className="text-sm">{cfg.enabled ? "On" : "Off"}</span>
          </label>
        </div>
      }
    >
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Income to date" value={fmt(sum.total_income)} accent="emerald" />
            <Stat label={`Maaser obligation (${sum.percent}%)`} value={fmt(sum.obligation)} accent="topaz" />
            <Stat label="Given so far" value={fmt(sum.given_total)} accent="emerald" />
            <Stat label={balanceLabel} value={fmt(balanceValue)} accent={balanceAccent} />
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            <Star className="inline h-3 w-3 text-topaz mr-1" />
            Given includes{" "}
            <span className="font-medium text-foreground">{fmt(sum.tx_given)}</span> from tzedakah-category transactions
            {" + "}
            <span className="font-medium text-foreground">{fmt(sum.ledger_given)}</span> from the manual ledger.
            {" "}Obligation is <span className="font-medium text-foreground">{sum.percent}%</span> of every income transaction;
            any tzedakah spend pays it down.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {sum.balance_owed > 0 && (
              <button
                onClick={giveFromBalance}
                data-testid="maaser-give"
                disabled={busy}
                className="inline-flex items-center gap-1 text-sm px-4 py-2.5 rounded-full bg-emerald text-white hover:opacity-90 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Give {fmt(sum.balance_owed)}
              </button>
            )}
            <button
              onClick={recalc}
              disabled={busy}
              data-testid="maaser-recalc"
              className="inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-full border border-border hover:border-emerald hover:text-emerald disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Recalculate
            </button>
            <button
              onClick={reset}
              disabled={busy}
              data-testid="maaser-reset"
              className="text-sm px-4 py-2.5 rounded-full border border-border hover:border-ruby hover:text-ruby disabled:opacity-50"
            >
              Reset audit
            </button>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Star className="h-4 w-4 text-topaz" />
              All Maaser Transactions
              {ledger.length > 0 && <span className="text-xs text-muted-foreground font-normal">({ledger.length})</span>}
            </h4>

            {ledgerLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
              </div>
            ) : ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No Maaser entries yet. Income transactions with auto-maaser or manual ledger entries will appear here.
              </p>
            ) : (
              <div className="space-y-1.5">
                {ledger.map((e) => (
                  <div
                    key={e.entry_id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 text-sm hover:bg-secondary/20 transition-colors"
                  >
                    <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto] gap-x-4 gap-y-1 items-center">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {e.date || e.income_date ? new Date(e.date || e.income_date).toLocaleDateString("en-GB") : "-"}
                      </span>
                      <div className="min-w-0">
                        {e.income_description ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="truncate max-w-[200px]">{e.income_description}</span>
                            {e.income_category && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary capitalize">{e.income_category}</span>}
                            <span className="text-xs font-medium">{fmt(e.income_amount)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Manual entry</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <span className="text-xs">
                          <span className="text-muted-foreground">Due: </span><span className="font-medium">{fmt(e.maaser_due)}</span>
                        </span>
                        <span className="text-xs">
                          <span className="text-muted-foreground">Paid: </span>
                          {e.status === "pending" ? (
                            <span className="text-amber-500 font-medium">Pending</span>
                          ) : (
                            <span className="font-medium">{fmt(e.maaser_paid)}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${e.status === "given" ? "bg-emerald/10 text-emerald" : "bg-amber/10 text-amber-500"}`}>
                          {e.status === "given" ? "Given" : "Pending"}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(e)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            {e.status === "pending" && (
                              <DropdownMenuItem onClick={() => handlePay(e.entry_id)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Mark Paid
                              </DropdownMenuItem>
                            )}
                            {e.status === "pending" && e.transaction_id && (
                              <DropdownMenuItem onClick={() => handleExclude(e.transaction_id)}>
                                <X className="h-3.5 w-3.5 mr-2" /> Exclude from Maaser
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(e.entry_id)} className="text-ruby">
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmModal open={confirmReset} title="Reset Maaser audit"
        message="Clear the auto-Maaser audit log? Manual ledger entries are kept."
        onConfirm={doReset} onCancel={() => setConfirmReset(false)} />

      {showGiveForm && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setShowGiveForm(false)}>
          <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl tracking-tight font-medium">Give Maaser</h3>
              <button onClick={() => setShowGiveForm(false)} className="p-3 rounded-lg hover:bg-secondary text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label-overline">Amount (£)</label>
                <Input type="number" step="0.01" value={giveAmount} onChange={(e) => setGiveAmount(e.target.value)}
                  className="mt-1 w-full" />
              </div>
              <div>
                <label className="label-overline">Recipient</label>
                <Input value={giveRecipient} onChange={(e) => setGiveRecipient(e.target.value)}
                  placeholder="e.g. local shul, JNF, charity"
                  className="mt-1 w-full" />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outlinePill" size="pill" onClick={() => setShowGiveForm(false)}>Cancel</Button>
                <Button variant="primary" size="pill" onClick={submitGive}>Give</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editEntry && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setEditEntry(null)}>
          <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl tracking-tight font-medium">Edit Maaser Entry</h3>
              <button onClick={() => setEditEntry(null)} className="p-3 rounded-lg hover:bg-secondary text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label-overline">Amount (£)</label>
                <Input type="number" step="0.01" value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)} className="mt-1 w-full" />
              </div>
              <div>
                <label className="label-overline">Recipient / Paid To</label>
                <Input value={editPaidTo}
                  onChange={(e) => setEditPaidTo(e.target.value)} className="mt-1 w-full" />
              </div>
              <div>
                <label className="label-overline">Note</label>
                <Input value={editNote}
                  onChange={(e) => setEditNote(e.target.value)} className="mt-1 w-full" />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outlinePill" size="pill" onClick={() => setEditEntry(null)}>Cancel</Button>
                <Button variant="primary" size="pill" onClick={handleSaveEdit}>Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function Stat({ label, value, accent = "emerald" }) {
  const tone =
    accent === "ruby" ? "text-ruby" :
    accent === "topaz" ? "text-topaz" :
    "text-emerald";
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl tracking-tight font-medium ${tone}`}>{value}</p>
    </div>
  );
}

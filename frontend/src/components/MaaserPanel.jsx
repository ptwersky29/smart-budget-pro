import React, { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { CheckCircle2, RefreshCw, Star } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "./ui/layout";
import Skeleton from "./ui/Skeleton";

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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sum] = await Promise.all([
        api.get("/jewish/maaser/settings"),
        api.get("/jewish/maaser/summary"),
      ]);
      setCfg(s.data || { enabled: false, percent: 10 });
      setSum({ ...EMPTY_SUM, ...(sum.data || {}), enabled: s.data?.enabled });
    } catch {}
    finally { setLoading(false); }
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
    if (!window.confirm("Clear the auto-Maaser audit log? Manual ledger entries are kept.")) return;
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
    const amt = window.prompt(
      `How much are you giving? (You owe ${fmt(sum.balance_owed)})`,
      sum.balance_owed.toFixed(2)
    );
    if (!amt) return;
    const num = parseFloat(amt);
    if (isNaN(num) || num <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const recipient = window.prompt("Recipient? (e.g. local shul, JNF, charity)") || "Tzedakah";
    try {
      await api.post("/jewish/tzedakah", { amount: num, recipient, note: "Maaser given against balance" });
      toast.success("Maaser given");
      await load();
      onChange?.();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not record");
    }
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
          <input
            data-testid="maaser-pct"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={cfg.percent}
            onChange={(e) => setCfg({ ...cfg, percent: parseFloat(e.target.value) || 0 })}
            onBlur={() => saveCfg(cfg)}
            className="h-10 w-20 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-ring focus:outline-none text-center font-mono"
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
        </>
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

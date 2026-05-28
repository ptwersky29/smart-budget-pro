import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Star, Plus, Calendar, Sunrise, MapPin, Sparkles, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/layout";

const CITIES = ["london","manchester","gateshead","leeds","jerusalem","tel-aviv","new-york","monsey","lakewood","stamford-hill"];

export default function Jewish() {
  const [maaser, setMaaser] = useState({ income: 5000, percent: 10, result: null });
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState({ amount: "", recipient: "", note: "" });
  const [holidays, setHolidays] = useState([]);

  // Hebcal widget state
  const [hebDate, setHebDate] = useState(null);
  const [zmanim, setZmanim] = useState(null);
  const [city, setCity] = useState(() => localStorage.getItem("zmanim_city") || "london");
  const [upcomingHols, setUpcomingHols] = useState([]);

  // Auto-Maaser state
  const [maaserCfg, setMaaserCfg] = useState({ enabled: false, percent: 10 });
  const [maaserSum, setMaaserSum] = useState({
    percent: 10, total_income: 0, obligation: 0,
    given_total: 0, tx_given: 0, ledger_given: 0,
    accrued_pending: 0, balance_owed: 0, credit: 0,
  });
  const [maaserBusy, setMaaserBusy] = useState(false);

  const loadAll = useCallback(async () => {
    const [tz, hd] = await Promise.all([api.get("/jewish/tzedakah"), api.get("/jewish/holiday-budget")]);
    setEntries(tz.data.entries); setTotal(tz.data.total_given);
    setHolidays(hd.data.holidays);
  }, []);

  const loadHebcal = useCallback(async () => {
    try {
      const [today, zm, up] = await Promise.all([
        api.get("/jewish/hebcal/today"),
        api.get(`/jewish/hebcal/zmanim?city=${city}`),
        api.get("/jewish/hebcal/upcoming-holidays"),
      ]);
      setHebDate(today.data);
      setZmanim(zm.data);
      setUpcomingHols(up.data.upcoming || []);
    } catch (err) { console.error("hebcal load", err); }
  }, [city]);

  const loadMaaser = useCallback(async () => {
    try {
      const [s, sum] = await Promise.all([
        api.get("/jewish/maaser/settings"),
        api.get("/jewish/maaser/summary"),
      ]);
      setMaaserCfg(s.data);
      setMaaserSum(sum.data);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadHebcal(); }, [loadHebcal]);
  useEffect(() => { loadMaaser(); }, [loadMaaser]);

  const saveMaaserCfg = async (next) => {
    setMaaserBusy(true);
    try {
      const { data } = await api.put("/jewish/maaser/settings", next);
      setMaaserCfg(next);
      toast.success(`Auto-Maaser ${next.enabled ? "enabled" : "disabled"}`);
      if (data?.backfill?.created > 0) {
        toast.success(`Backfilled ${data.backfill.created} income tx · £${data.backfill.total_amount.toFixed(2)} accrued`);
      }
      await loadAll(); await loadMaaser();
    } catch { toast.error("Could not save"); }
    finally { setMaaserBusy(false); }
  };

  const recalcMaaser = async () => {
    setMaaserBusy(true);
    try {
      const { data } = await api.post("/jewish/maaser/backfill");
      if (data?.created > 0) {
        toast.success(`Accrued maaser for ${data.created} income tx · £${data.total_amount.toFixed(2)}`);
      } else if (data?.enabled === false) {
        toast.error("Turn auto-Maaser on first");
      } else {
        toast.success("Already up to date");
      }
      await loadAll(); await loadMaaser();
    } catch { toast.error("Could not recalculate"); }
    finally { setMaaserBusy(false); }
  };

  const resetMaaser = async () => {
    if (!window.confirm("Clear the auto-Maaser audit log? Manual ledger entries are kept.")) return;
    setMaaserBusy(true);
    try {
      const { data } = await api.post("/jewish/maaser/reset");
      toast.success(`Cleared ${data.deleted} audit entries`);
      await loadAll(); await loadMaaser();
    } catch { toast.error("Could not reset"); }
    finally { setMaaserBusy(false); }
  };

  const giveFromBalance = async () => {
    if (maaserSum.balance_owed <= 0) { toast.success("Nothing owed — you're up to date!"); return; }
    const amt = window.prompt(`How much are you giving? (You owe £${maaserSum.balance_owed.toFixed(2)})`, maaserSum.balance_owed.toFixed(2));
    if (!amt) return;
    const num = parseFloat(amt);
    if (isNaN(num) || num <= 0) { toast.error("Enter a valid amount"); return; }
    const recipient = window.prompt("Recipient (e.g. Chesed Fund, Yeshiva)", "Tzedakah") || "Tzedakah";
    try {
      await api.post("/jewish/tzedakah", { amount: num, recipient, note: "Maaser given against balance" });
      toast.success(`Recorded £${num.toFixed(2)} given to ${recipient}`);
      await loadAll(); await loadMaaser();
    } catch { toast.error("Could not record"); }
  };

  const payPending = async (id) => {
    try {
      await api.post(`/jewish/maaser/pay/${id}`, null, { params: { recipient: "Tzedakah" } });
      toast.success("Marked as given");
      await loadAll(); await loadMaaser();
    } catch { toast.error("Could not update"); }
  };

  const runMaaser = async () => {
    const { data } = await api.post("/jewish/maaser", { income: Number(maaser.income), percent: Number(maaser.percent) });
    setMaaser({ ...maaser, result: data.maaser_amount });
  };

  const addTz = async (e) => {
    e.preventDefault();
    await api.post("/jewish/tzedakah", { amount: parseFloat(form.amount), recipient: form.recipient, note: form.note });
    toast.success("Tzedakah recorded"); setForm({ amount:"", recipient:"", note:"" }); await loadAll(); await loadMaaser();
  };

  const pending = entries.filter((e) => e.status === "pending");

  return (
    <div className="space-y-8" data-testid="jewish-root">
      <PageHeader
        eyebrow="Tools"
        title="Maaser, Tzedakah, Yom Tov."
        description="A dedicated space for Jewish finance planning, giving, and holiday budgeting."
      />

      {/* Hebrew calendar + Zmanim widget */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-3"><Calendar className="h-4 w-4 text-topaz" /><p className="label-overline">Today's Hebrew date</p></div>
          {hebDate ? (
            <>
              <p className="text-3xl tracking-tight font-medium text-topaz" dir="rtl" style={{fontFamily:"Fraunces"}}>{hebDate.hebrew_date}</p>
              <p className="text-xs text-muted-foreground mt-2">{hebDate.gregorian_date}</p>
              {hebDate.events?.length > 0 && (
                <div className="mt-4 space-y-1">
                  {hebDate.events.map((e) => (
                    <span key={e} className="inline-block text-xs px-2 py-1 mr-1 rounded-full bg-secondary">{e}</span>
                  ))}
                </div>
              )}
            </>
          ) : <p className="text-sm text-muted-foreground">Loading…</p>}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2"><Sunrise className="h-4 w-4 text-topaz" /><p className="label-overline">Zmanim today</p></div>
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3 text-muted-foreground"/>
              <select data-testid="zmanim-city" value={city} onChange={(e) => { setCity(e.target.value); localStorage.setItem("zmanim_city", e.target.value); }}
                      className="h-9 px-3 rounded-full bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none text-xs capitalize">
                {CITIES.map(c => <option key={c} value={c}>{c.replace("-"," ")}</option>)}
              </select>
            </div>
          </div>
          {zmanim ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              {zmanim.times.map((t) => (
                <div key={t.key} className="flex justify-between border-b border-border/60 py-1.5">
                  <span className="text-muted-foreground">{t.label}</span>
                  <span className="font-mono font-medium">{t.time}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">Loading…</p>}
        </div>
      </div>

      {/* Auto-Maaser */}
      <div className="rounded-2xl border-2 border-emerald/30 bg-card p-6" data-testid="auto-maaser-card">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-emerald grid place-items-center"><Sparkles className="h-5 w-5 text-white" /></div>
            <div>
              <p className="text-lg tracking-tight font-medium">Auto-Maaser</p>
              <p className="text-xs text-muted-foreground">Every salary credit automatically accrues {maaserCfg.percent}% to your Tzedakah ledger.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input data-testid="maaser-pct" type="number" min={0} max={100} step={0.5} value={maaserCfg.percent}
                   onChange={(e) => setMaaserCfg({ ...maaserCfg, percent: parseFloat(e.target.value) || 0 })}
                   onBlur={() => saveMaaserCfg(maaserCfg)}
                   className="h-10 w-20 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none text-center font-mono" />
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input data-testid="maaser-toggle" type="checkbox" checked={maaserCfg.enabled} disabled={maaserBusy}
                     onChange={(e) => saveMaaserCfg({ ...maaserCfg, enabled: e.target.checked })} className="sr-only peer" />
              <span className="w-11 h-6 bg-secondary rounded-full peer-checked:bg-emerald relative transition-colors">
                <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5" style={{ transform: maaserCfg.enabled ? 'translateX(20px)' : 'translateX(0)' }} />
              </span>
              <span className="text-sm">{maaserCfg.enabled ? "On" : "Off"}</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          <Stat testid="maaser-income" label="Income to date" value={`£${maaserSum.total_income.toFixed(2)}`} accent="emerald" />
          <Stat testid="maaser-obligation" label={`Maaser (${maaserSum.percent}%)`} value={`£${maaserSum.obligation.toFixed(2)}`} accent="topaz" />
          <Stat testid="maaser-given" label="Given so far" value={`£${maaserSum.given_total.toFixed(2)}`} accent="emerald" />
          <Stat testid="maaser-owed" label={maaserSum.credit > 0 ? "Credit (over-given)" : "Balance owed"}
                value={`£${(maaserSum.credit > 0 ? maaserSum.credit : maaserSum.balance_owed).toFixed(2)}`}
                accent={maaserSum.balance_owed > 0 ? "ruby" : "emerald"} />
        </div>
        {(maaserSum.ledger_given > 0 || maaserSum.tx_given > 0) && (
          <p className="text-xs text-muted-foreground mt-3">
            Given includes <span className="font-medium text-foreground">£{(maaserSum.tx_given||0).toFixed(2)}</span> from tzedakah-category transactions
            + <span className="font-medium text-foreground">£{(maaserSum.ledger_given||0).toFixed(2)}</span> from the ledger below.
          </p>
        )}
        <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
          <p className="text-xs text-muted-foreground">
            Obligation is <span className="font-medium text-foreground">{maaserSum.percent}%</span> of every income transaction.
            Spend in the <span className="font-medium text-foreground">tzedakah</span> category to pay it down.
          </p>
          <div className="flex items-center gap-2">
            {maaserSum.balance_owed > 0 && (
              <button onClick={giveFromBalance} data-testid="maaser-give" disabled={maaserBusy}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-emerald text-white hover:opacity-90 disabled:opacity-50">
                <CheckCircle2 className="h-3 w-3"/> Give £{maaserSum.balance_owed.toFixed(2)}
              </button>
            )}
            <button onClick={recalcMaaser} disabled={maaserBusy} data-testid="maaser-recalc"
                    className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-border hover:border-emerald hover:text-emerald disabled:opacity-50">
              <RefreshCw className={`h-3 w-3 ${maaserBusy ? "animate-spin" : ""}`} />
              Recalculate
            </button>
            <button onClick={resetMaaser} disabled={maaserBusy} data-testid="maaser-reset"
                    className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-ruby hover:text-ruby disabled:opacity-50">
              Reset audit
            </button>
          </div>
        </div>

        {pending.length > 0 && (
          <div className="mt-6">
            <p className="label-overline mb-2">Pending allocations ({pending.length})</p>
            <ul className="divide-y divide-border max-h-56 overflow-auto">
              {pending.slice(0, 12).map((e) => (
                <li key={e.entry_id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">£{e.amount.toFixed(2)} · {e.note}</p>
                    <p className="text-xs text-muted-foreground">{e.date?.slice(0, 10)}</p>
                  </div>
                  <button onClick={() => payPending(e.entry_id)} data-testid={`pay-${e.entry_id}`}
                          className="text-xs px-3 py-1.5 rounded-full bg-emerald text-white hover:opacity-90 inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Mark given
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Manual maaser + ledger */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4"><Star className="h-4 w-4 text-topaz" /><p className="label-overline">Maaser calculator</p></div>
          <div className="grid grid-cols-2 gap-3">
            <input data-testid="maaser-income" type="number" value={maaser.income} onChange={(e)=>setMaaser({...maaser, income:e.target.value})} placeholder="Income" className="h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
            <input data-testid="maaser-percent" type="number" value={maaser.percent} onChange={(e)=>setMaaser({...maaser, percent:e.target.value})} placeholder="%" className="h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
          </div>
          <button onClick={runMaaser} data-testid="maaser-calc" className="btn-pill gradient-emerald text-white mt-4 text-sm">Calculate</button>
          {maaser.result !== null && (
            <div className="mt-6 p-4 rounded-xl bg-secondary/40">
              <p className="label-overline">Maaser due</p>
              <p className="text-3xl tracking-tight font-medium text-emerald mt-2">£{maaser.result.toFixed(2)}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="label-overline">Tzedakah ledger</p>
          <p className="text-2xl tracking-tight font-medium mt-2">£{total.toFixed(2)} <span className="text-sm text-muted-foreground">given</span></p>
          <form onSubmit={addTz} className="mt-4 grid grid-cols-2 gap-2">
            <input data-testid="tz-amount" required type="number" step="0.01" placeholder="£" value={form.amount} onChange={(e)=>setForm({...form, amount:e.target.value})} className="h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
            <input data-testid="tz-recipient" required placeholder="Recipient" value={form.recipient} onChange={(e)=>setForm({...form, recipient:e.target.value})} className="h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
            <input data-testid="tz-note" placeholder="Note (optional)" value={form.note} onChange={(e)=>setForm({...form, note:e.target.value})} className="col-span-2 h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
            <button data-testid="tz-add" className="col-span-2 btn-pill gradient-emerald text-white text-sm"><Plus className="h-4 w-4 mr-2"/>Add</button>
          </form>
          <div className="mt-4 max-h-48 overflow-auto space-y-1 text-sm">
            {entries.slice(0,8).map(e=>(
              <div key={e.entry_id} className="flex justify-between py-1.5 border-b border-border last:border-0">
                <span className="truncate">{e.recipient}{e.status === "pending" && <span className="ml-1 text-xs text-topaz">(pending)</span>}</span>
                <span className="font-medium">£{e.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {upcomingHols.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6" data-testid="upcoming-holidays">
          <p className="label-overline">Upcoming Jewish holidays</p>
          <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {upcomingHols.slice(0,8).map((h) => (
              <div key={`${h.date}-${h.title}`} className="rounded-xl border border-border p-3 hover:border-topaz transition-colors">
                <p className="text-xs text-muted-foreground">{h.date}</p>
                <p className="font-medium mt-1 text-sm">{h.title}</p>
                {h.hebrew && <p className="text-xs text-topaz mt-1" dir="rtl" style={{fontFamily:"Fraunces"}}>{h.hebrew}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4"><Calendar className="h-4 w-4 text-topaz" /><p className="label-overline">Yom Tov budget forecast</p></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {holidays.map((h) => (
            <div key={h.holiday} className="rounded-xl border border-border p-4 hover:border-topaz transition-colors">
              <div className="flex items-center justify-between">
                <p className="font-medium">{h.holiday}</p>
                <span className="text-xs px-2 py-1 rounded-full bg-secondary">{h.month}</span>
              </div>
              <p className="text-2xl tracking-tight font-medium text-topaz mt-2">+{h.uplift_pct}%</p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{h.tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const Stat = ({ label, value, accent, testid }) => (
  <div data-testid={testid} className="rounded-xl bg-secondary/40 p-4">
    <p className="label-overline">{label}</p>
    <p className={`text-2xl tracking-tight font-medium mt-1 ${accent === "ruby" ? "text-ruby" : accent === "topaz" ? "text-topaz" : "text-emerald"}`}>{value}</p>
  </div>
);

import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Star, Plus, Calendar, Sunrise, MapPin, Sparkles, CheckCircle2, RefreshCw, Pencil, Trash2, Heart, DollarSign, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/layout";

const CITIES = ["london","manchester","gateshead","leeds","jerusalem","tel-aviv","new-york","monsey","lakewood","stamford-hill"];

const CHASUNA_STATUSES = ["planned", "booked", "paid"];

export default function Jewish() {
  const [maaser, setMaaser] = useState({ income: 5000, percent: 10, result: null });
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState({ amount: "", recipient: "", note: "" });
  const [holidays, setHolidays] = useState([]);
  const [holidayBudgets, setHolidayBudgets] = useState([]);
  const [selectedHoliday, setSelectedHoliday] = useState(null);
  const [holidayForm, setHolidayForm] = useState({ category: "", budgeted_amount: "" });
  const [editingBudget, setEditingBudget] = useState(null);
  const [budgetSummary, setBudgetSummary] = useState(null);

  // Chasuna state
  const [chasunaItems, setChasunaItems] = useState([]);
  const [chasunaSum, setChasunaSum] = useState(null);
  const [chasunaForm, setChasunaForm] = useState({ category: "", description: "", estimated_cost: "", vendor: "", due_date: "" });
  const [editingChasuna, setEditingChasuna] = useState(null);
  const [showChasunaForm, setShowChasunaForm] = useState(false);
  const [chasunaCategories, setChasunaCategories] = useState([]);

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
  const [activeTab, setActiveTab] = useState("maaser");

  const loadAll = useCallback(async () => {
    try {
      const [tz, hd] = await Promise.all([
        api.get("/jewish/tzedakah"),
        api.get("/jewish/holidays/defaults"),
      ]);
      setEntries(tz.data.entries || []);
      setTotal(tz.data.total_given || 0);
      setHolidays(hd.data.holidays || []);
    } catch (err) {
      console.error("loadAll", err);
    }
  }, []);

  const loadHolidayBudgets = useCallback(async () => {
    try {
      const { data } = await api.get("/jewish/holiday-budgets");
      setHolidayBudgets(data.budgets || []);
    } catch (err) {
      console.error("holiday budgets", err);
    }
  }, []);

  const loadChasuna = useCallback(async () => {
    try {
      const [items, sum, cats] = await Promise.all([
        api.get("/jewish/chasuna"),
        api.get("/jewish/chasuna/summary"),
        api.get("/jewish/chasuna/categories"),
      ]);
      setChasunaItems(items.data.items || []);
      setChasunaSum(items.data);
      setChasunaCategories(cats.data.categories || []);
    } catch (err) {
      console.error("chasuna", err);
    }
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
  useEffect(() => { loadHolidayBudgets(); }, [loadHolidayBudgets]);
  useEffect(() => { loadChasuna(); }, [loadChasuna]);

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
    try {
      const { data } = await api.post(`/jewish/maaser/calc?income=${Number(maaser.income)}&percent=${Number(maaser.percent)}`);
      setMaaser({ ...maaser, result: data.maaser_amount });
    } catch { toast.error("Could not calculate"); }
  };

  const addTz = async (e) => {
    e.preventDefault();
    await api.post("/jewish/tzedakah", { amount: parseFloat(form.amount), recipient: form.recipient, note: form.note });
    toast.success("Tzedakah recorded"); setForm({ amount:"", recipient:"", note:"" }); await loadAll(); await loadMaaser();
  };

  const pending = entries.filter((e) => e.status === "pending");

  // ── Holiday budget CRUD ──

  const initHolidayBudget = async (name) => {
    try {
      const { data } = await api.post(`/jewish/holiday-budgets/init/${encodeURIComponent(name)}`);
      toast.success(`Initialised ${name} budget with ${data.count} categories`);
      await loadHolidayBudgets();
    } catch (err) { toast.error(err.response?.data?.detail || "Could not init budget"); }
  };

  const saveBudgetCategory = async () => {
    if (!selectedHoliday || !holidayForm.category) return;
    try {
      await api.post("/jewish/holiday-budgets", {
        holiday_name: selectedHoliday,
        category: holidayForm.category,
        budgeted_amount: parseFloat(holidayForm.budgeted_amount) || 0,
      });
      toast.success("Category added");
      setHolidayForm({ category: "", budgeted_amount: "" });
      await loadHolidayBudgets();
    } catch (err) { toast.error(err.response?.data?.detail || "Could not add category"); }
  };

  const updateBudgetCategory = async (id, updates) => {
    try {
      await api.put(`/jewish/holiday-budgets/${id}`, updates);
      setEditingBudget(null);
      await loadHolidayBudgets();
      if (selectedHoliday) loadBudgetSummary(selectedHoliday);
    } catch (err) { toast.error("Could not update"); }
  };

  const deleteBudgetCategory = async (id) => {
    if (!window.confirm("Delete this budget category?")) return;
    try {
      await api.delete(`/jewish/holiday-budgets/${id}`);
      await loadHolidayBudgets();
    } catch (err) { toast.error("Could not delete"); }
  };

  const loadBudgetSummary = async (name) => {
    try {
      const { data } = await api.get(`/jewish/holiday-budgets/summary/${encodeURIComponent(name)}`);
      setBudgetSummary(data);
    } catch { setBudgetSummary(null); }
  };

  const viewHoliday = async (name) => {
    setSelectedHoliday(selectedHoliday === name ? null : name);
    if (selectedHoliday !== name) await loadBudgetSummary(name);
  };

  // ── Chasuna CRUD ──

  const saveChasuna = async (e) => {
    e.preventDefault();
    try {
      if (editingChasuna) {
        await api.put(`/jewish/chasuna/${editingChasuna}`, chasunaForm);
        setEditingChasuna(null);
      } else {
        await api.post("/jewish/chasuna", chasunaForm);
      }
      setChasunaForm({ category: "", description: "", estimated_cost: "", vendor: "", due_date: "" });
      setShowChasunaForm(false);
      await loadChasuna();
      toast.success(editingChasuna ? "Updated" : "Added");
    } catch (err) { toast.error(err.response?.data?.detail || "Could not save"); }
  };

  const editChasuna = (item) => {
    setEditingChasuna(item.id);
    setChasunaForm({
      category: item.category,
      description: item.description || "",
      estimated_cost: String(item.estimated_cost || ""),
      vendor: item.vendor || "",
      due_date: item.due_date ? item.due_date.slice(0, 10) : "",
    });
    setShowChasunaForm(true);
  };

  const deleteChasuna = async (id) => {
    if (!window.confirm("Delete this chasuna item?")) return;
    try {
      await api.delete(`/jewish/chasuna/${id}`);
      await loadChasuna();
      toast.success("Deleted");
    } catch (err) { toast.error("Could not delete"); }
  };

  const getBudgetForHoliday = (name) => {
    const b = holidayBudgets.find(h => h.holiday_name === name || h.holiday_name === name);
    return b;
  };

  const holidayNames = holidays.map(h => h.holiday);

  return (
    <div className="space-y-8" data-testid="jewish-root">
      <PageHeader
        eyebrow="Tools"
        title="Maaser, Tzedakah, Yom Tov."
        description="A dedicated space for Jewish finance planning, giving, and holiday budgeting."
      />

      {/* Tab navigation */}
      <div className="flex gap-2 flex-wrap border-b border-border pb-2">
        {["maaser", "holidays", "chasuna"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`text-sm px-4 py-2 rounded-t-lg transition-colors capitalize ${activeTab === tab ? "bg-card border-b-2 border-emerald font-medium" : "text-muted-foreground hover:text-foreground"}`}>
            {tab === "maaser" ? "Maaser & Tzedakah" : tab === "holidays" ? "Yom Tov Budgets" : "Chasuna Planning"}
          </button>
        ))}
      </div>

      {/* ═══ MAASER TAB ═══ */}
      {activeTab === "maaser" && <>
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
    </>}

    {/* ═══ YOM TOV BUDGET TAB ═══ */}
    {activeTab === "holidays" && <>
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4"><Calendar className="h-4 w-4 text-topaz" /><p className="label-overline">Yom Tov budget forecast</p></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {holidays.map((h) => (
            <div key={h.holiday} className="rounded-xl border border-border p-4 hover:border-topaz transition-colors">
              <div className="flex items-center justify-between">
                <p className="font-medium">{h.holiday}</p>
                <span className="text-xs px-2 py-1 rounded-full bg-secondary">{h.month}</span>
              </div>
              <p className="text-2xl tracking-tight font-medium text-topaz mt-2">+{h.uplift_pct}% uplift</p>
              <p className="text-xs text-muted-foreground mt-2">{h.categories?.length} categories</p>
              <button onClick={() => viewHoliday(h.holiday)} className="mt-3 text-xs px-3 py-1 rounded-full border border-border hover:border-topaz hover:text-topaz">
                {selectedHoliday === h.holiday ? "Close" : "Budget"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Selected holiday budget details */}
      {selectedHoliday && (
        <div className="rounded-2xl border-2 border-topaz/30 bg-card p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <p className="label-overline">{selectedHoliday} budget</p>
            <div className="flex gap-2">
              <button onClick={() => initHolidayBudget(selectedHoliday)} className="text-xs px-3 py-1.5 rounded-full bg-topaz text-white hover:opacity-90">
                Init from defaults
              </button>
            </div>
          </div>

          {/* Summary */}
          {budgetSummary && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat label="Budgeted" value={`£${budgetSummary.total_budgeted.toFixed(2)}`} accent="topaz" />
              <Stat label="Actual" value={`£${budgetSummary.total_actual.toFixed(2)}`} accent="emerald" />
              <Stat label="Remaining" value={`£${budgetSummary.remaining.toFixed(2)}`} accent={budgetSummary.remaining > 0 ? "emerald" : "ruby"} />
            </div>
          )}

          {/* Add category form */}
          <div className="flex gap-2 mb-4">
            <input placeholder="Category name" value={holidayForm.category}
                   onChange={e => setHolidayForm({...holidayForm, category: e.target.value})}
                   className="h-10 flex-1 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
            <input placeholder="Budget £" type="number" value={holidayForm.budgeted_amount}
                   onChange={e => setHolidayForm({...holidayForm, budgeted_amount: e.target.value})}
                   className="h-10 w-28 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
            <button onClick={saveBudgetCategory} className="btn-pill gradient-topaz text-white text-sm">
              <Plus className="h-4 w-4 mr-1" /> Add
            </button>
          </div>

          {/* Category list */}
          {holidayBudgets.filter(b => b.holiday_name === selectedHoliday).map(b => (
            <div key={b.holiday_name + b.hebrew_year}>
              {b.categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  {editingBudget === cat.id ? (
                    <div className="flex gap-2 w-full">
                      <input type="number" defaultValue={cat.budgeted_amount}
                             id={`budget-${cat.id}`} className="h-9 w-28 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
                      <input type="number" defaultValue={cat.actual_amount}
                             id={`actual-${cat.id}`} className="h-9 w-28 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
                      <button onClick={() => updateBudgetCategory(cat.id, {
                        budgeted_amount: parseFloat(document.getElementById(`budget-${cat.id}`).value) || 0,
                        actual_amount: parseFloat(document.getElementById(`actual-${cat.id}`).value) || 0,
                      })} className="text-xs px-3 py-1.5 rounded-full bg-emerald text-white">Save</button>
                      <button onClick={() => setEditingBudget(null)} className="text-xs px-3 py-1.5 rounded-full border border-border">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{cat.category}</p>
                        <p className="text-xs text-muted-foreground">Budget: £{cat.budgeted_amount.toFixed(2)} · Actual: £{cat.actual_amount.toFixed(2)}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEditingBudget(cat.id)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteBudgetCategory(cat.id)} className="p-1.5 rounded-lg hover:bg-secondary text-ruby"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
          {holidayBudgets.filter(b => b.holiday_name === selectedHoliday).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No budget yet. Click "Init from defaults" or add categories above.</p>
          )}
        </div>
      )}

      {/* Upcoming holidays */}
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
    </>}

    {/* ═══ CHASUNA TAB ═══ */}
    {activeTab === "chasuna" && <>
      <div className="rounded-2xl border-2 border-topaz/30 bg-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-ruby" />
            <p className="text-lg tracking-tight font-medium">Chasuna / Wedding Planner</p>
          </div>
          <button onClick={() => { setShowChasunaForm(!showChasunaForm); setEditingChasuna(null); setChasunaForm({ category: "", description: "", estimated_cost: "", vendor: "", due_date: "" }); }}
                  className="btn-pill gradient-topaz text-white text-sm">
            <Plus className="h-4 w-4 mr-1" /> Add item
          </button>
        </div>

        {/* Chasuna summary */}
        {chasunaSum && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Stat label="Total estimated" value={`£${chasunaSum.total_estimated?.toFixed(2) || "0.00"}`} accent="topaz" />
            <Stat label="Total spent" value={`£${chasunaSum.total_actual?.toFixed(2) || "0.00"}`} accent="emerald" />
            <Stat label="Deposits paid" value={`£${chasunaSum.total_deposit_paid?.toFixed(2) || "0.00"}`} accent="emerald" />
            <Stat label="Remaining" value={`£${chasunaSum.remaining?.toFixed(2) || "0.00"}`} accent={chasunaSum.remaining > 0 ? "ruby" : "emerald"} />
          </div>
        )}

        {/* Progress bar */}
        {chasunaSum?.total_estimated > 0 && (
          <div className="mb-6">
            <div className="flex justify-between text-xs mb-1">
              <span>Progress</span>
              <span>{chasunaSum.progress_pct?.toFixed(1) || 0}%</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald to-topaz rounded-full transition-all"
                   style={{ width: `${Math.min(100, chasunaSum.progress_pct || 0)}%` }} />
            </div>
          </div>
        )}

        {/* Add/Edit form */}
        {showChasunaForm && (
          <form onSubmit={saveChasuna} className="mb-6 p-4 rounded-xl bg-secondary/20 border border-border space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select value={chasunaForm.category} onChange={e => setChasunaForm({...chasunaForm, category: e.target.value})} required
                      className="h-10 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm">
                <option value="">Select category</option>
                {chasunaCategories.map(c => <option key={c} value={c}>{c.replace("-", " ")}</option>)}
              </select>
              <input placeholder="Description" value={chasunaForm.description}
                     onChange={e => setChasunaForm({...chasunaForm, description: e.target.value})}
                     className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input placeholder="Estimated cost £" type="number" value={chasunaForm.estimated_cost}
                     onChange={e => setChasunaForm({...chasunaForm, estimated_cost: e.target.value})}
                     className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
              <input placeholder="Vendor" value={chasunaForm.vendor}
                     onChange={e => setChasunaForm({...chasunaForm, vendor: e.target.value})}
                     className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
              <input placeholder="Due date" type="date" value={chasunaForm.due_date}
                     onChange={e => setChasunaForm({...chasunaForm, due_date: e.target.value})}
                     className="h-10 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-topaz focus:outline-none text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-pill gradient-emerald text-white text-sm">
                {editingChasuna ? "Update" : "Add to plan"}
              </button>
              <button type="button" onClick={() => { setShowChasunaForm(false); setEditingChasuna(null); }}
                      className="text-xs px-4 py-2 rounded-full border border-border">Cancel</button>
            </div>
          </form>
        )}

        {/* Items list */}
        {chasunaItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No items yet. Add your first chasuna expense above.</p>
        ) : (
          <div className="space-y-2">
            {chasunaItems.map(item => (
              <div key={item.id} className="flex items-center justify-between py-3 px-4 rounded-xl bg-secondary/20 border border-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.status === "paid" ? "bg-emerald" : item.status === "booked" ? "bg-topaz" : "bg-muted-foreground"}`} />
                    <p className="text-sm font-medium truncate">{item.category.replace("-", " ")}</p>
                    {item.description && <span className="text-xs text-muted-foreground truncate">· {item.description}</span>}
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Est: £{item.estimated_cost?.toFixed(2) || "0.00"}</span>
                    {item.actual_cost > 0 && <span>Actual: £{item.actual_cost.toFixed(2)}</span>}
                    {item.deposit_paid > 0 && <span>Deposit: £{item.deposit_paid.toFixed(2)}</span>}
                    {item.vendor && <span>· {item.vendor}</span>}
                    {item.due_date && <span>· Due: {item.due_date.slice(0, 10)}</span>}
                  </div>
                </div>
                <div className="flex gap-1 ml-3">
                  <button onClick={() => editChasuna(item)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => deleteChasuna(item.id)} className="p-1.5 rounded-lg hover:bg-secondary text-ruby"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>}

    </div>
  );
}

const Stat = ({ label, value, accent, testid }) => (
  <div data-testid={testid} className="rounded-xl bg-secondary/40 p-4">
    <p className="label-overline">{label}</p>
    <p className={`text-2xl tracking-tight font-medium mt-1 ${accent === "ruby" ? "text-ruby" : accent === "topaz" ? "text-topaz" : "text-emerald"}`}>{value}</p>
  </div>
);

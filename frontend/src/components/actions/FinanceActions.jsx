import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Pencil, Search, Plus, Wallet, Receipt, Target } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import CategoryCombobox from "../CategoryCombobox";
import PenniSelect from "../PenniSelect";
import { Button } from "../ui/button";

const monthNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
};

export function BudgetActionForm({ budget, category, month, categories, onSaved }) {
  const [type, setType] = useState(budget?.budget_type === "event" ? "event" : "everyday");
  const [categoryName, setCategoryName] = useState(budget?.category || category || "");
  const [amount, setAmount] = useState(budget?.limit == null ? "" : String(budget.limit));
  const [eventDate, setEventDate] = useState(budget?.event_date?.slice(0, 10) || "");
  const [eventName, setEventName] = useState(budget?.event_group_name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setCategoryName(budget?.category || category || "");
    setAmount(budget?.limit == null ? "" : String(budget.limit));
    setType(budget?.budget_type === "event" ? "event" : "everyday");
  }, [budget, category]);
  const submit = async e => {
    e.preventDefault();
    if (!categoryName.trim() || !Number.isFinite(Number(amount)) || Number(amount) < 0 || amount === "") {
      setError("Choose a category and enter a valid budget amount.");
      return;
    }
    if (type === "event" && !budget && !eventName.trim()) {
      setError("Enter a name for this event.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (budget?.budget_id) {
        await api.patch(`/budgets/${budget.budget_id}`, { category: categoryName.toLowerCase().trim(), limit: Number(amount), ...(type==="event" ? {event_date: eventDate || null} : {}) });
      } else {
        await api.post("/budgets", {
          category: categoryName.toLowerCase().trim(), limit: Number(amount), period: "monthly", budget_type: type,
          ...(type==="event" ? {event_date: eventDate || undefined, event_group_name: eventName.trim()} : {month: month || monthNow()})
        });
      }
      toast.success(budget ? "Budget updated" : "Budget created");
      onSaved?.();
    } catch (requestError) {
      const message = formatApiError(requestError) || "Could not save budget.";
      setError(message);
      toast.error(message);
    } finally { setSaving(false); }
  };
  return <form onSubmit={submit} className="penni-native-form space-y-5 px-1 pb-1" noValidate>
    {!budget && (
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-secondary/30 p-1" role="group" aria-label="Budget type">
        <button type="button" aria-pressed={type === "everyday"} onClick={() => { setType("everyday"); setError(""); }}
          className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${type === "everyday" ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>
          Monthly
        </button>
        <button type="button" aria-pressed={type === "event"} onClick={() => { setType("event"); setError(""); }}
          className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${type === "event" ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>
          Event
        </button>
      </div>
    )}
    {type === "event" && !budget && (
      <div className="space-y-1.5">
        <label htmlFor="penni-budget-event-name" className="block text-xs font-medium text-muted-foreground">Event name</label>
        <input id="penni-budget-event-name" required value={eventName}
          onChange={e => { setEventName(e.target.value); setError(""); }} placeholder="e.g. Pesach"
          className="h-11 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25"/>
      </div>
    )}
    {type === "event" && (
      <div className="space-y-1.5">
        <label htmlFor="penni-budget-event-date" className="block text-xs font-medium text-muted-foreground">Event date</label>
        <input id="penni-budget-event-date" type="date" value={eventDate}
          onChange={e => setEventDate(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25"/>
      </div>
    )}
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">Category <span aria-hidden="true">*</span></span>
      <CategoryCombobox value={categoryName} onChange={value => { setCategoryName(value); setError(""); }}
        categories={categories} placeholder="Choose a category" />
    </div>
    <div className="space-y-1.5">
      <label htmlFor="penni-budget-limit" className="block text-xs font-medium text-muted-foreground">Budget limit (£) <span aria-hidden="true">*</span></label>
      <input id="penni-budget-limit" type="number" inputMode="decimal" min="0" step="0.01" required
        value={amount} onChange={e => { setAmount(e.target.value); setError(""); }}
        className="h-11 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25"
        placeholder="0.00"/>
    </div>
    {error && <p role="alert" className="rounded-xl border border-ruby/30 bg-ruby/5 px-3 py-2.5 text-sm text-ruby">{error}</p>}
    <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
      <Button type="submit" variant="primary" disabled={saving} className="min-w-[160px]">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
        {budget ? "Save changes" : "Create budget"}
      </Button>
    </div>
  </form>;
}

export function BudgetActionPreview({ budget, onEdit, onCreate }) {
  const b=budget||{};
  return <div className="space-y-4">
    <div className="rounded-xl bg-secondary/40 p-4"><p className="text-xs text-muted-foreground">Category</p><p className="mt-1 text-lg font-semibold capitalize">{b.category||"Budget"}</p></div>
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Budget</p><p className="mt-1 text-lg font-semibold">{formatCurrency(Number(b.limit)||0)}</p></div>
      <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Spent</p><p className="mt-1 text-lg font-semibold">{formatCurrency(Number(b.spent)||0)}</p></div>
    </div>
    <div className="rounded-xl border border-border p-3"><div className="flex justify-between text-xs"><span>Progress</span><span>{Math.round(Number(b.progress_pct)||0)}%</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-emerald" style={{width:`${Math.max(0,Math.min(100,Number(b.progress_pct)||0))}%`}}/></div>
    </div>
    <Button variant="primary" onClick={onEdit} className="w-full"><Pencil className="mr-2 h-4 w-4"/> Edit budget</Button>
    <Button variant="outlinePill" onClick={onCreate} className="w-full"><Plus className="mr-2 h-4 w-4"/> Add another budget</Button>
  </div>;
}

export function AccountActionPreview({ accountId, account: initialAccount, onAddTransaction, onClose }) {
  const [account,setAccount]=useState(initialAccount||null);
  const [transactions,setTransactions]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{let current=true;setLoading(true);
    Promise.all([api.get(`/accounts/${accountId}`),api.get("/transactions",{params:{account_id:accountId,limit:10}})])
      .then(([a,t])=>{if(current){setAccount(a.data);setTransactions(t.data.transactions||[]);}}).catch(()=>toast.error("Could not load account details")).finally(()=>{if(current)setLoading(false)});
    return()=>{current=false};
  },[accountId]);
  if(loading)return <p className="py-10 text-center text-xs text-muted-foreground">Loading account details…</p>;
  return <div className="space-y-4">
    <div className="rounded-xl bg-secondary/50 p-4"><p className="text-xs text-muted-foreground">Available balance</p><p className="mt-1 text-2xl font-semibold">{formatCurrency(Number(account?.balance)||0)}</p><p className="mt-2 text-xs text-muted-foreground">{account?.name} · {account?.currency||"GBP"}</p></div>
    <Button variant="outlinePill" className="w-full" onClick={()=>onAddTransaction(accountId)}><Plus className="mr-2 h-4 w-4"/> Add transaction to this account</Button>
    <Link to={`/accounts/${accountId}`} onClick={onClose} className="block rounded-lg border border-border p-3 text-center text-xs font-semibold text-emerald hover:bg-secondary/40">Open full account dashboard</Link>
    <h3 className="text-sm font-semibold">Recent transactions</h3>
    <div className="divide-y divide-border/60 rounded-xl border border-border">{transactions.map(t=><div key={t.transaction_id} className="flex gap-2 p-3 text-xs"><span className="min-w-0 flex-1"><span className="block truncate font-medium">{t.description||t.merchant||"Transaction"}</span><span className="text-muted-foreground">{String(t.date||"").slice(0,10)}</span></span><span className="shrink-0 font-semibold">{formatCurrency(Number(t.amount)||0)}</span></div>)}
      {!transactions.length && <p className="p-4 text-center text-xs text-muted-foreground">No recent transactions</p>}
    </div>
  </div>;
}

export function ReportsActionPreview() {
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  useEffect(()=>{let active=true;Promise.all([api.get("/dashboard/overview"),api.get("/analytics/spending-by-category")]).then(([a,b])=>{if(active)setData({overview:a.data,categories:b.data.categories||[]})}).catch(()=>{if(active)setError("Could not load reports")});return()=>{active=false}},[]);
  if(error)return <p role="alert" className="p-4 text-sm text-ruby">{error}</p>;
  if(!data)return <p className="py-10 text-center text-sm text-muted-foreground">Loading reports…</p>;
  const o=data.overview;
  return <div className="space-y-3"><div className="grid grid-cols-2 gap-3">
    {[["Income",o.income],["Spending",o.spend??o.spending],["Balance",o.balance],["Savings rate",null]].map(([label,value])=><div key={label} className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value==null?`${Number(o.savings_rate)||0}%`:formatCurrency(Number(value)||0)}</p></div>)}
  </div><h3 className="pt-2 text-sm font-semibold">Spending by category</h3><div className="divide-y divide-border rounded-xl border border-border">{data.categories.slice(0,12).map((c,i)=><div key={c.category||i} className="flex justify-between gap-3 p-3 text-xs"><span className="capitalize">{c.category||c.name}</span><span className="font-semibold">{formatCurrency(Number(c.amount??c.total??c.value)||0)}</span></div>)}{!data.categories.length&&<p className="p-4 text-xs text-muted-foreground">No spending data available</p>}</div></div>;
}

export function SearchTransactionsAction({ onInspect, month }) {
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const requestKey = React.useRef("");
  const pageSize = 100;
  const filters = (query) => ({
    ...(query.trim() ? { search: query.trim() } : {}),
    ...(month ? { date_from: `${month}-01`, date_to: `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()}` } : {}),
  });
  useEffect(() => {
    const key = `${term}| ${month || ""}`;
    requestKey.current = key;
    setRows([]);
    setTotal(0);
    setError("");
    if (!term.trim() && !month) { setLoading(false); return; }
    let active = true;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/transactions", { params: { ...filters(term), limit: pageSize, offset: 0 } });
        if (active && requestKey.current === key) {
          setRows(data.transactions || []);
          setTotal(Number(data.total) || 0);
        }
      } catch {
        if (active) setError("Search failed. Please try again.");
      } finally { if (active) setLoading(false); }
    }, 300);
    return () => { active = false; clearTimeout(timeout); };
  }, [term, month]);

  const loadMore = async () => {
    if (loading || rows.length >= total) return;
    const key = requestKey.current;
    setLoading(true);
    try {
      const { data } = await api.get("/transactions", { params: { ...filters(term), limit: pageSize, offset: rows.length } });
      if (requestKey.current === key) setRows(previous => [...previous, ...(data.transactions || [])]);
    } catch { setError("Could not load more results"); }
    finally { if (requestKey.current === key) setLoading(false); }
  };
  return <div className="space-y-3">
    <label className="relative block">
      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/>
      <input autoFocus value={term} onChange={event => setTerm(event.target.value)}
        placeholder="Search transactions, merchants or descriptions"
        className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm"/>
    </label>
    <p className="text-xs text-muted-foreground">{rows.length} of {total} matching transactions shown</p>
    {error && <p role="alert" className="text-xs text-ruby">{error}</p>}
    <div className="subtle-scroll max-h-[55vh] overflow-y-auto divide-y divide-border rounded-xl border border-border">
      {rows.map(tx => <button key={tx.transaction_id} type="button" onClick={()=>onInspect(tx)}
        className="flex w-full items-center gap-3 p-3 text-left text-xs hover:bg-secondary/50">
        <Receipt className="h-4 w-4 shrink-0 text-muted-foreground"/>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{tx.description||tx.merchant||"Transaction"}</span>
          <span className="text-muted-foreground">{String(tx.date||"").slice(0,10)}</span>
        </span>
        <span className="shrink-0 font-semibold">{formatCurrency(Number(tx.amount)||0)}</span>
      </button>)}
      {!loading && !rows.length && <p className="p-4 text-center text-xs text-muted-foreground">
        {term || month ? "No matching transactions" : "Start typing to search"}
      </p>}
    </div>
    {rows.length < total && <Button onClick={loadMore} disabled={loading} variant="outlinePill" className="w-full">
      {loading ? "Loading…" : "Load more transactions"}
    </Button>}
  </div>;
}

export function SplitTransactionAction({ transaction, categories, onSaved }) {
  const amount = Math.abs(Number(transaction?.amount)||0);
  const [lines, setLines] = useState(() => [
    { category: transaction?.category||"", amount: amount ? String((Math.round(amount*50)/100).toFixed(2)) : "", description:"" },
    { category:"", amount: amount ? String((amount-Math.round(amount*50)/100).toFixed(2)) : "", description:"" },
  ]);
  const [busy,setBusy] = useState(false);
  const setLine = (i,key,value) => setLines(prev=>prev.map((line,index)=>index===i?{...line,[key]:value}:line));
  const total = lines.reduce((sum,line)=>sum+Math.abs(Number(line.amount)||0),0);
  const save = async () => {
    const splits=lines.map(line=>({category:line.category,amount:Math.abs(Number(line.amount)||0),description:line.description||transaction?.description||""}));
    if(splits.length < 2 || splits.some(line=>!line.category || line.amount<=0)){toast.error("Add at least two valid categories and amounts");return}
    if(Math.abs(total-amount)>0.01){toast.error("Split amounts must equal the original amount");return}
    setBusy(true);
    try{await api.put(`/transactions/${transaction.transaction_id}/splits`,{splits});toast.success("Transaction split saved");onSaved?.()}
    catch(e){toast.error(formatApiError(e.response?.data?.detail)||"Could not save split")}
    finally{setBusy(false)}
  };
  return <div className="space-y-4">
    <p className="rounded-xl bg-secondary/50 p-3 text-xs">Split <strong>{formatCurrency(amount)}</strong> across two or more categories.</p>
    {lines.map((line,i)=><div key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_110px_28px]">
      <CategoryCombobox value={line.category} onChange={value=>setLine(i,"category",value)} categories={categories} placeholder="Category"/>
      <input aria-label={`Amount for split ${i+1}`} type="number" min="0" step="0.01" value={line.amount} onChange={e=>setLine(i,"amount",e.target.value)} className="h-10 rounded-xl border border-border bg-card px-2 text-xs"/>
      <button type="button" aria-label={`Remove split ${i+1}`} disabled={lines.length<=2} onClick={()=>setLines(prev=>prev.filter((_,j)=>j!==i))} className="text-ruby disabled:opacity-30">×</button>
      <input aria-label={`Description for split ${i+1}`} value={line.description} onChange={e=>setLine(i,"description",e.target.value)} placeholder="Optional note" className="h-9 rounded-lg border border-border bg-card px-2 text-xs sm:col-span-3"/>
    </div>)}
    <div className="flex items-center justify-between gap-3">
      <Button variant="outlinePill" onClick={()=>setLines(prev=>[...prev,{category:"",amount:"",description:""}])}>Add line</Button>
      <span className={`text-xs font-semibold ${Math.abs(total-amount)<0.01?"text-emerald":"text-ruby"}`}>Total: {formatCurrency(total)} / {formatCurrency(amount)}</span>
    </div>
    <Button variant="primary" className="w-full" disabled={busy||Math.abs(total-amount)>0.01} onClick={save}>{busy?"Saving…":"Save split"}</Button>
  </div>;
}

export function PairTransferAction({ transaction, onSaved }) {
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const pageSize = 250;
  const fetchPage = async (pageOffset, isCurrent = () => true) => {
    const { data } = await api.get("/transactions", { params: { limit: pageSize, offset: pageOffset } });
    if (!isCurrent()) return;
    const newCandidates = (data.transactions || []).filter(row =>
      row.transaction_id !== transaction?.transaction_id && !row.transfer_pair_id &&
      row.account_id !== transaction?.account_id &&
      (row.currency || "GBP") === (transaction?.currency || "GBP") &&
      Number(row.amount || 0) * Number(transaction?.amount || 0) < 0 &&
      Math.round(Math.abs(Number(row.amount || 0)) * 100) === Math.round(Math.abs(Number(transaction?.amount || 0)) * 100)
    );
    setCandidates(previous => pageOffset === 0 ? newCandidates : [...previous, ...newCandidates]);
    setOffset(pageOffset + (data.transactions || []).length);
    setTotal(Number(data.total) || 0);
  };
  useEffect(() => {
    let active = true;
    setCandidates([]);
    setOffset(0);
    setLoading(true);
    fetchPage(0, () => active)
      .catch(() => { if (active) setError("Could not load possible transfer matches"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [transaction?.transaction_id, transaction?.amount]);

  const loadMore = async () => {
    setLoading(true);
    try { await fetchPage(offset); }
    catch { setError("Could not load more transfer matches"); }
    finally { setLoading(false); }
  };
  const save = async () => {
    const candidate = candidates.find(row => row.transaction_id === selected);
    if (!candidate) { toast.error("Choose the matching transaction"); return; }
    const outgoing = Number(transaction.amount) < 0 ? transaction.transaction_id : candidate.transaction_id;
    const incoming = Number(transaction.amount) > 0 ? transaction.transaction_id : candidate.transaction_id;
    setBusy(true);
    try {
      await api.post("/transactions/transfer-pairs", { outgoing_transaction_id: outgoing, incoming_transaction_id: incoming });
      toast.success("Transfer paired");
      onSaved?.();
    } catch(error) { toast.error(formatApiError(error.response?.data?.detail) || "Could not pair transfer"); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <div className="rounded-xl bg-secondary/40 p-3 text-xs">
      <p className="font-semibold">{transaction?.description || "Transfer"}</p>
      <p>{formatCurrency(Number(transaction?.amount) || 0)}</p>
    </div>
    <label className="block text-xs font-semibold" htmlFor="pair-transfer-match">Matching transaction from a different account</label>
    <PenniSelect id="pair-transfer-match" value={selected} onChange={event => setSelected(event.target.value)}
      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-xs" aria-label="Matching transaction">
      <option value="">Select matching transaction</option>
      {candidates.map(row => <option key={row.transaction_id} value={row.transaction_id}>
        {row.date} · {row.description || row.merchant || "Transaction"} · {formatCurrency(Number(row.amount) || 0)}
      </option>)}
    </PenniSelect>
    <p className="text-xs text-muted-foreground">Checked {offset} of {total} transactions for an exact matching amount.</p>
    {error && <p role="alert" className="text-xs text-ruby">{error}</p>}
    {offset < total && <Button variant="outlinePill" disabled={loading} onClick={loadMore} className="w-full">
      {loading ? "Looking for matches…" : "Look for older matching transactions"}
    </Button>}
    {!loading && offset >= total && !candidates.length &&
      <p className="text-xs text-muted-foreground">No matching transfer found. You can pair it later from Transactions.</p>}
    <Button variant="primary" className="w-full" disabled={busy || !selected} onClick={save}>
      {busy ? "Pairing…" : "Pair transfer"}
    </Button>
  </div>;
}

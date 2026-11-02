import React, { useEffect, useState } from "react";
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
  useEffect(() => {
    setCategoryName(budget?.category || category || "");
    setAmount(budget?.limit == null ? "" : String(budget.limit));
    setType(budget?.budget_type === "event" ? "event" : "everyday");
  }, [budget, category]);
  const submit = async e => {
    e.preventDefault();
    if (!categoryName.trim() || !Number.isFinite(Number(amount)) || Number(amount) < 0 || amount === "") { toast.error("Enter a category and valid budget amount"); return; }
    if (type === "event" && !budget && !eventName.trim()) { toast.error("Enter an event name"); return; }
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
    } catch (error) { toast.error(formatApiError(error.response?.data?.detail) || "Could not save budget"); }
    finally { setSaving(false); }
  };
  return <form onSubmit={submit} className="space-y-4">
    {!budget && <div className="flex rounded-xl bg-secondary/60 p-1 text-xs font-medium">
      <button type="button" onClick={()=>setType("everyday")} className={`flex-1 rounded-lg p-2 ${type==="everyday"?"bg-card text-foreground shadow-sm":"text-muted-foreground"}`}>Monthly</button>
      <button type="button" onClick={()=>setType("event")} className={`flex-1 rounded-lg p-2 ${type==="event"?"bg-card text-foreground shadow-sm":"text-muted-foreground"}`}>Event</button>
    </div>}
    {type==="event" && !budget && <div><label className="mb-1.5 block text-xs font-medium">Event name</label><input required value={eventName} onChange={e=>setEventName(e.target.value)} placeholder="e.g. Pesach" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"/></div>}
    {type==="event" && <div><label className="mb-1.5 block text-xs font-medium">Event date</label><input type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"/></div>}
    <div><label className="mb-1.5 block text-xs font-medium">Category</label>
      <CategoryCombobox value={categoryName} onChange={setCategoryName} categories={categories} placeholder="Choose a category"/>
    </div>
    <div><label className="mb-1.5 block text-xs font-medium">Budget limit (£)</label>
      <input type="number" min="0" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm" placeholder="0.00"/>
    </div>
    <Button type="submit" variant="primary" disabled={saving} className="w-full">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{budget ? "Save changes" : "Create budget"}</Button>
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

export function AccountActionPreview({ accountId, account: initialAccount, onAddTransaction }) {
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

export function SearchTransactionsAction({ onInspect }) {
  const [term,setTerm]=useState("");
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{if(!term.trim()){setRows([]);return}let alive=true;const t=setTimeout(async()=>{setLoading(true);try{const {data}=await api.get("/transactions",{params:{search:term,limit:30}});if(alive)setRows(data.transactions||[])}catch{if(alive)toast.error("Search failed")}finally{if(alive)setLoading(false)}},300);return()=>{alive=false;clearTimeout(t)}},[term]);
  return <div className="space-y-3"><label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><input autoFocus value={term} onChange={e=>setTerm(e.target.value)} placeholder="Search transactions, merchants or descriptions" className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm"/></label>
    <div className="subtle-scroll max-h-[55vh] overflow-y-auto divide-y divide-border rounded-xl border border-border">{loading?<p className="p-4 text-xs text-muted-foreground">Searching…</p>:rows.map(tx=><button key={tx.transaction_id} type="button" onClick={()=>onInspect(tx)} className="flex w-full items-center gap-3 p-3 text-left text-xs hover:bg-secondary/50"><Receipt className="h-4 w-4 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{tx.description||tx.merchant||"Transaction"}</span><span className="text-muted-foreground">{String(tx.date||"").slice(0,10)}</span></span><span className="shrink-0 font-semibold">{formatCurrency(Number(tx.amount)||0)}</span></button>)}
      {!loading&&!rows.length&&<p className="p-4 text-center text-xs text-muted-foreground">{term?"No matching transactions":"Start typing to search"}</p>}
    </div>
  </div>;
}

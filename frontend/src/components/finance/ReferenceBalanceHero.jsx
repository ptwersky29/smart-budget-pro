import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, RefreshCw, Sparkles } from "lucide-react";
import { fetchAllTransactions } from "../../lib/transactionsQuery";
import { formatCurrency } from "../../lib/format";
import { buildDailyBalanceTrend, monthPaceForecast } from "../../lib/balanceTrend";

const RANGES=[{days:30,label:"1M"},{days:90,label:"3M"},{days:180,label:"6M"},{days:365,label:"1Y"}];
const dateKey=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");

function AnimatedMoney({value}) {
 const [current,setCurrent]=useState(Number(value)||0);
 useEffect(()=>{
   const target=Number(value)||0;
   if(typeof window==="undefined"||window.matchMedia("(prefers-reduced-motion: reduce)").matches) {setCurrent(target);return;}
   const start=performance.now();
   let frame=0;
   const loop=time=>{
     const progress=Math.min(1,(time-start)/750);
     const eased=1-Math.pow(1-progress,3);
     setCurrent(target*eased);
     if(progress<1)frame=requestAnimationFrame(loop);
   };
   frame=requestAnimationFrame(loop);
   return ()=>cancelAnimationFrame(frame);
 },[value]);
 return <span className="money-tabular">{formatCurrency(current)}</span>;
}

export default function ReferenceBalanceHero({
  balance,accounts=[],income=0,spend=0,budgets=[],onRefresh,onAssistant,refreshing=false,
}) {
 const [days,setDays]=useState(90),[rows,setRows]=useState([]),[loading,setLoading]=useState(true),[failure,setFailure]=useState(false);
 const accountKey=accounts.map(a=>a.account_id||a.id).sort().join("|");
 useEffect(()=>{
   let alive=true;
   const now=new Date();
   const from=new Date(now.getFullYear(),now.getMonth(),now.getDate()-days+1);
   setLoading(true);setFailure(false);
   fetchAllTransactions({date_from:dateKey(from),date_to:dateKey(now),order:"desc"})
     .then(list=>{if(alive)setRows(list);})
     .catch(()=>{if(alive){setRows([]);setFailure(true);}})
     .finally(()=>{if(alive)setLoading(false);});
   return ()=>{alive=false;};
 },[days,accountKey]);
 const history=useMemo(()=>buildDailyBalanceTrend(rows,balance,days,new Date(),accounts.map(a=>a.account_id||a.id)),[rows,balance,days,accounts]);
 const change=history.length>1?balance-history[0].balance:0;
 const pct=history[0]?.balance?change/Math.abs(history[0].balance)*100:0;
 const pace=monthPaceForecast(spend);
 const totalBudget=budgets.reduce((n,b)=>n+(Number(b.limit??b.amount)||0),0);
 const used=budgets.reduce((n,b)=>n+(Number(b.spent)||0),0);
 const dailySafe=totalBudget>0?Math.max(0,totalBudget-used)/Math.max(1,pace.daysLeft):null;
 const month=new Intl.DateTimeFormat("en-GB",{month:"long",year:"numeric"}).format(new Date());
 const activeData=!loading&&!failure&&rows.length>0;
 return (
  <section className="penni-hero-grid grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(290px,0.85fr)]" aria-label="Balance and monthly activity">
   <div className="penni-reference-balance-card surface relative min-w-0 overflow-hidden p-6 md:p-7">
    <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-70 blur-3xl" style={{background:"var(--penni-glow)"}} />
    <div className="relative flex flex-wrap items-start justify-between gap-4">
     <div className="min-w-0">
      <p className="text-[13px] font-medium text-muted-foreground">{new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric"}).format(new Date())}</p>
      <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">Total balance</p>
      <h2 className="penni-hero-balance mt-1 font-semibold leading-none tracking-[-0.055em]">
       <AnimatedMoney value={balance}/>
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
       {activeData && <span className={`rounded-full px-2 py-1 font-semibold ${change>=0?"bg-emerald/10 text-emerald":"bg-ruby/10 text-ruby"}`}>
         {change>=0?"+":""}{pct.toFixed(1)}%
       </span>}
       {activeData && <span className="money-tabular font-semibold text-foreground">{formatCurrency(change,{signed:true})}</span>}
       <span>{activeData ? "estimated movement" : "Across your linked accounts"}</span>
      </div>
     </div>
     <div className="penni-ref-segment inline-flex items-center gap-1 rounded-2xl border border-border bg-secondary/50 p-1" role="group" aria-label="Balance chart range">
       {RANGES.map(({days:range,label})=><button key={range} type="button" aria-pressed={days===range}
        onClick={()=>setDays(range)} className={`h-9 min-w-11 rounded-xl px-2.5 text-xs transition-all ${days===range?"bg-card font-semibold text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
     </div>
    </div>
    <div className="penni-balance-chart relative mt-5 h-[225px]" aria-label="Estimated balance history chart">
      {activeData ? <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={history} margin={{top:12,right:9,left:3,bottom:0}}>
         <defs><linearGradient id="penniBalanceGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5b5cf0" stopOpacity={0.19}/>
          <stop offset="100%" stopColor="#5b5cf0" stopOpacity={0}/>
         </linearGradient></defs>
         <CartesianGrid vertical={false} stroke="var(--penni-line)" strokeDasharray="3 5" />
         <YAxis dataKey="balance" axisLine={false} tickLine={false} width={66} tick={{ fontSize: 10, fill: "var(--penni-faint)" }} tickFormatter={value => formatCurrency(value, { compact: true })} />
         <XAxis dataKey="date" minTickGap={50} axisLine={false} tickLine={false} tick={{fontSize:10,fill:"var(--penni-faint)"}}
          tickFormatter={value=>{const d=new Date(value+"T12:00:00");return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});}}/>
         <Tooltip formatter={v=>[formatCurrency(v),"Est. balance"]}
          labelFormatter={v=>new Date(v+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
          contentStyle={{borderRadius:16,border:"1px solid var(--penni-line)",background:"var(--penni-surface)",color:"var(--penni-ink)",boxShadow:"var(--penni-shadow)"}}/>
         <Area type="monotone" dataKey="balance" stroke="var(--penni-accent)" strokeWidth={2.5}
          fill="url(#penniBalanceGradient)" activeDot={{r:5,strokeWidth:3,stroke:"var(--penni-surface)"}} dot={false}
          isAnimationActive animationDuration={1100}/>
        </AreaChart>
       </ResponsiveContainer>:
       <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-center">
        {loading?<><span className="penni-skeleton h-16 w-[85%] rounded-xl"/><span className="text-xs text-muted-foreground">Loading recorded balance trend…</span></>:
        <><p className="text-sm font-medium text-muted-foreground">{failure?"Balance trend unavailable":"No transactions in this period"}</p><p className="text-xs text-muted-foreground">Your current balance is shown above.</p></>}
       </div>}
    </div>
    {activeData && (
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">View balance history as a table</summary>
        <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs"><thead><tr><th scope="col" className="px-3 py-2 text-left">Date</th><th scope="col" className="px-3 py-2 text-right">Estimated balance</th></tr></thead>
            <tbody>{history.map((point) => <tr key={point.date} className="border-t border-border/50">
              <td className="px-3 py-1.5">{point.date}</td>
              <td className="money-tabular px-3 py-1.5 text-right">{formatCurrency(point.balance)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    )}
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <p className="text-[10px] text-muted-foreground">{activeData?"Estimates based on recorded transactions and current balances":"Balance chart uses your recorded transactions"}</p>
      <div className="flex items-center gap-2">
       <button onClick={onRefresh} aria-label="Refresh dashboard" title="Refresh" className="penni-icon-button grid h-8 w-8 place-items-center"><RefreshCw className={`h-4 w-4 ${refreshing?"animate-spin":""}`}/></button>
       <button onClick={onAssistant} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles className="h-4 w-4"/> Ask Penni</button>
      </div>
    </div>
   </div>
   <div className="penni-month-summary surface flex min-w-0 flex-col self-start p-6">
    <h2 className="text-[19px] font-semibold tracking-[-.03em]">{month}</h2>
    <p className="mt-1 text-[12px] text-muted-foreground">{pace.daysLeft} days left this month</p>
    <div className="mt-7 flex justify-between gap-4">
      <div><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ArrowUpRight className="h-3.5 w-3.5 text-ruby"/> Spent</p>
      <p className="money-tabular mt-2 text-[25px] font-semibold tracking-[-.035em]">{formatCurrency(spend)}</p></div>
      <div className="text-right"><p className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground"><ArrowDownLeft className="h-3.5 w-3.5 text-emerald"/> Earned</p>
      <p className="money-tabular mt-2 text-[25px] font-semibold tracking-[-.035em]">{formatCurrency(income)}</p></div>
    </div>
    <div className="relative mt-5 h-2.5 overflow-visible rounded-full bg-secondary">
      <div className="h-full rounded-full bg-gradient-to-r from-[#5b5cf0] to-[#a5a7ff]" style={{width:`${Math.min(100,pace.projected?spend/pace.projected*100:0)}%`}}/>
      <span className="absolute top-[-2px] h-3.5 w-[2px] rounded-full bg-foreground/50" style={{left:`${pace.day/pace.monthDays*100}%`}}/>
    </div>
    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Marker shows how far through the month you are.</p>
    <div className="mt-5 rounded-2xl bg-secondary/55 p-4">
     <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Month-end forecast</p>
     <p className="money-tabular mt-1 text-[24px] font-semibold">{formatCurrency(pace.projected)}</p>
     <p className="mt-1 text-[11px] text-muted-foreground">Simple estimate based on this month's spending pace.</p>
    </div>
    <Link to="/budgets" className="penni-safe-card mt-5 flex items-center justify-between rounded-2xl p-4 text-white">
      <div><p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Safe to spend today</p>
      <p className="money-tabular mt-1 text-[24px] font-semibold">{dailySafe===null?"Set budgets":formatCurrency(dailySafe)}</p></div>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition-transform group-hover:translate-x-1"><ArrowRight className="h-4 w-4"/></span>
    </Link>
   </div>
  </section>
 );
}

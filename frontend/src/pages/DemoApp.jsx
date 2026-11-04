import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, BookOpen,
  CheckCircle2, CreditCard, Eye, Landmark, LayoutDashboard, LockKeyhole,
  Plus, Receipt, Search, ShieldCheck, TrendingUp, Wallet,
} from "lucide-react";
import Logo from "../components/Logo";
import "./DemoApp.css";

// Public demo values are synthetic, immutable and NOT sourced from the offline
// cache, browser storage, private account data, or the Penni API.
const ACCOUNTS = Object.freeze([
  {id:"demo-current",name:"Everyday account",type:"Current account",balance:5840.32,icon:Wallet},
  {id:"demo-savings",name:"Savings account",type:"Savings",balance:10875.80,icon:Landmark},
  {id:"demo-card",name:"Everyday card",type:"Card balance",balance:-385.62,icon:CreditCard},
]);
const TRANSACTIONS = Object.freeze([
  {id:"demo-t1",name:"Monthly salary",category:"Income",account:"Everyday account",date:"2026-11-03",amount:3800.00,icon:ArrowDownLeft},
  {id:"demo-t2",name:"Food shopping",category:"Groceries",account:"Everyday account",date:"2026-11-02",amount:-68.40,icon:Wallet},
  {id:"demo-t3",name:"Household bills",category:"Bills",account:"Everyday account",date:"2026-11-01",amount:-112.80,icon:Landmark},
  {id:"demo-t4",name:"Transport",category:"Travel",account:"Everyday card",date:"2026-10-31",amount:-14.90,icon:CreditCard},
  {id:"demo-t5",name:"Charitable giving",category:"Tzedakah",account:"Everyday account",date:"2026-10-30",amount:-75.00,icon:BookOpen},
  {id:"demo-t6",name:"Monthly subscription",category:"Subscriptions",account:"Everyday card",date:"2026-10-29",amount:-12.99,icon:Receipt},
  {id:"demo-t7",name:"Coffee shop",category:"Dining",account:"Everyday card",date:"2026-10-28",amount:-5.50,icon:CreditCard},
  {id:"demo-t8",name:"Savings transfer",category:"Transfers",account:"Savings account",date:"2026-10-27",amount:250.00,icon:ArrowDownLeft},
]);
const BUDGETS = Object.freeze([
  {category:"Groceries",limit:400,spent:242},
  {category:"Bills",limit:350,spent:187},
  {category:"Travel",limit:160,spent:69},
  {category:"Dining",limit:150,spent:86},
  {category:"Giving",limit:200,spent:75},
]);
const PERIODS = {
  "1M":[154,149,158,142,132,140,124,131,116,105,109,98,103,90,96,81,73,77,67,58,63,45,49,39],
  "3M":[183,176,181,166,153,161,144,135,139,120,124,108,114,99,89,95,77,80,63,69,50,52,37,30],
  "1Y":[200,190,192,180,177,159,163,151,139,147,129,121,128,109,100,106,85,90,73,65,71,49,52,30],
};
const VIEWS=[
  {key:"dashboard",label:"Dashboard",icon:LayoutDashboard},
  {key:"accounts",label:"Accounts",icon:Wallet},
  {key:"transactions",label:"Transactions",icon:Receipt},
  {key:"budgets",label:"Budgets",icon:BarChart3},
  {key:"reports",label:"Reports",icon:TrendingUp},
];
const money=(amount)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(amount);
const totalBalance=ACCOUNTS.reduce((sum,a)=>sum+a.balance,0);

function ReadOnlyNotice() {
  return <div className="penni-demo-explain" role="status" data-testid="demo-read-only-banner">
    <div><span className="penni-demo-icon"><LockKeyhole size={19}/></span>
      <div><strong>You're exploring a read-only demo</strong>
        <p>All figures are fictional examples. You can explore and filter, but nothing can be added, changed, saved or deleted.</p></div>
    </div>
    <Link to="/register">Create your account <ArrowRight size={13} style={{display:"inline-block",verticalAlign:"middle"}}/></Link>
  </div>;
}
function Metric({label,value,note,icon:Icon}) {
  return <article className="penni-demo-card">
    <div className="penni-demo-stat-label"><span>{label}</span><Icon size={18}/></div>
    <p className="penni-demo-stat-value" title={value}>{value}</p>
    <p className="penni-demo-stat-note">{note}</p>
  </article>;
}
function Trend({period,onChange}) {
  const pts=PERIODS[period];
  const path=pts.map((y,i)=>`${i===0?"M":"L"}${20+i*19.5} ${y}`).join(" ");
  return <article className="penni-demo-card">
    <div className="penni-demo-heading"><div><h2>Balance overview</h2><small>Illustrative account history</small></div>
      <div role="group" aria-label="Sample history period" style={{display:"flex",gap:5}}>
        {Object.keys(PERIODS).map(p=><button type="button" key={p} aria-pressed={period===p} onClick={()=>onChange(p)}
          style={{border:0,borderRadius:8,padding:"7px 10px",background:period===p?"#eeeaff":"transparent",color:period===p?"#584bdc":"#8588a0",fontSize:11,fontWeight:750}}>{p}</button>)}
      </div>
    </div>
    <svg viewBox="0 0 490 215" role="img" aria-label={`Sample balance trend over ${period}`} preserveAspectRatio="none" className="penni-demo-chart">
      <defs><linearGradient id="penni-demo-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7568f2" stopOpacity=".3"/><stop offset="1" stopColor="#7568f2" stopOpacity="0"/></linearGradient></defs>
      {[48,104,160,210].map(y=><line key={y} x1="20" x2="470" y1={y} y2={y} stroke="#e8e8f3" strokeDasharray="4 6"/>)}
      <path d={path+" L468.5 215 L20 215 Z"} fill="url(#penni-demo-chart-fill)"/>
      <path d={path} fill="none" stroke="#6355e8" strokeWidth="3.7" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
      <circle cx="468.5" cy={pts[23]} r="5" fill="#6355e8" stroke="#fff" strokeWidth="2.5"/>
    </svg>
    <div className="penni-demo-chart-labels"><span>Start</span><span>Mid period</span><span>Today</span></div>
  </article>;
}
function Recent({limit=4}) {
  return <article className="penni-demo-card">
    <div className="penni-demo-heading"><div><h2>Recent transactions</h2><small>Illustrative activity</small></div><Link to="/demo/transactions" style={{fontSize:11,fontWeight:750,color:"#6458e6"}}>See all</Link></div>
    <div className="penni-demo-mini-list">
      {TRANSACTIONS.slice(0,limit).map(t=><div className="penni-demo-mini-row" key={t.id}>
        <div><span className="penni-demo-icon"><t.icon size={17}/></span><span><strong>{t.name}</strong><small>{t.category}</small></span></div>
        <strong className={t.amount>0?"penni-demo-positive":""}>{money(t.amount)}</strong>
      </div>)}
    </div>
  </article>;
}
function BudgetBars({long=false}) {
  return <article className="penni-demo-card">
    <div className="penni-demo-heading"><div><h2>Budget progress</h2><small>November 2026 · Illustrative limits</small></div></div>
    <div className="penni-demo-budget">
      {BUDGETS.slice(0,long?BUDGETS.length:4).map(b=><div className="penni-demo-budget-item" key={b.category}>
        <div className="penni-demo-budget-head"><strong>{b.category}</strong><span>{money(b.spent)} of {money(b.limit)}</span></div>
        <div className="penni-demo-bar-track"><div className="penni-demo-bar-fill" style={{width:`${Math.min(100,b.spent/b.limit*100)}%`}}/></div>
      </div>)}
    </div>
  </article>;
}
function Dashboard({period,setPeriod}) {
  return <>
    <div className="penni-demo-grid">
      <Metric label="Total balance" value={money(totalBalance)} note="Across three sample accounts" icon={Wallet}/>
      <Metric label="Monthly income" value={money(3800)} note="Sample November income" icon={ArrowDownLeft}/>
      <Metric label="Monthly spending" value={money(710.59)} note="Sample monthly expenses" icon={ArrowUpRight}/>
      <Metric label="Available to budget" value={money(3089.41)} note="Illustrative only" icon={CheckCircle2}/>
    </div>
    <div className="penni-demo-two"><Trend period={period} onChange={setPeriod}/><Recent/></div>
    <div style={{marginTop:18}}><BudgetBars/></div>
  </>;
}
function Accounts() {
  return <>
    <div className="penni-demo-account-grid">{ACCOUNTS.map(account=><article className="penni-demo-account" key={account.id}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><account.icon size={22}/><span style={{fontSize:10,opacity:.75}}>SAMPLE</span></div>
      <div><small>{account.type}</small><h2 style={{marginTop:5,marginBottom:12}}>{account.name}</h2><strong>{money(account.balance)}</strong></div>
    </article>)}</div>
    <div className="penni-demo-two"><Recent limit={6}/><article className="penni-demo-card">
      <div className="penni-demo-heading"><h2>Your demo accounts</h2></div>
      <p className="penni-demo-note">These are imaginary accounts, created only for this public demonstration. No real bank is connected and no saved accounts can be edited from here.</p>
      <div style={{marginTop:20}}><Link to="/register" className="penni-demo-button penni-demo-button-primary">Start with your own accounts <ArrowRight size={16}/></Link></div>
    </article></div>
  </>;
}
function Transactions() {
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState("all");
  const categories=["all",...new Set(TRANSACTIONS.map(x=>x.category))];
  const shown=useMemo(()=>TRANSACTIONS.filter(t=>(category==="all"||t.category===category)&&
    `${t.name} ${t.category} ${t.account}`.toLowerCase().includes(search.toLowerCase())),[search,category]);
  return <article className="penni-demo-card">
    <div className="penni-demo-heading"><div><h2>Transaction history</h2><small>Search and filter the sample ledger</small></div><span className="penni-demo-chip"><Eye size={14}/> View only</span></div>
    <div className="penni-demo-filterbar"><Search size={17} color="#8588a0"/>
      <input type="search" aria-label="Search demo transactions" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search transactions"/>
      <select aria-label="Filter demo category" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option value={c} key={c}>{c==="all"?"All categories":c}</option>)}</select>
    </div>
    <div className="penni-demo-table-wrap"><table className="penni-demo-table"><thead><tr><th>Transaction</th><th>Category</th><th>Date</th><th>Account</th><th>Amount</th></tr></thead><tbody>
      {shown.map(t=><tr key={t.id}><td style={{fontWeight:700}}>{t.name}</td><td>{t.category}</td><td>{new Date(t.date+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</td><td>{t.account}</td><td style={{fontWeight:740,color:t.amount>0?"#129675":"inherit"}}>{money(t.amount)}</td></tr>)}
    </tbody></table>{shown.length===0&&<p className="penni-demo-empty">No sample transactions match those filters.</p>}</div>
    <p className="penni-demo-footnote">You can search and filter. Editing, deleting, approving and importing transactions are disabled in public demo mode.</p>
  </article>;
}
function Budgets() {
  const total=BUDGETS.reduce((sum,b)=>sum+b.limit,0);
  const spent=BUDGETS.reduce((sum,b)=>sum+b.spent,0);
  return <>
    <div className="penni-demo-grid">
      <Metric label="Monthly budget" value={money(total)} note="Sample spending plan" icon={Wallet}/>
      <Metric label="Budget used" value={money(spent)} note={`${Math.round(spent/total*100)}% of limit`} icon={BarChart3}/>
      <Metric label="Budget remaining" value={money(total-spent)} note="Illustrative remaining" icon={CheckCircle2}/>
      <Metric label="Budget categories" value={String(BUDGETS.length)} note="Sample categories" icon={Receipt}/>
    </div>
    <div className="penni-demo-two"><BudgetBars long/><article className="penni-demo-card"><div className="penni-demo-heading"><h2>Plan your money</h2></div>
    <p className="penni-demo-note">Explore budget progress safely using fixed example figures. In your own Penni account you can create your own categories and spending limits.</p>
    <div style={{marginTop:20}}><Link className="penni-demo-button penni-demo-button-primary" to="/register">Create a free account <ArrowRight size={16}/></Link></div></article></div>
  </>;
}
function Reports({period,setPeriod}) {
  const spent=BUDGETS.reduce((sum,b)=>sum+b.spent,0);
  return <>
    <div className="penni-demo-grid">
      <Metric label="Sample income" value={money(3800)} note="November 2026" icon={ArrowDownLeft}/>
      <Metric label="Categorised spending" value={money(spent)} note="Across five categories" icon={ArrowUpRight}/>
      <Metric label="Illustrative net" value={money(3800-spent)} note="Income less category spend" icon={TrendingUp}/>
      <Metric label="Sample accounts" value="3" note="Not linked to real banks" icon={Landmark}/>
    </div>
    <div className="penni-demo-two"><Trend period={period} onChange={setPeriod}/>
      <article className="penni-demo-card"><div className="penni-demo-heading"><h2>Spending by category</h2></div><div className="penni-demo-bar-list">
        {BUDGETS.map(b=><div className="penni-demo-bar-row" key={b.category}><strong>{b.category}</strong><div className="penni-demo-bar-track"><div className="penni-demo-bar-fill" style={{width:`${b.spent/spent*100*2.5}%`}}/></div><span>{money(b.spent)}</span></div>)}
      </div></article>
    </div>
  </>;
}
export default function DemoApp() {
  const location=useLocation();
  const requested=location.pathname.split("/")[2]||"dashboard";
  const active=VIEWS.some(v=>v.key===requested)?requested:"dashboard";
  const view=VIEWS.find(v=>v.key===active);
  const [period,setPeriod]=useState("3M");
  return <div className="penni-demo" data-demo-mode="read-only" data-testid="public-demo">
    <div className="penni-demo-layout">
      <aside className="penni-demo-sidebar" aria-label="Demo navigation">
        <Link to="/" className="penni-demo-logo"><Logo size="sm"/> Penni</Link>
        <div className="penni-demo-sidebar-note"><span className="penni-demo-chip"><LockKeyhole size={13}/> Public demo</span><p>Explore freely with sample data.<br/>Nothing can be saved or deleted.</p></div>
        <p className="penni-demo-section-label">EXPLORE THE APP</p>
        <nav className="penni-demo-nav" aria-label="Demo sections">{VIEWS.map(({key,label,icon:Icon})=>
          <Link key={key} to={`/demo/${key}`} aria-current={active===key?"page":undefined}><Icon size={19}/>{label}</Link>)}</nav>
        <div className="penni-demo-sidebar-footer"><Link to="/register"><Plus size={16}/> Create free account</Link><Link to="/"><ArrowLeft size={16}/> Back to website</Link></div>
      </aside>
      <div className="penni-demo-content">
        <header className="penni-demo-header"><div><h1>{view.label}</h1><p>Penni demo workspace · Sample data</p></div>
          <div className="penni-demo-actions">
            <button className="penni-demo-button" type="button" disabled title="Read-only demo: changes are disabled" aria-label="Add transaction disabled in demo"><Plus size={15}/> <span className="hidden sm:inline">Add transaction</span></button>
            <Link to="/register" className="penni-demo-button penni-demo-button-primary">Get Penni <ArrowRight size={15}/></Link>
          </div>
        </header>
        <main className="penni-demo-main"><ReadOnlyNotice/>
          {active==="dashboard"&&<Dashboard period={period} setPeriod={setPeriod}/>}
          {active==="accounts"&&<Accounts/>}
          {active==="transactions"&&<Transactions/>}
          {active==="budgets"&&<Budgets/>}
          {active==="reports"&&<Reports period={period} setPeriod={setPeriod}/>}
          <p className="penni-demo-footnote"><ShieldCheck size={14} style={{display:"inline-block",verticalAlign:"middle"}}/> This demonstration uses preloaded fictional examples. No API account access, real financial information, uploads or data modification.</p>
        </main>
      </div>
      <nav className="penni-demo-mobile-nav" aria-label="Demo mobile navigation">{VIEWS.map(({key,label,icon:Icon})=><Link key={key} to={`/demo/${key}`} aria-current={active===key?"page":undefined} style={active===key?{color:"#5c50e8",background:"#f0efff"}:undefined}><Icon/>{label}</Link>)}</nav>
    </div>
  </div>;
}

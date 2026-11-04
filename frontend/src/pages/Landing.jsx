import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowDownLeft, ArrowUpRight, BarChart3, BookOpen, Check, CheckCircle2, ChevronDown, CreditCard, FileText, Landmark, Menu, MoonStar, ShieldCheck, Sparkles, Sun, TrendingUp, Wallet, X } from "lucide-react";
import { useTheme } from "next-themes";
import Logo from "../components/Logo";
import "./Landing.css";

const features = [
  { icon: Wallet, title: "Everything in one place", description: "Bring accounts, balances, and everyday transactions together in a workspace that actually feels organised.", tags: ["Accounts", "Transactions"] },
  { icon: Sparkles, title: "Insights that make sense", description: "Explore spending patterns, ask questions, and get AI-assisted guidance when you need a clearer perspective.", tags: ["AI", "Analytics"] },
  { icon: BarChart3, title: "Plan what comes next", description: "Build budgets, understand recurring costs, and explore illustrative financial scenarios with confidence.", tags: ["Budgets", "Forecasts"] },
];
const tools = [
  { icon: CreditCard, title: "Transactions", description: "Filter, categorise, and keep every entry clear." },
  { icon: Landmark, title: "Bank connections", description: "Connect supported UK banks when you're ready." },
  { icon: FileText, title: "Statement imports", description: "Import and review account activity." },
  { icon: TrendingUp, title: "Investments", description: "Explore long-term financial scenarios." },
  { icon: BookOpen, title: "Maaser & tzedakah", description: "Keep giving in your financial picture." },
  { icon: CheckCircle2, title: "Subscriptions", description: "See your recurring commitments together." },
];
const periods = {
  "1M": { gain: "+£1,240.80", percent: "+11.0%", points: [150,145,155,132,140,124,132,105,117,100,91,95,81,87,68,61,72,51,58,44,48,32,41,27], labels: ["1 Nov","10 Nov","20 Nov","Today"] },
  "3M": { gain: "+£2,130.35", percent: "+20.6%", points: [173,163,166,148,155,137,142,123,130,111,116,100,105,87,91,72,79,61,66,53,58,41,46,27], labels: ["Sep","Oct","Nov","Today"] },
  "1Y": { gain: "+£4,820.10", percent: "+62.9%", points: [188,181,184,161,169,155,146,153,130,125,136,112,118,96,103,81,87,64,74,53,59,42,47,27], labels: ["Jan","Apr","Aug","Today"] },
};
const faq = [
  { q: "Is Penni free?", a: "Yes. Penni currently offers its features free of charge. Optional third-party connections may depend on provider availability." },
  { q: "Do I have to connect my bank?", a: "No. You can use manual transactions, budgets and other planning tools without connecting a bank." },
  { q: "Can I connect UK banks?", a: "Penni offers optional UK bank connections. Availability varies by institution and the connected provider." },
  { q: "Are investment projections guaranteed?", a: "No. They are illustrative scenarios based on assumptions, not guaranteed returns or financial advice." },
];

function Reveal({ children, className = "", delay = 0, as: Tag = "div" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.classList.add("pl-visible"); return; }
    const ob = new IntersectionObserver(entries => {
      for (const item of entries) if (item.isIntersecting) { el.classList.add("pl-visible"); ob.unobserve(el); }
    }, { threshold: 0.08, rootMargin: "0px 0px 50px 0px" });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  return <Tag ref={ref} className={`pl-reveal ${className}`} style={{ "--pl-delay": `${delay}ms` }}>{children}</Tag>;
}
function PrimaryLink({ to = "/register", children, testId, className = "" }) {
  return <Link to={to} data-testid={testId} className={`pl-button pl-button-primary ${className}`}>{children}</Link>;
}
function Preview() {
  const [range, setRange] = useState("3M");
  const data = periods[range];
  const line = data.points.map((v, i) => `${i === 0 ? "M" : "L"}${20 + i * 19.5} ${v}`).join(" ");
  return (
    <div className="pl-product-wrap">
      <div className="pl-product-surface">
        <aside className="pl-product-rail" aria-hidden="true">
          <Logo size="sm"/>
          <span className="pl-rail-active"><Wallet size={18}/></span>
          <span><CreditCard size={18}/></span><span><BarChart3 size={18}/></span><span><Landmark size={18}/></span>
          <span className="pl-rail-last"><Sparkles size={18}/></span>
        </aside>
        <div className="pl-product-main">
          <div className="pl-product-bar"><div><small>YOUR WORKSPACE</small><strong>Financial overview</strong></div><span className="pl-product-avatar">P</span></div>
          <div className="pl-product-balance">
            <div className="pl-product-balance-head"><span>Combined balance</span><span className="pl-product-live"><span/> Overview</span></div>
            <strong className="pl-product-amount">£12,480.50</strong>
            <span className="pl-product-growth"><ArrowUpRight size={14}/>{data.gain} ({data.percent}) over {range}</span>
            <div className="pl-product-range" role="group" aria-label="Sample dashboard chart period">
              {Object.keys(periods).map(p => <button key={p} type="button" aria-pressed={range === p} className={range === p ? "pl-range-selected" : ""} onClick={() => setRange(p)}>{p}</button>)}
            </div>
            <svg viewBox="0 0 490 216" className="pl-product-chart" preserveAspectRatio="none" role="img" aria-label={`Illustrative balance history over ${range}`}>
              <defs><linearGradient id="pl-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7468f3" stopOpacity=".3"/><stop offset="100%" stopColor="#7468f3" stopOpacity="0"/></linearGradient></defs>
              {[55,112,169,207].map(y=><line key={y} x1="20" x2="475" y1={y} y2={y} stroke="#e6e8f1" strokeDasharray="4 7"/>)}
              <path d={line+" L468.5 216 L20 216 Z"} fill="url(#pl-chart-fill)"/>
              <path d={line} fill="none" stroke="#6255ec" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
              <circle cx="468.5" cy={data.points[23]} r="5" fill="#6255ec" stroke="white" strokeWidth="3"/>
            </svg>
            <div className="pl-product-labels">{data.labels.map(l=><span key={l}>{l}</span>)}</div>
          </div>
          <div className="pl-product-metrics">
            <div><span className="pl-sample-income"><ArrowDownLeft size={18}/></span><span><small>Income</small><strong>£4,250</strong></span><em>+8.2%</em></div>
            <div><span className="pl-sample-expense"><ArrowUpRight size={18}/></span><span><small>Spending</small><strong>£1,860</strong></span></div>
          </div>
        </div>
      </div>
      <div className="pl-float pl-float-one" aria-hidden="true"><Sparkles size={19}/><span><strong>Clearer insights</strong><small>Understand your spending</small></span></div>
      <div className="pl-float pl-float-two" aria-hidden="true"><CheckCircle2 size={19}/><span><strong>Stay on track</strong><small>Budget with confidence</small></span></div>
      <span className="pl-product-note">Illustrative preview · Sample data</span>
    </div>
  );
}
function Ledger() {
  const rows = [
    { icon: ArrowDownLeft, name: "Salary", category: "Income", amount: "+£3,800.00", positive: true },
    { icon: Wallet, name: "Groceries", category: "Everyday spending", amount: "−£58.40" },
    { icon: BookOpen, name: "Tzedakah", category: "Giving", amount: "−£36.00" },
    { icon: CreditCard, name: "Subscriptions", category: "Recurring", amount: "−£14.99" },
  ];
  return <div className="pl-ledger">
    <div className="pl-ledger-header"><span>YOUR MONEY, ORGANISED</span><h3>Recent activity</h3></div>
    {rows.map(({icon:Icon,...r})=><div className="pl-ledger-row" key={r.name}>
      <span className="pl-ledger-icon"><Icon size={20}/></span><span className="pl-ledger-label"><strong>{r.name}</strong><small>{r.category}</small></span>
      <strong className={r.positive ? "pl-ledger-positive" : ""}>{r.amount}</strong>
    </div>)}
    <div className="pl-ledger-foot"><span><ShieldCheck size={16}/> One clear financial picture</span><small>Sample data</small></div>
  </div>;
}

export default function Landing() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const { theme, setTheme } = useTheme();
  useEffect(() => { document.title = "Penni — Make sense of your money"; return () => { document.title = "Penni"; }; }, []);
  useEffect(() => { if (!mobileOpen) return; const key=e=>{if(e.key==="Escape")setMobileOpen(false)}; document.addEventListener("keydown",key); return ()=>document.removeEventListener("keydown",key); }, [mobileOpen]);
  const links=[["Features","#features"],["How it works","#how-it-works"],["Jewish tools","#jewish"],["Pricing","#pricing"]];
  return <div className="penni-landing" id="top">
    <div className="pl-announcement"><span><i/> A calmer way to manage your money</span><a href="#features">Explore Penni <ArrowRight size={14}/></a></div>
    <header className="pl-header"><div className="pl-container pl-nav">
      <Link className="pl-brand" to="/" data-testid="landing-logo" aria-label="Penni home"><Logo size="md"/><strong>Penni</strong></Link>
      <nav className="pl-nav-links" aria-label="Main navigation">{links.map(([label,href])=><a key={href} href={href}>{label}</a>)}</nav>
      <div className="pl-nav-actions">
        <button type="button" className="pl-theme-toggle" aria-label="Toggle colour theme" onClick={()=>setTheme(theme==="dark"?"light":"dark")}>{theme==="dark"?<Sun size={18}/>:<MoonStar size={18}/>}</button>
        <Link className="pl-signin" to="/login">Sign in</Link>
        <PrimaryLink className="pl-nav-cta" testId="nav-register">Get started <ArrowRight size={16}/></PrimaryLink>
        <button type="button" className="pl-nav-menu" aria-label={mobileOpen?"Close menu":"Open menu"} aria-controls="pl-mobile-links" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(v=>!v)}>{mobileOpen?<X size={22}/>:<Menu size={22}/>}</button>
      </div>
    </div>
    {mobileOpen&&<nav className="pl-mobile-links" id="pl-mobile-links" aria-label="Mobile navigation">{links.map(([label,href])=><a key={href} href={href} onClick={()=>setMobileOpen(false)}>{label}<ArrowRight size={16}/></a>)}<Link to="/login" onClick={()=>setMobileOpen(false)}>Sign in <ArrowRight size={16}/></Link><Link to="/register" onClick={()=>setMobileOpen(false)}>Create a free account <ArrowRight size={16}/></Link></nav>}
    </header>
    <main>
      <section className="pl-hero"><div className="pl-hero-orb" aria-hidden="true"/><div className="pl-container pl-hero-grid">
        <Reveal className="pl-hero-copy">
          <span className="pl-eyebrow"><Sparkles size={15}/> YOUR MONEY, MADE CLEARER</span>
          <h1>Feel better about <span>every penny.</span></h1>
          <p>One beautifully simple place for your accounts, spending, budgets and plans. Everything you need to understand where your money is going—and where it could take you.</p>
          <div className="pl-hero-buttons"><PrimaryLink testId="hero-cta-start">Start with Penni <ArrowRight size={18}/></PrimaryLink><a className="pl-button pl-button-secondary" href="#how-it-works">See how it works <ArrowRight size={17}/></a></div>
          <div className="pl-hero-reassurance"><span><CheckCircle2 size={16}/> Free to get started</span><span><CheckCircle2 size={16}/> No bank connection required</span></div>
        </Reveal>
        <Reveal className="pl-hero-visual" delay={140}><Preview/></Reveal>
      </div><div className="pl-container pl-hero-foot"><span>ONE WORKSPACE. YOUR FINANCIAL LIFE.</span><div><span><Wallet size={16}/> Accounts</span><span><BarChart3 size={16}/> Budgets</span><span><Sparkles size={16}/> Insights</span><span><BookOpen size={16}/> Giving</span></div></div></section>
      <section id="features" className="pl-section pl-features"><div className="pl-container">
        <Reveal className="pl-heading pl-heading-center"><span className="pl-kicker">THE PENNI DIFFERENCE</span><h2>A clearer picture. <span>More confident decisions.</span></h2><p>Thoughtful tools brought together in a workspace that feels easy to use.</p></Reveal>
        <div className="pl-feature-grid">{features.map((f,i)=><Reveal as="article" className="pl-feature" delay={i*90} key={f.title}><div className="pl-feature-head"><span className="pl-feature-symbol"><f.icon size={24}/></span><small>0{i+1} / 03</small></div><h3>{f.title}</h3><p>{f.description}</p><div className="pl-tags">{f.tags.map(t=><span key={t}>{t}</span>)}</div></Reveal>)}</div>
      </div></section>
      <section id="how-it-works" className="pl-section pl-showcase"><div className="pl-container pl-showcase-grid">
        <Reveal className="pl-showcase-copy"><span className="pl-kicker">YOUR MONEY, ORGANISED</span><h2>Less chasing numbers. <span>More seeing the whole picture.</span></h2><p>Penni makes the everyday details easier to follow, so accounts, budgets and transactions feel connected.</p>
          <div className="pl-steps">{[
            ["01","Bring your money together","Start manually, or connect a supported bank when you’re ready."],
            ["02","Understand your spending","Sort transactions and see your categories and trends."],
            ["03","Make a plan that lasts","Set budgets and explore different financial scenarios."],
          ].map(([n,title,desc])=><div className="pl-step" key={n}><span>{n}</span><div><strong>{title}</strong><p>{desc}</p></div></div>)}</div>
          <a className="pl-text-link" href="#pricing">Everything you need to begin <ArrowRight size={18}/></a>
        </Reveal>
        <Reveal className="pl-ledger-wrap" delay={130}><Ledger/></Reveal>
      </div></section>
      <section className="pl-section pl-tools"><div className="pl-container"><Reveal className="pl-tools-heading"><div><span className="pl-kicker">MADE FOR REAL LIFE</span><h2>The details are taken care of.</h2></div><p>Powerful when you need it. Uncomplicated the rest of the time.</p></Reveal><div className="pl-tools-grid">{tools.map((t,i)=><Reveal as="article" key={t.title} className="pl-tool" delay={i*45}><span className="pl-tool-symbol"><t.icon size={21}/></span><div><h3>{t.title}</h3><p>{t.description}</p></div><ArrowUpRight size={18} className="pl-tool-arrow"/></Reveal>)}</div></div></section>
      <section id="jewish" className="pl-section pl-community"><div className="pl-container pl-community-grid"><Reveal className="pl-community-copy"><span className="pl-kicker">FINANCE WITH YOUR VALUES IN MIND</span><h2>Your finances. <span>Your way of life.</span></h2><p>Ordinary money apps don't always account for what matters to you. Penni brings budgeting together with Jewish financial tools—including maaser and tzedakah tracking.</p><div className="pl-checks"><span><Check size={17}/> Maaser planning</span><span><Check size={17}/> Tzedakah tracking</span><span><Check size={17}/> Jewish calendar tools</span></div><PrimaryLink>Explore Penni <ArrowRight size={17}/></PrimaryLink></Reveal><Reveal delay={120} className="pl-giving-wrap"><div className="pl-giving"><div className="pl-giving-head"><div><small>GIVING OVERVIEW</small><h3>A little more meaning in every pound.</h3></div><BookOpen size={25}/></div><div className="pl-giving-highlight"><span>Example giving total</span><strong>£286.00</strong><em><CheckCircle2 size={15}/> Neatly accounted for</em></div><div className="pl-giving-row"><span>Maaser</span><strong>Track what matters</strong></div><div className="pl-giving-row"><span>Tzedakah</span><strong>Keep giving organised</strong></div><small>Illustrative data · Not a live account</small></div></Reveal></div></section>
      <section id="pricing" className="pl-section pl-pricing"><div className="pl-container pl-pricing-grid"><Reveal><span className="pl-kicker">SIMPLE BY DESIGN</span><h2>A better money app. <span>Without the price tag.</span></h2><p>Start using Penni without a subscription. Everything on the current Penni plan is available for free.</p><Link className="pl-text-link" to="/pricing">See what's included <ArrowRight size={18}/></Link></Reveal><Reveal delay={130} className="pl-price-card"><div className="pl-price-top"><span><Sparkles size={15}/> ALL FEATURES</span><small>PENNI</small></div><div className="pl-price-number"><strong>£0</strong><span>/month</span></div><p>Everything you need to get started.</p><div className="pl-price-features">{["Accounts and transactions","Budgets and spending insights","AI-assisted finance tools","Giving and specialist features"].map(t=><span key={t}><Check size={17}/>{t}</span>)}</div><PrimaryLink testId="pricing-free">Get started for free <ArrowRight size={18}/></PrimaryLink><small>No Penni subscription required.</small></Reveal></div></section>
      <section className="pl-section pl-faq"><div className="pl-container pl-faq-grid"><Reveal><span className="pl-kicker">GOOD TO KNOW</span><h2>Questions? <span>We have answers.</span></h2><p>A few useful things to know before you begin.</p></Reveal><Reveal className="pl-faq-list" delay={90}>{faq.map((f,i)=><div className="pl-faq-item" key={f.q}><button type="button" aria-expanded={openFaq===i} aria-controls={`pl-faq-${i}`} onClick={()=>setOpenFaq(openFaq===i?-1:i)}>{f.q}<ChevronDown size={19} className={openFaq===i?"pl-chevron-open":""}/></button><div id={`pl-faq-${i}`} hidden={openFaq!==i}><p>{f.a}</p></div></div>)}</Reveal></div></section>
      <section className="pl-bottom-cta"><div className="pl-container"><Reveal className="pl-bottom-panel"><span><Sparkles size={18}/> YOUR MONEY. YOUR MOMENT.</span><h2>See your money differently.</h2><p>Everything in one beautiful place. Get started with Penni today.</p><PrimaryLink>Create your free account <ArrowRight size={18}/></PrimaryLink></Reveal></div></section>
    </main>
    <footer className="pl-footer"><div className="pl-container pl-footer-content"><div><Link className="pl-brand" to="/"><Logo size="sm"/><strong>Penni</strong></Link><p>Make sense of your money.</p></div><nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#pricing">Pricing</a><Link to="/privacy">Privacy</Link><Link to="/login">Sign in</Link></nav></div><div className="pl-container pl-footer-base"><span>© {new Date().getFullYear()} Penni. All rights reserved.</span><span>Designed for clarity.</span></div></footer>
  </div>;
}

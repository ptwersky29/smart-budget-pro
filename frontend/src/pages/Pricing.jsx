import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import Logo from "../components/Logo";
import "./Landing.css";

const includes = [
  "Accounts and manual transactions",
  "Budgets and spending analytics",
  "AI-assisted financial tools",
  "Bank connections where supported",
  "Statement imports and recurring payments",
  "Investment scenarios and forecasts",
  "Maaser, tzedakah and Jewish tools",
];

export default function Pricing() {
  useEffect(() => { document.title = "Pricing — Penni"; return () => { document.title = "Penni"; }; }, []);
  return <div className="penni-landing">
    <header className="pl-header">
      <div className="pl-container pl-nav">
        <Link to="/" className="pl-brand" aria-label="Penni home"><Logo size="md"/><strong>Penni</strong></Link>
        <div className="pl-nav-actions">
          <Link to="/" className="pl-signin" style={{display:"inline-flex",alignItems:"center",gap:8}}><ArrowLeft size={15}/> Back home</Link>
          <Link to="/demo" className="pl-button pl-button-secondary" style={{minHeight:42}}>Explore demo</Link><Link to="/login" className="pl-button pl-button-secondary" style={{minHeight:42}}>Sign in</Link>
        </div>
      </div>
    </header>
    <main className="pl-section">
      <div className="pl-container">
        <div className="pl-heading pl-heading-center">
          <span className="pl-kicker">A SIMPLER KIND OF PRICING</span>
          <h1 style={{fontSize:"clamp(38px,5vw,61px)",fontWeight:750,letterSpacing:"-.065em",lineHeight:1.15,margin:"16px 0"}}>
            Everything you need. <span style={{color:"var(--pl-accent)"}}>One free plan.</span>
          </h1>
          <p>All features in Penni's current plan are available for free. Get started in minutes.</p>
        </div>
        <div className="pl-price-card" style={{maxWidth:530,margin:"0 auto"}}>
          <div className="pl-price-top"><span><Sparkles size={15}/> ALL FEATURES INCLUDED</span><small>PENNI</small></div>
          <div className="pl-price-number"><strong>£0</strong><span>/month</span></div>
          <p>No Penni subscription required.</p>
          <div className="pl-price-features">
            {includes.map(item=><span key={item}><Check size={17}/>{item}</span>)}
          </div>
          <Link to="/register" data-testid="free-cta" className="pl-button pl-button-primary">Create a free account <ArrowRight size={17}/></Link>
          <small>Some integrations depend on third-party availability.</small>
        </div>
      </div>
    </main>
  </div>;
}

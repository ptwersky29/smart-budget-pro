import React from "react";
import { Link } from "react-router-dom";
import { Sparkles, Building2, MessagesSquare, TrendingUp, ShieldCheck, Star, Check, ArrowRight, Landmark } from "lucide-react";

const HERO_IMG = "https://static.prod-images.emergentagent.com/jobs/a8ffc4f3-0824-40c4-a74c-b4e5c8fbcb66/images/9ec1a41a2ae49b3da963b26e9d76ff276824ad745a2dc7b71aee9227d794347c.png";

const FEATURES = [
  { icon: Sparkles, title: "AI Financial Coach", desc: "Claude Sonnet 4.5 understands your spend, your goals, and your halachic priorities." },
  { icon: Building2, title: "UK Bank Sync", desc: "Connect any UK bank through TrueLayer in 30 seconds. Live balances, instant categorisation." },
  { icon: TrendingUp, title: "Forecast Engine", desc: "Project VUAG, FTSE, S&P 500 or crypto portfolios. See your future net worth, not your past." },
  { icon: Star, title: "Jewish Lifestyle Tools", desc: "Maaser calculator, Tzedakah ledger, Yom Tov forecasting, and Hebrew-date budgeting." },
  { icon: Landmark, title: "UK Universal Credit", desc: "Estimate UC, HMRC tax, and benefits the way HMRC actually calculates them." },
  { icon: MessagesSquare, title: "SMS Finance", desc: "Snap a receipt or forward a payment SMS — AI logs it before you blink." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="landing-logo">
            <div className="w-8 h-8 rounded-xl gradient-emerald grid place-items-center text-white font-bold">£</div>
            <span className="font-semibold tracking-tight text-lg">FinanceAI</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#jewish" className="hover:text-foreground">Jewish Tools</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm hover:text-emerald" data-testid="nav-login">Sign in</Link>
            <Link to="/register" data-testid="nav-register" className="btn-pill text-sm gradient-emerald text-white hover:opacity-90">Get started <ArrowRight className="h-4 w-4 ml-1" /></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 pt-20 pb-32 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-8 fade-up">
            <span className="inline-flex items-center gap-2 label-overline text-emerald"><span className="w-1.5 h-1.5 rounded-full bg-emerald"></span> Premium AI Personal Finance</span>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl tracking-tight leading-[0.95] font-medium">
              Your money,<br />reading <span className="italic text-emerald" style={{fontFamily:'Fraunces'}}>your mind.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              FinanceAI sees every penny you spend, every bracha you make, every bill you forgot — and quietly keeps your budget, your forecasts, and your maaser in line.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/register" data-testid="hero-cta-start" className="btn-pill gradient-emerald text-white hover:opacity-90">Start free <ArrowRight className="h-4 w-4 ml-2" /></Link>
              <Link to="/pricing" data-testid="hero-cta-pricing" className="btn-pill border border-border hover:bg-secondary">See pricing</Link>
            </div>
            <div className="flex gap-8 pt-6 border-t border-border">
              <div><p className="text-2xl font-medium tracking-tight">£5</p><p className="text-xs text-muted-foreground uppercase tracking-wider">per month, premium</p></div>
              <div><p className="text-2xl font-medium tracking-tight">2,400+</p><p className="text-xs text-muted-foreground uppercase tracking-wider">UK banks supported</p></div>
              <div><p className="text-2xl font-medium tracking-tight">10%</p><p className="text-xs text-muted-foreground uppercase tracking-wider">Auto-Maaser</p></div>
            </div>
          </div>
          <div className="lg:col-span-5 relative fade-up delay-2">
            <div className="relative rounded-3xl overflow-hidden border border-border shadow-2xl">
              <img src={HERO_IMG} alt="FinanceAI" className="w-full h-auto" />
            </div>
            <div className="absolute -bottom-6 -left-6 glass rounded-2xl p-4 w-56 hidden sm:block">
              <p className="label-overline">Cash Flow</p>
              <p className="text-2xl font-medium tracking-tight mt-1">£12,408</p>
              <p className="text-xs text-emerald mt-1">↑ 8.4% this month</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="grid lg:grid-cols-12 gap-8 mb-16">
          <div className="lg:col-span-5">
            <p className="label-overline text-emerald">What's inside</p>
            <h2 className="text-4xl lg:text-5xl tracking-tight mt-3 font-medium">Six tools, one premium brain.</h2>
          </div>
          <div className="lg:col-span-6 lg:col-start-7 text-muted-foreground leading-relaxed">
            Most finance apps show you numbers. FinanceAI explains them, predicts the next ones, and quietly takes action — from your inbox, your SMS, and your bank.
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} data-testid={`feature-${title.toLowerCase().replace(/\s+/g, "-")}`} className="rounded-2xl border border-border p-6 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 bg-card">
              <div className="w-10 h-10 rounded-xl bg-secondary grid place-items-center mb-4"><Icon className="h-5 w-5 text-emerald" /></div>
              <h3 className="text-lg tracking-tight font-medium mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Jewish strip */}
      <section id="jewish" className="border-y border-border bg-secondary/30 py-24">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6">
            <p className="label-overline text-topaz">Built for our community</p>
            <h2 className="text-4xl lg:text-5xl tracking-tight mt-3 font-medium">Maaser, Pesach, Yom Tov — handled.</h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">FinanceAI is the only platform that natively understands Jewish life. Auto-calculates Maaser on every paycheck, forecasts Pesach 6 weeks ahead, and tracks every penny of Tzedakah for the year-end.</p>
            <ul className="mt-6 space-y-2 text-sm">
              {["10% Maaser automation", "Tzedakah ledger with receipts", "Yom Tov spending forecasts", "Hebrew calendar integration"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald" /> {t}</li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-6 rounded-3xl border border-border p-8 bg-card">
            <p className="label-overline">Tzedakah ledger · Tishrei 5786</p>
            {[{n:"Yeshiva Beis Aaron", a:120},{n:"Hatzolah London", a:50},{n:"Chesed Fund", a:36},{n:"Local Shul", a:80}].map((r)=>(
              <div key={r.n} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <span className="text-sm">{r.n}</span><span className="text-sm font-medium">£{r.a.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-4 mt-2 border-t border-border">
              <span className="label-overline">Total Given</span>
              <span className="text-xl font-medium tracking-tight text-emerald">£286.00</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <p className="label-overline text-emerald">Pricing</p>
          <h2 className="text-4xl lg:text-5xl tracking-tight mt-3 font-medium">Simple. Honest. Premium when you need it.</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-border p-8 bg-card">
            <p className="label-overline">Free</p>
            <p className="text-4xl tracking-tight mt-2 font-medium">£0<span className="text-base text-muted-foreground">/mo</span></p>
            <p className="text-sm text-muted-foreground mt-2">Manual budgeting & light AI.</p>
            <ul className="mt-6 space-y-2 text-sm">
              {["Manual transactions","CSV uploads","5 AI messages/day","Basic reports"].map((t)=>(
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-muted-foreground" /> {t}</li>
              ))}
            </ul>
            <Link to="/register" data-testid="pricing-free" className="btn-pill border border-border mt-8 w-full">Start free</Link>
          </div>
          <div className="rounded-3xl border-2 border-emerald p-8 bg-card relative overflow-hidden">
            <span className="absolute top-4 right-4 text-xs px-3 py-1 rounded-full gradient-emerald text-white">Most popular</span>
            <p className="label-overline text-emerald">Premium</p>
            <p className="text-4xl tracking-tight mt-2 font-medium">£5<span className="text-base text-muted-foreground">/mo</span></p>
            <p className="text-sm text-muted-foreground mt-2">Everything you'll ever need.</p>
            <ul className="mt-6 space-y-2 text-sm">
              {["Unlimited Claude Sonnet 4.5 AI","UK bank sync (TrueLayer)","PDF & SMS parsing","Investment forecasting","Premium reports + PDF","Auto-Maaser & Tzedakah"].map((t)=>(
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald" /> {t}</li>
              ))}
            </ul>
            <Link to="/pricing" data-testid="pricing-premium" className="btn-pill gradient-emerald text-white mt-8 w-full">Upgrade to Premium</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-12 text-center text-sm text-muted-foreground">
        <p>© 2026 FinanceAI. Built for the UK & the heimishe community.</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <a href="/privacy" className="hover:text-foreground">Privacy Policy</a>
          <a href="/login" className="hover:text-foreground">Sign In</a>
          <a href="/pricing" className="hover:text-foreground">Pricing</a>
        </div>
      </footer>
    </div>
  );
}

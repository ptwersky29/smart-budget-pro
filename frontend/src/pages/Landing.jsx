import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Building2, MessagesSquare, TrendingUp, ShieldCheck, Star, Check, ArrowRight, Landmark, Menu, X, Sun, MoonStar } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "../components/ui/button";

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const dark = theme === "dark";
  useEffect(() => { document.title = "Penni | Premium AI Personal Finance"; }, []);
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="landing-logo">
            <div className="relative w-8 h-8 rounded-full gradient-emerald grid place-items-center text-white font-bold overflow-hidden shadow-md shadow-emerald/20 ring-1 ring-white/15">
              <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full pointer-events-none" />
              <span className="relative z-10">£</span>
            </div>
            <span className="font-semibold tracking-tight text-lg">Penni</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#jewish" className="hover:text-foreground">Jewish Tools</a>
            <Link to="/login" className="px-4 py-2 hover:text-foreground">Sign in</Link>
            <Button variant="primary" size="pill" asChild>
              <Link to="/register" data-testid="nav-register">Get started <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </nav>
          <button onClick={() => setTheme(dark ? "light" : "dark")} className="p-3 text-muted-foreground hover:text-foreground" aria-label="Toggle theme">
            {dark ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
          </button>
          <button className="md:hidden p-3 text-foreground" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-3/4 max-w-sm bg-card border-l border-border p-6 shadow-2xl animate-[fadeUp_0.2s_ease-out]">
            <div className="flex items-center justify-between mb-8">
              <span className="font-semibold tracking-tight text-lg">Penni</span>
              <button className="p-3" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-2">
              <a href="#features" onClick={() => setMobileNavOpen(false)} className="px-4 py-4 rounded-xl text-foreground hover:bg-secondary text-base font-medium">Features</a>
              <a href="#pricing" onClick={() => setMobileNavOpen(false)} className="px-4 py-4 rounded-xl text-foreground hover:bg-secondary text-base font-medium">Pricing</a>
              <a href="#jewish" onClick={() => setMobileNavOpen(false)} className="px-4 py-4 rounded-xl text-foreground hover:bg-secondary text-base font-medium">Jewish Tools</a>
              <hr className="my-2 border-border" />
              <Link to="/login" onClick={() => setMobileNavOpen(false)} className="px-4 py-4 rounded-xl text-foreground hover:bg-secondary text-base font-medium">Sign in</Link>
              <Button variant="primary" size="pill" asChild className="mt-2 w-full">
                <Link to="/register" onClick={() => setMobileNavOpen(false)}>Get started <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </nav>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 pt-20 pb-32 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-8 fade-up">
            <span className="inline-flex items-center gap-2 label-overline text-emerald"><span className="w-1.5 h-1.5 rounded-full bg-emerald"></span> Premium AI Personal Finance</span>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl tracking-tight leading-[0.95] font-medium break-words">
              Your money,<br />reading <span className="italic text-emerald" style={{fontFamily:'Fraunces'}}>your mind.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              Penni sees every penny you spend, every bracha you make, every bill you forgot — and quietly keeps your budget, your forecasts, and your maaser in line.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="pill" asChild>
                <Link to="/register" data-testid="hero-cta-start">Start free <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button variant="outlinePill" size="pill" asChild>
                <Link to="/pricing" data-testid="hero-cta-pricing">See pricing</Link>
              </Button>
            </div>
            <div className="flex gap-8 pt-6 border-t border-border">
              <div><p className="text-2xl font-medium tracking-tight">£5</p><p className="text-xs text-muted-foreground uppercase tracking-wider">per month, premium</p></div>
              <div><p className="text-2xl font-medium tracking-tight">2,400+</p><p className="text-xs text-muted-foreground uppercase tracking-wider">UK banks supported</p></div>
              <div><p className="text-2xl font-medium tracking-tight">10%</p><p className="text-xs text-muted-foreground uppercase tracking-wider">Auto-Maaser</p></div>
            </div>
          </div>
          <div className="lg:col-span-5 relative fade-up delay-2">
            <div className="relative rounded-3xl overflow-hidden border border-border shadow-2xl">
              <img src={HERO_IMG} alt="Penni" className="w-full h-auto" />
            </div>
            <div className="absolute -bottom-6 -left-6 glass rounded-2xl p-4 w-56 hidden sm:block">
              <p className="label-overline">Cash Flow</p>
              <p className="text-2xl font-medium tracking-tight mt-1">£12,408</p>
              <p className="text-xs text-emerald mt-1">↑ 8.4% this month</p>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <div className="max-w-7xl mx-auto px-6 py-12 text-center border-y border-border">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">Trusted by users across the UK</p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald" /> 2,400+ UK banks supported</span>
          <span className="flex items-center gap-2"><Star className="h-4 w-4 text-emerald" /> 14-day free trial</span>
          <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald" /> TLS 1.3 encrypted</span>
        </div>
      </div>

      {/* Features grid */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="grid lg:grid-cols-12 gap-8 mb-16">
          <div className="lg:col-span-5">
            <p className="label-overline text-emerald">What's inside</p>
            <h2 className="text-4xl lg:text-5xl tracking-tight mt-3 font-medium">Six tools, one premium brain.</h2>
          </div>
          <div className="lg:col-span-6 lg:col-start-7 text-muted-foreground leading-relaxed">
            Most finance apps show you numbers. Penni explains them, predicts the next ones, and quietly takes action — from your inbox, your SMS, and your bank.
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
            <p className="text-muted-foreground mt-4 leading-relaxed">Penni is the only platform that natively understands Jewish life. Auto-calculates Maaser on every paycheck, forecasts Pesach 6 weeks ahead, and tracks every penny of Tzedakah for the year-end.</p>
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
            <Button variant="outlinePill" size="pill" asChild className="mt-8 w-full">
              <Link to="/register" data-testid="pricing-free">Start free</Link>
            </Button>
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
            <Button variant="primary" size="pill" asChild className="mt-8 w-full">
              <Link to="/pricing" data-testid="pricing-premium">Upgrade to Premium</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-12 text-center text-sm text-muted-foreground">
        <p>© 2026 Penni. Built for the UK & the heimishe community.</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <a href="/privacy" className="hover:text-foreground">Privacy Policy</a>
          <a href="/login" className="hover:text-foreground">Sign In</a>
          <a href="/pricing" className="hover:text-foreground">Pricing</a>
        </div>
      </footer>
    </div>
  );
}

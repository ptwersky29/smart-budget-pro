import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import KeyboardShortcutsHelp from "../components/KeyboardShortcutsHelp";
import QuickAddWidget from "../components/QuickAddWidget";

import {
  LayoutDashboard, Receipt, PiggyBank, Building2, TrendingUp, Star,
  Landmark, FileText, Settings, LogOut, Menu, X, MoonStar, Sun, MessageSquare, Upload, Plug, Crown, ArrowRight, RefreshCcw
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/transactions", label: "Transactions", icon: Receipt },
      { to: "/budgets", label: "Budgets", icon: PiggyBank },
      { to: "/subscriptions", label: "Subscriptions", icon: RefreshCcw },
      { to: "/statements", label: "Statements", icon: Upload },
    ],
  },
  {
    label: "Accounts",
    items: [
      { to: "/connections", label: "Bank Connections", icon: Building2 },
      { to: "/sms", label: "SMS Finance", icon: MessageSquare },
      { to: "/integrations", label: "Integrations", icon: Plug },
    ],
  },
  {
    label: "Tools",
    items: [
      { to: "/investments", label: "Investments", icon: TrendingUp },
      { to: "/jewish", label: "Jewish Tools", icon: Star },
      { to: "/uk-tools", label: "UK Benefits", icon: Landmark },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const ROUTE_META = [
  {
    paths: ["/dashboard"],
    eyebrow: "Overview",
    title: "Dashboard",
    description: "A clean snapshot of your money, cash flow, and what needs attention next.",
    primary: { label: "Add transaction", to: "/transactions" },
    secondary: { label: "Connect bank", to: "/connections" },
  },
  {
    paths: ["/transactions"],
    eyebrow: "Money",
    title: "Transactions",
    description: "Search, edit, and organize every transaction in one place.",
    primary: { label: "Add transaction", to: "/transactions" },
    secondary: { label: "Budgets", to: "/budgets" },
  },
  {
    paths: ["/budgets"],
    eyebrow: "Money",
    title: "Budgets",
    description: "Set simple limits, track progress, and keep spending easy to understand.",
    primary: { label: "Add budget", to: "/budgets" },
    secondary: { label: "View reports", to: "/reports" },
  },
  {
    paths: ["/connections"],
    eyebrow: "Accounts",
    title: "Bank Connections",
    description: "Connect banks, set an import start date, and keep sync status visible.",
    primary: { label: "Connect bank", to: "/connections" },
    secondary: { label: "Settings", to: "/settings" },
  },
  {
    paths: ["/sms"],
    eyebrow: "Accounts",
    title: "SMS Finance",
    description: "Turn bank SMS messages into clean, readable transaction entries.",
    primary: { label: "Open integrations", to: "/integrations" },
    secondary: { label: "Transactions", to: "/transactions" },
  },
  {
    paths: ["/subscriptions"],
    eyebrow: "Money",
    title: "Subscriptions",
    description: "Track recurring payments, detect subscriptions from your transactions, and manage them in one place.",
    primary: { label: "Add subscription", to: "/subscriptions" },
    secondary: { label: "Transactions", to: "/transactions" },
  },
  {
    paths: ["/statements"],
    eyebrow: "Money",
    title: "Statements",
    description: "Upload a CSV or PDF and review what the system extracted before saving.",
    primary: { label: "Upload statement", to: "/statements" },
    secondary: { label: "Transactions", to: "/transactions" },
  },
  {
    paths: ["/integrations"],
    eyebrow: "Accounts",
    title: "Integrations",
    description: "Keep AI providers, bank tools, and automation settings in one place.",
    primary: { label: "Settings", to: "/settings" },
    secondary: { label: "Bank connections", to: "/connections" },
  },
  {
    paths: ["/investments"],
    eyebrow: "Tools",
    title: "Investments",
    description: "Look at future scenarios, growth trends, and simple projection planning.",
    primary: { label: "Reports", to: "/reports" },
    secondary: { label: "Dashboard", to: "/dashboard" },
  },
  {
    paths: ["/jewish"],
    eyebrow: "Tools",
    title: "Jewish Finance",
    description: "Maaser, Tzedakah, and holiday planning with a clean modern layout.",
    primary: { label: "Reports", to: "/reports" },
    secondary: { label: "Budgets", to: "/budgets" },
  },
  {
    paths: ["/uk-tools"],
    eyebrow: "Tools",
    title: "UK Benefits",
    description: "Simple UK finance helpers, calculators, and planning tools.",
    primary: { label: "Settings", to: "/settings" },
    secondary: { label: "Reports", to: "/reports" },
  },
  {
    paths: ["/reports"],
    eyebrow: "Overview",
    title: "Reports",
    description: "Review the story behind your money with clearer summaries and exportable reports.",
    primary: { label: "Download report", to: "/reports" },
    secondary: { label: "Dashboard", to: "/dashboard" },
  },
  {
    paths: ["/settings"],
    eyebrow: "System",
    title: "Settings",
    description: "Manage your account, premium access, AI providers, and connected services.",
    primary: { label: "Pricing", to: "/pricing" },
    secondary: { label: "Integrations", to: "/integrations" },
  },
];

function getRouteMeta(pathname) {
  return ROUTE_META.find((meta) => meta.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) || ROUTE_META[0];
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [helpOpen, setHelpOpen] = useState(false);
  const leaderBuffer = useRef([]);

  useKeyboardShortcut("?", () => setHelpOpen(p => !p));

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.closest("input, textarea, select, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      if (key === "escape") { setHelpOpen(false); return; }
      if (key === "g") {
        leaderBuffer.current = ["g"];
        setTimeout(() => { leaderBuffer.current = []; }, 800);
        return;
      }
      if (leaderBuffer.current.length === 1 && leaderBuffer.current[0] === "g") {
        leaderBuffer.current = [];
        const map = { d: "/dashboard", t: "/transactions", b: "/budgets", s: "/subscriptions", r: "/reports", g: "/settings" };
        if (map[key]) { e.preventDefault(); navigate(map[key]); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const routeMeta = useMemo(() => getRouteMeta(location.pathname), [location.pathname]);
  const currentSection = useMemo(() => NAV_SECTIONS.find((section) => section.items.some((item) => location.pathname.startsWith(item.to))) || NAV_SECTIONS[0], [location.pathname]);

  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setDark(document.documentElement.classList.contains("dark"));
  };

  const doLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="app-shell min-h-screen flex text-foreground relative">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-emerald/10 blur-3xl" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-topaz/10 blur-3xl" />
      </div>

      <aside className={`${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:sticky top-0 left-0 z-40 h-screen w-[19rem] border-r border-border bg-card/85 backdrop-blur-xl transition-transform duration-300`}>
        <div className="flex items-center justify-between px-6 h-16 border-b border-border/70">
          <Link to="/dashboard" className="flex items-center gap-3" data-testid="sidebar-logo">
            <div className="w-9 h-9 rounded-2xl gradient-emerald grid place-items-center text-white font-bold shadow-lg shadow-emerald/20">£</div>
            <div>
              <span className="block font-semibold tracking-tight leading-none">FinanceAI</span>
              <span className="block text-[11px] text-muted-foreground mt-1">Premium money workspace</span>
            </div>
          </Link>
          <button className="lg:hidden h-9 w-9 rounded-full grid place-items-center hover:bg-secondary" onClick={() => setOpen(false)} data-testid="sidebar-close" aria-label="Close navigation menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto h-[calc(100vh-4rem)] no-scrollbar">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="space-y-2">
              <p className="px-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{section.label}</p>
              <div className="space-y-1">
                {section.items.map(({ to, label, icon: Icon }) => {
                  const active = location.pathname.startsWith(to);
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => setOpen(false)}
                      data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                      aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-2xl px-3 py-3 transition-all ${
                        active
                          ? "bg-emerald/10 text-foreground border border-emerald/20 shadow-sm"
                          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                      }`}
                    >
                      <span className={`grid h-9 w-9 place-items-center rounded-xl border transition-colors ${
                        active ? "border-emerald/20 bg-emerald/15 text-emerald" : "border-transparent bg-secondary/60"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-sm font-medium">{label}</span>
                      {active && <span className="h-2 w-2 rounded-full bg-emerald" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {user?.tier !== "premium" && user?.role !== "admin" && (
            <div className="rounded-[1.5rem] border border-emerald/20 bg-emerald/5 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-4 w-4 text-emerald" />
                <span className="text-sm font-semibold text-emerald">Upgrade to Premium</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">Unlock bank sync, AI tools, and premium reports.</p>
              <Link to="/pricing" onClick={() => setOpen(false)} data-testid="sidebar-upgrade" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald">
                £5 / mo <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t border-border/70 bg-card/90 backdrop-blur-xl p-4">
          <div className="flex items-center gap-3 rounded-[1.25rem] border border-border/70 bg-background/70 px-3 py-3">
            <div className="w-10 h-10 rounded-full bg-secondary grid place-items-center text-sm font-semibold">
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.tier || "free"} plan · {currentSection.label}</p>
            </div>
            <button onClick={doLogout} title="Logout" data-testid="logout-button" className="text-muted-foreground hover:text-foreground" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden backdrop-blur-[2px]" onClick={() => setOpen(false)} />}

      <div className="relative flex-1 min-w-0">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 px-4 lg:px-8 h-16">
            <div className="flex items-center gap-3 min-w-0">
              <button className="lg:hidden h-10 w-10 rounded-full grid place-items-center border border-border bg-card/80" onClick={() => setOpen(true)} data-testid="sidebar-open" aria-label="Open navigation menu">
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="label-overline text-emerald">{routeMeta.eyebrow}</p>
                <p className="text-sm font-medium truncate">{routeMeta.title}</p>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-2">
              {routeMeta.secondary && (
                <Link to={routeMeta.secondary.to} className="toolbar-chip hover:bg-secondary/70 transition-colors">
                  {routeMeta.secondary.label}
                </Link>
              )}
              {routeMeta.primary && (
                <Link to={routeMeta.primary.to} className="btn-pill gradient-emerald text-white h-10 px-4 text-sm shadow-lg shadow-emerald/15">
                  {routeMeta.primary.label}
                </Link>
              )}
              {user?.tier !== "premium" && user?.role !== "admin" && (
                <Link to="/pricing" data-testid="topbar-upgrade" className="hidden xl:inline-flex items-center gap-2 px-4 h-10 rounded-full border border-emerald/20 bg-emerald/10 text-emerald text-sm font-medium hover:bg-emerald/15 transition-colors">
                  <Crown className="h-4 w-4" />
                  Upgrade
                </Link>
              )}
              <button onClick={toggleTheme} data-testid="theme-toggle" className="h-10 w-10 grid place-items-center rounded-full border border-border bg-card/80 hover:bg-secondary transition-colors" aria-label="Toggle theme">
                {dark ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex items-center gap-2 lg:hidden">
              <button onClick={toggleTheme} data-testid="theme-toggle-mobile" className="h-10 w-10 grid place-items-center rounded-full border border-border bg-card/80 hover:bg-secondary transition-colors" aria-label="Toggle theme">
                {dark ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-5 lg:p-8 max-w-[1680px] mx-auto animate-[fadeUp_0.35s_ease-out]">
          <div className="space-y-8">
            <div className="lg:hidden rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-5 shadow-card">
              <p className="label-overline text-emerald">{routeMeta.eyebrow}</p>
              <p className="mt-2 text-2xl tracking-tight font-semibold">{routeMeta.title}</p>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{routeMeta.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {routeMeta.secondary && <Link to={routeMeta.secondary.to} className="toolbar-chip">{routeMeta.secondary.label}</Link>}
                {routeMeta.primary && <Link to={routeMeta.primary.to} className="btn-pill gradient-emerald text-white h-10 px-4 text-sm">{routeMeta.primary.label}</Link>}
              </div>
            </div>
            <Outlet />
          </div>
        </main>
      </div>
      <KeyboardShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <QuickAddWidget />
    </div>
  );
}

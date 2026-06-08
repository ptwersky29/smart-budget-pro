import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "next-themes";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import KeyboardShortcutsHelp from "../components/KeyboardShortcutsHelp";
import CommandPalette from "../components/CommandPalette";
import NotificationCenter from "../components/NotificationCenter";
import QuickAddWidget from "../components/QuickAddWidget";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";

import {
  LayoutDashboard, Receipt, PiggyBank, Building2, TrendingUp, Star,
  Landmark, FileText, Settings, LogOut, Menu, X, MoonStar, Sun, Crown, ArrowRight, RefreshCcw, MoreHorizontal
} from "lucide-react";

const BOTTOM_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/settings", label: "More", icon: MoreHorizontal, isMore: true },
];

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/transactions", label: "Transactions", icon: Receipt },
      { to: "/budgets", label: "Budgets", icon: PiggyBank },
      { to: "/subscriptions", label: "Subscriptions", icon: RefreshCcw },
    ],
  },
  {
    label: "Connect",
    items: [
      { to: "/import", label: "Bank & Statements", icon: Building2 },
      { to: "/investments", label: "Investments", icon: TrendingUp },
    ],
  },
  {
    label: "More",
    items: [
      { to: "/jewish", label: "Jewish Tools", icon: Star },
      { to: "/uk-tools", label: "UK Benefits", icon: Landmark },
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
    secondary: { label: "Import data", to: "/import" },
  },
  {
    paths: ["/transactions"],
    eyebrow: "Finance",
    title: "Transactions",
    description: "Search, edit, and organize every transaction in one place.",
    primary: { label: "Add transaction", to: "/transactions" },
    secondary: { label: "Budgets", to: "/budgets" },
  },
  {
    paths: ["/budgets"],
    eyebrow: "Finance",
    title: "Budgets",
    description: "Set simple limits, track progress, and keep spending easy to understand.",
    primary: { label: "Add budget", to: "/budgets" },
    secondary: { label: "View reports", to: "/reports" },
  },
  {
    paths: ["/subscriptions"],
    eyebrow: "Finance",
    title: "Subscriptions",
    description: "Track recurring payments, detect subscriptions from your transactions, and manage them in one place.",
    primary: { label: "Add subscription", to: "/subscriptions" },
    secondary: { label: "Transactions", to: "/transactions" },
  },
  {
    paths: ["/import"],
    eyebrow: "Connect",
    title: "Bank & Statements",
    description: "Connect your bank via TrueLayer, upload CSV/PDF statements, or manage existing connections.",
    primary: { label: "Connect bank", to: "/import" },
    secondary: { label: "Settings", to: "/settings" },
  },
  {
    paths: ["/investments"],
    eyebrow: "Connect",
    title: "Investments",
    description: "Look at future scenarios, growth trends, and simple projection planning.",
    primary: { label: "Reports", to: "/reports" },
    secondary: { label: "Dashboard", to: "/dashboard" },
  },
  {
    paths: ["/jewish"],
    eyebrow: "More",
    title: "Jewish Finance",
    description: "Maaser, Tzedakah, and holiday planning with a clean modern layout.",
    primary: { label: "Reports", to: "/reports" },
    secondary: { label: "Budgets", to: "/budgets" },
  },
  {
    paths: ["/uk-tools"],
    eyebrow: "More",
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
    eyebrow: "More",
    title: "Settings",
    description: "Manage your account, subscription, AI providers, integrations, and SMS settings.",
    primary: { label: "Pricing", to: "/pricing" },
    secondary: { label: "Import data", to: "/import" },
  },
];

function getRouteMeta(pathname) {
  return ROUTE_META.find((meta) => meta.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) || ROUTE_META[0];
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const prevPath = useRef(location.pathname);
  const leaderBuffer = useRef([]);
  const dark = resolvedTheme === "dark";

  useKeyboardShortcut("?", () => setHelpOpen(p => !p));

  // Handle Cmd+K or Ctrl+K for command palette
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(p => !p);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Show thin progress bar on route change
  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      setRouteLoading(true);
      prevPath.current = location.pathname;
      const t = setTimeout(() => setRouteLoading(false), 400);
      return () => clearTimeout(t);
    }
  }, [location.pathname]);

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
        const map = { d: "/dashboard", t: "/transactions", b: "/budgets", s: "/subscriptions", r: "/reports", i: "/import", g: "/settings" };
        if (map[key]) { e.preventDefault(); navigate(map[key]); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  // Wire up CommandPalette quick actions
  useEffect(() => {
    const handler = (e) => {
      const { action } = e.detail || {};
      if (action === "new-transaction") {
        // Dispatch a custom event that pages can listen for
        window.dispatchEvent(new CustomEvent("app-quick-action", { detail: { action: "open-new-transaction" } }));
      } else if (action === "search-transactions") {
        navigate("/transactions");
        setTimeout(() => window.dispatchEvent(new CustomEvent("app-quick-action", { detail: { action: "focus-search" } })), 100);
      }
    };
    window.addEventListener("command-action", handler);
    return () => window.removeEventListener("command-action", handler);
  }, [navigate]);

  const routeMeta = useMemo(() => getRouteMeta(location.pathname), [location.pathname]);
  const currentSection = useMemo(() => NAV_SECTIONS.find((section) => section.items.some((item) => location.pathname.startsWith(item.to))) || NAV_SECTIONS[0], [location.pathname]);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
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
          <button className="lg:hidden h-11 w-11 rounded-full grid place-items-center hover:bg-secondary" onClick={() => setOpen(false)} data-testid="sidebar-close" aria-label="Close navigation menu">
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
                      <span className={`grid h-10 w-10 place-items-center rounded-xl border transition-colors ${
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
            <button onClick={doLogout} title="Sign out" data-testid="logout-button" className="flex items-center gap-1.5 p-2 text-muted-foreground hover:text-foreground text-xs" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
              <span className="hidden xl:inline">Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden backdrop-blur-[2px]" onClick={() => setOpen(false)} />}

      <div className="relative flex-1 min-w-0">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-xl">
          {/* Route loading progress bar */}
          {routeLoading && (
            <div className="absolute top-0 left-0 right-0 h-0.5 z-50 overflow-hidden">
              <div className="h-full bg-emerald animate-[routeProgress_0.4s_ease-out_forwards]" />
            </div>
          )}
          {/* Visually hidden page title for screen readers */}
          <h1 className="sr-only">{routeMeta.title} — FinanceAI</h1>
          <div className="flex items-center justify-between gap-4 px-4 lg:px-8 h-16">
            <div className="flex items-center gap-3 min-w-0">
              <button className="lg:hidden h-11 w-11 rounded-full grid place-items-center border border-border bg-card/80" onClick={() => setOpen(true)} data-testid="sidebar-open" aria-label="Open navigation menu">
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="label-overline text-emerald">{routeMeta.eyebrow}</p>
                <p className="text-sm font-medium truncate">{routeMeta.title}</p>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-2">
              {routeMeta.secondary && (
                <Button asChild variant="chip">
                  <Link to={routeMeta.secondary.to}>{routeMeta.secondary.label}</Link>
                </Button>
              )}
              {routeMeta.primary && (
                <Button asChild variant="primary" size="pill">
                  <Link to={routeMeta.primary.to}>{routeMeta.primary.label}</Link>
                </Button>
              )}
              {user?.tier !== "premium" && user?.role !== "admin" && (
                <Link to="/pricing" data-testid="topbar-upgrade" className="hidden xl:inline-flex items-center gap-2 px-4 h-10 rounded-full border border-emerald/20 bg-emerald/10 text-emerald text-sm font-medium hover:bg-emerald/15 transition-colors">
                  <Crown className="h-4 w-4" />
                  Upgrade
                </Link>
              )}
              <NotificationCenter />
              <button onClick={toggleTheme} data-testid="theme-toggle" className="h-11 w-11 grid place-items-center rounded-full border border-border bg-card/80 hover:bg-secondary transition-colors" aria-label="Toggle theme" title="Toggle theme">
                {dark ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex items-center gap-2 lg:hidden">
              <button onClick={toggleTheme} data-testid="theme-toggle-mobile" className="h-11 w-11 grid place-items-center rounded-full border border-border bg-card/80 hover:bg-secondary transition-colors" aria-label="Toggle theme">
                {dark ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              </button>
              {routeMeta.primary && (
                <Button asChild variant="primary" size="pill" className="text-xs">
                  <Link to={routeMeta.primary.to}>{routeMeta.primary.label}</Link>
                </Button>
              )}
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-5 lg:p-8 pb-24 lg:pb-8 max-w-[1680px] mx-auto">
          <div className="space-y-8">
            <div className="lg:hidden rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-5 shadow-card">
              <p className="label-overline text-emerald">{routeMeta.eyebrow}</p>
              <p className="mt-2 text-2xl tracking-tight font-semibold">{routeMeta.title}</p>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{routeMeta.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {routeMeta.secondary && <Button asChild variant="chip"><Link to={routeMeta.secondary.to}>{routeMeta.secondary.label}</Link></Button>}
                {routeMeta.primary && <Button asChild variant="primary" size="pill"><Link to={routeMeta.primary.to}>{routeMeta.primary.label}</Link></Button>}
              </div>
            </div>
            <div key={location.pathname} className="animate-[slideInRight_0.3s_ease-out]">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
      {/* ── Bottom Navigation (mobile) ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl safe-bottom-fixed tap-highlight-none" role="tablist" aria-label="Main navigation">
        <div className="flex items-center justify-around h-16 px-2">
          {BOTTOM_NAV.map(({ to, label, icon: Icon, isMore }) => {
            const active = location.pathname.startsWith(to);
            if (isMore) {
              const otherSections = NAV_SECTIONS.flatMap(s => s.items).filter(
                item => !BOTTOM_NAV.some(n => n.to === item.to || n.isMore)
              );
              const moreActive = otherSections.some(s => location.pathname.startsWith(s.to));
              return (
                <DropdownMenu key="more">
                  <DropdownMenuTrigger asChild>
                    <button
                      className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors relative ${
                        moreActive ? "text-emerald" : "text-muted-foreground hover:text-foreground"
                      }`}
                      aria-label="More"
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-[10px] font-medium">More</span>
                      {moreActive && <span className="absolute -top-1 left-1/2 -translate-x-1/2 h-1 w-6 rounded-full bg-emerald" />}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" side="top" className="mb-3">
                    {otherSections.map(({ to: t, label: l, icon: Ic }) => (
                      <DropdownMenuItem key={t} onClick={() => { navigate(t); }}>
                        <Ic className="h-4 w-4 mr-2" />
                        {l}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }
            return (
              <Link
                key={to}
                to={to}
                role="tab"
                aria-selected={active}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors relative ${
                  active ? "text-emerald" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{label}</span>
                {active && <span className="absolute -top-1 left-1/2 -translate-x-1/2 h-1 w-6 rounded-full bg-emerald" />}
              </Link>
            );
          })}
        </div>
      </nav>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <KeyboardShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <QuickAddWidget />
    </div>
  );
}

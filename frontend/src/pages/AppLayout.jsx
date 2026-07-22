import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { useTheme } from "next-themes";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import KeyboardShortcutsHelp from "../components/KeyboardShortcutsHelp";
import CommandPalette from "../components/CommandPalette";
import NotificationCenter from "../components/NotificationCenter";
import QuickAddWidget from "../components/QuickAddWidget";
import Logo from "../components/Logo";
import { BOTTOM_NAV, NAV_SECTIONS, ROUTE_META, getRouteMeta, KEYBOARD_GOTO } from "../data/navigation";
import { APP_NAME, APP_TAGLINE } from "../data/constants";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";

import { Compass, LogOut, MoonStar, Sun, Search, Settings, User } from "lucide-react";
import pkg from "../../package.json";

const ProductTour = lazy(() => import("../components/ProductTour"));

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const noAnim = settings.preferences?.dashboard?.animations === false || settings.preferences?.accessibility?.reduce_motion === true;
  const [helpOpen, setHelpOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [tourLoaded, setTourLoaded] = useState(false);
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
        if (KEYBOARD_GOTO[key]) { e.preventDefault(); navigate(KEYBOARD_GOTO[key]); }
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

  const startTour = () => {
    localStorage.setItem("penni.productTour.v1", JSON.stringify({ started: true, index: 0, completed: false }));
    setTourLoaded(true);
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("product-tour:start")), 80);
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("penni.productTour.v1") || "{}");
      if (saved.started && !saved.completed) setTourLoaded(true);
    } catch {
      // Ignore damaged local state; the user can restart the tour from the header.
    }
  }, []);

  const doLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="app-shell min-h-screen flex text-foreground relative">
      <aside data-tour="sidebar" className="hidden lg:flex lg:flex-col lg:sticky top-0 left-0 z-40 h-screen w-[18rem] border-r border-border bg-card/95 backdrop-blur-xl shadow-[8px_0_30px_rgba(15,23,42,0.03)]">
        <div className="flex items-center justify-between px-6 h-16 border-b border-border/70 shrink-0">
          <Link to="/dashboard" className="flex items-center gap-3 min-w-0" data-testid="sidebar-logo">
            <Logo size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold tracking-tight leading-none truncate">{APP_NAME}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-1 rounded-lg bg-topaz/15 text-topaz border border-topaz/30 leading-none shadow-sm shrink-0">BETA</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-1 rounded-lg bg-emerald/15 text-emerald border border-emerald/30 leading-none shadow-sm shrink-0">v{pkg.version}</span>
              </div>
              <span className="block text-[11px] text-muted-foreground mt-0.5 truncate">{APP_TAGLINE}</span>
            </div>
          </Link>
        </div>

        <div className="flex-1 p-4 space-y-5 overflow-y-auto no-scrollbar">
          {NAV_SECTIONS.filter((section) => !section.adminOnly || user?.role === "admin").map((section) => (
            <div key={section.label} className="space-y-2">
              <p className="px-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{section.label}</p>
              <div className="space-y-1">
                {section.items.map(({ to, label, icon: Icon }) => {
                  const active = location.pathname.startsWith(to);
                  return (
                    <Link
                      key={to}
                      to={to}
                      data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                      aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
                        active
                          ? "bg-emerald/10 text-foreground border border-emerald/20"
                          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                      }`}
                    >
                      <span className={`grid h-9 w-9 place-items-center rounded-lg border transition-colors ${
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
        </div>

        <div className="border-t border-border/70 bg-card/90 backdrop-blur-xl p-4 shrink-0">
          <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/80 px-3 py-3">
            <div className="w-10 h-10 rounded-lg bg-secondary grid place-items-center text-sm font-semibold">
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

      <div className="relative flex-1 min-w-0">
        <header data-tour="route-header" className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur-xl">
          {/* Route loading progress bar */}
          {routeLoading && (
            <div className="absolute top-0 left-0 right-0 h-0.5 z-50 overflow-hidden">
              <div className={`h-full bg-emerald ${noAnim ? "" : "animate-[routeProgress_0.4s_ease-out_forwards]"}`} />
            </div>
          )}
          {/* Visually hidden page title for screen readers */}
          <h1 className="sr-only">{routeMeta.title} — {APP_NAME}</h1>
          <div className="flex items-center justify-between gap-4 px-4 lg:px-8 h-16">
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{routeMeta.title}</p>
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
              <button onClick={startTour} data-tour="tour-launch" className="h-10 w-10 grid place-items-center rounded-lg border border-border bg-card/90 hover:bg-secondary transition-colors" aria-label="Start app walk-through" title="Start app walk-through">
                <Compass className="h-4 w-4" />
              </button>
              <NotificationCenter />
              <button onClick={() => setCommandOpen(true)} data-tour="command-search" data-testid="command-open" className="h-10 w-10 grid place-items-center rounded-lg border border-border bg-card/90 hover:bg-secondary transition-colors" aria-label="Open command palette" title="Open command palette">
                <Search className="h-4 w-4" />
              </button>
              <button onClick={toggleTheme} data-testid="theme-toggle" className="h-10 w-10 grid place-items-center rounded-lg border border-border bg-card/90 hover:bg-secondary transition-colors" aria-label="Toggle theme" title="Toggle theme">
                {dark ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex items-center gap-1 lg:hidden">
              <button onClick={startTour} data-tour="tour-launch" className="grid place-items-center w-11 h-11 rounded-xl active:bg-black/5 dark:active:bg-white/10 transition-colors" aria-label="Start app walk-through">
                <Compass className="h-5 w-5 text-muted-foreground" />
              </button>
              <button onClick={() => setCommandOpen(true)} data-tour="command-search" data-testid="command-open-mobile" className="grid place-items-center w-11 h-11 rounded-xl active:bg-black/5 dark:active:bg-white/10 transition-colors" aria-label="Open command palette">
                <Search className="h-5 w-5 text-muted-foreground" />
              </button>
              <button onClick={toggleTheme} data-testid="theme-toggle-mobile" className="grid place-items-center w-11 h-11 rounded-xl active:bg-black/5 dark:active:bg-white/10 transition-colors" aria-label="Toggle theme">
                {dark ? <Sun className="h-5 w-5 text-muted-foreground" /> : <MoonStar className="h-5 w-5 text-muted-foreground" />}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="grid place-items-center w-11 h-11 rounded-xl active:bg-black/5 dark:active:bg-white/10 transition-colors text-sm font-semibold" aria-label="User menu">
                    <span className="w-8 h-8 rounded-full bg-emerald/15 text-emerald grid place-items-center text-sm font-bold">
                      {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="mr-2 mt-1 min-w-[160px]">
                  <div className="px-3 py-2 border-b border-border/60">
                    <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
                  </div>
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={doLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main data-tour="main-content" className="p-4 sm:p-5 lg:p-8 pb-20 lg:pb-8 max-w-[1560px] mx-auto">
          <div className="space-y-8">
            <div key={location.pathname} className={noAnim ? "" : "animate-[slideInRight_0.3s_ease-out]"}>
              <Outlet />
            </div>
          </div>
        </main>
      </div>
      {/* ── Bottom Navigation (Android Material) ── */}
      <nav data-tour="mobile-nav" className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 border-t border-border/60 safe-bottom-fixed tap-highlight-none" role="tablist" aria-label="Main navigation">
        <div className="flex items-center justify-around h-14 px-1 max-w-lg mx-auto pb-1">
          {BOTTOM_NAV.map(({ to, label, icon: Icon, isMore }) => {
            const active = location.pathname.startsWith(to);
            if (isMore) {
              const otherSections = NAV_SECTIONS.flatMap(s => s.items).filter(
                item => !BOTTOM_NAV.some(n => n.to === item.to)
              );
              const moreActive = otherSections.some(s => location.pathname.startsWith(s.to));
              return (
                <DropdownMenu key="more">
                  <DropdownMenuTrigger asChild>
                    <button
                      className={`relative flex flex-col items-center justify-center gap-0.5 w-[64px] h-12 rounded-2xl transition-all ${
                        moreActive ? "text-emerald" : "text-muted-foreground active:text-foreground"
                      }`}
                      aria-label="More"
                    >
                      <span className={`grid place-items-center w-10 h-7 rounded-xl transition-colors ${
                        moreActive ? "bg-emerald/15" : ""
                      }`}>
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className={`text-[11px] font-medium leading-none ${moreActive ? "font-semibold" : ""}`}>More</span>
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
                className={`relative flex flex-col items-center justify-center gap-0.5 w-[64px] h-12 rounded-2xl transition-all ${
                  active ? "text-emerald" : "text-muted-foreground active:text-foreground"
                }`}
              >
                <span className={`grid place-items-center w-10 h-7 rounded-xl transition-colors ${
                  active ? "bg-emerald/15" : ""
                }`}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className={`text-[11px] leading-none ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <KeyboardShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <QuickAddWidget />
      {tourLoaded && (
        <Suspense fallback={null}>
          <ProductTour />
        </Suspense>
      )}
    </div>
  );
}

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
import { BOTTOM_NAV, NAV_SECTIONS, getRouteMeta, KEYBOARD_GOTO } from "../data/navigation";
import { APP_NAME } from "../data/constants";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";

import { Compass, LogOut, MoonStar, Sun, Search, Settings } from "lucide-react";

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
    <div className="app-shell min-h-screen flex flex-col text-foreground relative">
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
            <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
              <Logo size="sm" />
              <span className="font-semibold tracking-tight leading-none hidden sm:inline">{APP_NAME}</span>
            </Link>
            <span className="w-px h-6 bg-border/60 hidden sm:block" />
            <p className="text-sm font-semibold truncate">{routeMeta.title}</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Desktop-only actions */}
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
            </div>
            <button onClick={startTour} data-tour="tour-launch" className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-card/90 hover:bg-secondary transition-colors" aria-label="Start app walk-through" title="Start app walk-through">
              <Compass className="h-4 w-4" />
            </button>
            <NotificationCenter />
            <button onClick={() => setCommandOpen(true)} data-tour="command-search" data-testid="command-open" className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-card/90 hover:bg-secondary transition-colors" aria-label="Open command palette" title="Open command palette">
              <Search className="h-4 w-4" />
            </button>
            <button onClick={toggleTheme} data-testid="theme-toggle" className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-card/90 hover:bg-secondary transition-colors" aria-label="Toggle theme" title="Toggle theme">
              {dark ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
            </button>
            {routeMeta.primary && (
              <Button asChild variant="primary" size="pill" className="lg:hidden text-xs">
                <Link to={routeMeta.primary.to}>{routeMeta.primary.label}</Link>
              </Button>
            )}
            {/* User avatar with logout */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-9 w-9 rounded-lg bg-secondary grid place-items-center text-sm font-semibold border border-border hover:bg-secondary/80 transition-colors" aria-label="User menu">
                  {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="mr-2 mt-1 min-w-[180px]">
                <div className="px-3 py-2 border-b border-border/60">
                  <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.tier || "free"} plan</p>
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

      <main data-tour="main-content" className="flex-1 p-4 sm:p-5 lg:p-6 pb-24 max-w-[1560px] mx-auto w-full">
        <div className="space-y-8">
          <div key={location.pathname} className={noAnim ? "" : "animate-[slideInRight_0.3s_ease-out]"}>
            <Outlet />
          </div>
        </div>
      </main>

      {/* ── Bottom Navigation ── */}
      <nav data-tour="mobile-nav" className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl safe-bottom-fixed tap-highlight-none" role="tablist" aria-label="Main navigation">
        <div className="flex items-center justify-around h-16 px-2">
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
      {tourLoaded && (
        <Suspense fallback={null}>
          <ProductTour />
        </Suspense>
      )}
    </div>
  );
}

import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useAssistant } from "../contexts/AssistantContext";
import { useSettings } from "../contexts/SettingsContext";
import { useTheme } from "next-themes";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import KeyboardShortcutsHelp from "../components/KeyboardShortcutsHelp";
import CommandPalette from "../components/CommandPalette";
import NotificationCenter from "../components/NotificationCenter";
import Logo from "../components/Logo";
import { BOTTOM_NAV, NAV_SECTIONS, SETTINGS_NAV_ITEM, getRouteMeta, KEYBOARD_GOTO } from "../data/navigation";
import { APP_NAME } from "../data/constants";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";
import {
  Compass,
  LogOut,
  MoonStar,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";

const ProductTour = lazy(() => import("../components/ProductTour"));
const SIDEBAR_KEY = "penni.sidebar.collapsed";

function isActivePath(pathname, to) {
  if (to === "/dashboard") return pathname === "/dashboard";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const { openAssistant } = useAssistant();
  const location = useLocation();
  const navigate = useNavigate();
  const { setTheme, resolvedTheme } = useTheme();
  const noAnim = settings.preferences?.dashboard?.animations === false || settings.preferences?.accessibility?.reduce_motion === true;
  const [helpOpen, setHelpOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [tourLoaded, setTourLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "true";
    } catch {
      return false;
    }
  });
  const prevPath = useRef(location.pathname);
  const leaderBuffer = useRef([]);
  const dark = resolvedTheme === "dark";

  useKeyboardShortcut("?", () => setHelpOpen((previous) => !previous));

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((previous) => !previous);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      setRouteLoading(true);
      prevPath.current = location.pathname;
      const timer = setTimeout(() => setRouteLoading(false), 400);
      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target.closest("input, textarea, select, [contenteditable]")) return;
      const key = event.key.toLowerCase();
      if (key === "escape") {
        setHelpOpen(false);
        return;
      }
      if (key === "g") {
        leaderBuffer.current = ["g"];
        setTimeout(() => {
          leaderBuffer.current = [];
        }, 800);
        return;
      }
      if (leaderBuffer.current.length === 1 && leaderBuffer.current[0] === "g") {
        leaderBuffer.current = [];
        if (KEYBOARD_GOTO[key]) {
          event.preventDefault();
          navigate(KEYBOARD_GOTO[key]);
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  useEffect(() => {
    const handler = (event) => {
      const { action } = event.detail || {};
      if (action === "new-transaction") {
        window.dispatchEvent(new CustomEvent("app-quick-action", { detail: { action: "open-new-transaction" } }));
      } else if (action === "search-transactions") {
        navigate("/transactions");
        setTimeout(() => window.dispatchEvent(new CustomEvent("app-quick-action", { detail: { action: "focus-search" } })), 100);
      } else if (action === "open-assistant") {
        openAssistant();
      }
    };
    window.addEventListener("command-action", handler);
    return () => window.removeEventListener("command-action", handler);
  }, [navigate, openAssistant]);

  const routeMeta = useMemo(() => getRouteMeta(location.pathname), [location.pathname]);
  const settingsActive = isActivePath(location.pathname, "/settings");
  const moreActive = location.pathname === "/more" || !["/dashboard", "/accounts", "/transactions"].some((path) => isActivePath(location.pathname, path));
  const initials = (user?.name?.[0] || user?.email?.[0] || "P").toUpperCase();

  const toggleTheme = () => setTheme(dark ? "light" : "dark");

  const toggleSidebar = () => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next));
      } catch {
        // Local preference is optional.
      }
      return next;
    });
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
      // Ignore damaged local state.
    }
  }, []);

  const doLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="app-shell relative flex min-h-screen text-foreground lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
      <aside
        data-tour="sidebar"
        className={`sticky top-0 z-40 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-border/45 bg-[linear-gradient(180deg,hsl(150_30%_98%)_0%,hsl(150_18%_94%)_100%)] transition-[width] duration-300 lg:flex dark:bg-[hsl(160_16%_8%)] ${
          collapsed ? "w-[4.75rem]" : "w-[242px]"
        }`}
      >
        <div className={`shrink-0 ${collapsed ? "flex h-16 items-center justify-center px-2" : "flex items-start justify-between px-6 pb-5 pt-[50px]"}`}>
          <Link to="/dashboard" className="flex min-w-0 items-center gap-3" data-testid="sidebar-logo">
            <Logo size={collapsed ? "sm" : "sidebar"} />
            {!collapsed ? (
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[17px] font-semibold tracking-[-0.03em]">{APP_NAME}</span>
                  <span className="rounded-md border border-topaz/25 bg-topaz/10 px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-topaz">
                    Beta
                  </span>
                </span>
              </span>
            ) : null}
          </Link>
          {!collapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              className="mt-2 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="subtle-scroll flex-1 space-y-5 overflow-y-auto px-6 py-3">
          {NAV_SECTIONS.filter((section) => !section.adminOnly || user?.role === "admin").map((section) => (
            <div key={section.label} className="space-y-1">
              {!collapsed ? (
                <p className="px-2.5 pb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                  {section.label}
                </p>
              ) : null}
              {section.items.map(({ to, label, icon: Icon }) => {
                const active = isActivePath(location.pathname, to);
                return (
                  <Link
                    key={to}
                    to={to}
                    data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? label : undefined}
                    className={`group flex items-center rounded-xl border transition-colors ${
                      collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-2.5 py-2"
                    } ${
                      active
                        ? "border-emerald bg-emerald text-white shadow-[0_6px_16px_hsl(var(--emerald)/0.18)]"
                        : "border-transparent text-muted-foreground hover:bg-secondary/55 hover:text-foreground"
                    }`}
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors ${
                      active ? "bg-white/15 text-white" : "text-muted-foreground group-hover:text-foreground"
                    }`}>
                      <Icon className="h-[17px] w-[17px]" strokeWidth={active ? 2.1 : 1.8} />
                    </span>
                    {!collapsed ? (
                      <span className="flex-1 truncate text-[13px] font-medium">{label}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className={`shrink-0 ${collapsed ? "p-2.5" : "px-6 pb-[30px] pt-4"}`}>
          <Link
            to={SETTINGS_NAV_ITEM.to}
            aria-current={settingsActive ? "page" : undefined}
            title={collapsed ? "Settings" : undefined}
            className={`group mb-3 flex items-center rounded-xl border transition-colors ${
              collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-2.5 py-2"
            } ${
              settingsActive
                ? "border-emerald bg-emerald text-white shadow-[0_6px_16px_hsl(var(--emerald)/0.18)]"
                : "border-transparent text-muted-foreground hover:bg-secondary/55 hover:text-foreground"
            }`}
          >
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${settingsActive ? "bg-white/15 text-white" : ""}`}>
              <Settings className="h-[17px] w-[17px]" strokeWidth={settingsActive ? 2.1 : 1.8} />
            </span>
            {!collapsed ? <span className="flex-1 text-[13px] font-medium">Settings</span> : null}
          </Link>

          <div className={`flex items-center rounded-2xl border border-border/60 bg-card shadow-[0_10px_26px_-22px_hsl(var(--foreground)/0.35)] ${collapsed ? "justify-center p-1.5" : "gap-2.5 p-2"}`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald/12 text-[12px] font-semibold text-emerald">
              {initials}
            </span>
            {!collapsed ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">{user?.name || user?.email}</span>
                  <span className="block truncate text-[10.5px] capitalize text-muted-foreground">{user?.tier || "free"} plan</span>
                </span>
                <button
                  type="button"
                  onClick={doLogout}
                  data-testid="logout-button"
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </div>
          {collapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              className="mt-1.5 flex w-full items-center justify-center rounded-lg py-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </aside>

      <div className="relative min-w-0 flex-1 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
        <header data-tour="route-header" className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-md lg:shrink-0">
          {routeLoading ? (
            <div className="absolute left-0 right-0 top-0 z-50 h-0.5 overflow-hidden">
              <div className={`h-full bg-emerald ${noAnim ? "" : "animate-[routeProgress_0.4s_ease-out_forwards]"}`} />
            </div>
          ) : null}
          <h1 className="sr-only">{routeMeta.title} - {APP_NAME}</h1>
          <div className="flex h-[56px] items-center justify-between gap-3 pl-3 pr-3 sm:px-4 lg:pl-[10px] lg:pr-[18px]">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <Link to="/dashboard" className="grid h-9 w-9 shrink-0 place-items-center md:hidden" aria-label={`${APP_NAME} home`}>
                <Logo size="sm" />
              </Link>
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                data-tour="command-search"
                data-testid="command-open"
                className="hidden h-8 w-full max-w-[552px] items-center gap-2.5 rounded-[9px] border border-border/80 bg-card px-3 text-left text-[12px] text-muted-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.03)] transition hover:border-border hover:text-foreground md:flex"
                aria-label="Search or jump to"
              >
                <Search className="h-4 w-4 shrink-0" />
                <span className="truncate">Search transactions, accounts, categories, merchants...</span>
                <kbd className="ml-auto shrink-0 rounded-[6px] border border-border/70 bg-secondary/45 px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground">
                  ⌘ K
                </kbd>
              </button>
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                data-testid="command-open-mobile"
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground md:hidden"
                aria-label="Search or jump to"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => openAssistant()}
                data-tour="assistant-launch-mobile"
                data-testid="assistant-open-mobile"
                className="grid h-9 w-9 place-items-center rounded-full text-emerald transition hover:bg-emerald/10 md:hidden"
                aria-label="Open Penni AI"
              >
                <Sparkles className="h-[18px] w-[18px]" />
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <NotificationCenter />
              <button
                type="button"
                onClick={toggleTheme}
                data-testid="theme-toggle"
                className="hidden h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground sm:grid"
                aria-label="Toggle theme"
                title="Toggle theme"
              >
                {dark ? <Sun className="h-[18px] w-[18px]" /> : <MoonStar className="h-[18px] w-[18px]" />}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ml-0.5 grid h-9 w-9 place-items-center rounded-full bg-emerald/12 text-[11px] font-semibold text-emerald ring-1 ring-emerald/10 transition hover:bg-emerald/15"
                    aria-label="Account menu"
                  >
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="mt-1 min-w-[180px]">
                  <div className="border-b border-border/60 px-3 py-2">
                    <p className="truncate text-xs font-medium">{user?.name || "Penni member"}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
                  </div>
                  <DropdownMenuItem onClick={() => openAssistant()} data-testid="assistant-open">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Ask Penni
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/more")}>
                    <Compass className="mr-2 h-4 w-4" />
                    More tools
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={startTour} data-tour="tour-launch">
                    <Compass className="mr-2 h-4 w-4" />
                    App walk-through
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={doLogout} data-testid="logout-menu-button">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main data-tour="main-content" className="mx-auto w-full max-w-[1440px] px-3 pb-24 pt-3 sm:px-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pl-[10px] lg:pr-[9px] lg:pb-[14px] lg:pt-[21px]">
          <div key={location.pathname} className={noAnim ? "" : "page-in"}>
            <Outlet />
          </div>
        </main>
      </div>

      <nav
        data-tour="mobile-nav"
        className="floating-tabbar tap-highlight-none fixed left-3 right-3 z-40 rounded-[1.4rem] glass-bar lg:hidden"
        aria-label="Main navigation"
      >
        <div className="flex h-[60px] items-center justify-around px-1">
          {BOTTOM_NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/more" ? moreActive : isActivePath(location.pathname, to);
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={`flex h-12 min-w-0 max-w-[76px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors ${
                  active ? "text-emerald" : "text-muted-foreground active:text-foreground"
                }`}
              >
                <span className={`grid h-7 w-10 place-items-center rounded-full transition-colors ${
                  active ? "bg-emerald/10" : ""
                }`}>
                  <Icon className="h-[20px] w-[20px]" strokeWidth={active ? 2.2 : 1.9} />
                </span>
                <span className={`w-full text-center text-[10px] leading-none ${active ? "font-semibold" : "font-medium"}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <KeyboardShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      {tourLoaded ? (
        <Suspense fallback={null}>
          <ProductTour />
        </Suspense>
      ) : null}
    </div>
  );
}

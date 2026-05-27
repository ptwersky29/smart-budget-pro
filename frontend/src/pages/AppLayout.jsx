import React, { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Toaster } from "sonner";
import {
  LayoutDashboard, Receipt, PiggyBank, Building2, TrendingUp, Star,
  Landmark, FileText, Settings, LogOut, Menu, X, MoonStar, Sun, MessageSquare, Upload, Plug, Crown
} from "lucide-react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/statements", label: "Statements", icon: Upload },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/connections", label: "Bank Connections", icon: Building2 },
  { to: "/sms", label: "SMS Finance", icon: MessageSquare },
  { to: "/investments", label: "Investments", icon: TrendingUp },
  { to: "/jewish", label: "Jewish Tools", icon: Star },
  { to: "/uk-tools", label: "UK Benefits", icon: Landmark },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setDark(document.documentElement.classList.contains("dark"));
  };

  const doLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Toaster richColors position="top-right" />
      {/* Sidebar */}
      <aside className={`${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:sticky top-0 left-0 z-40 h-screen w-72 border-r border-border bg-card/50 backdrop-blur-xl transition-transform`}>
        <div className="flex items-center justify-between px-6 h-16 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-2" data-testid="sidebar-logo">
            <div className="w-8 h-8 rounded-xl gradient-emerald grid place-items-center text-white font-bold">£</div>
            <span className="font-semibold tracking-tight">FinanceAI</span>
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)} data-testid="sidebar-close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link key={to} to={to} onClick={() => setOpen(false)} data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}>
                <Icon className="h-4 w-4" />
                <span className="text-sm font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>
        {user?.tier !== "premium" && user?.role !== "admin" && (
          <div className="px-4 mt-2">
            <Link to="/pricing" onClick={() => setOpen(false)} data-testid="sidebar-upgrade"
                  className="block rounded-2xl border-2 border-emerald bg-emerald/5 hover:bg-emerald/10 p-4 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="h-4 w-4 text-emerald" />
                <span className="text-sm font-semibold text-emerald">Upgrade to Premium</span>
              </div>
              <p className="text-xs text-muted-foreground">Unlock AI, bank sync, & more</p>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald">
                £5 / mo →
              </div>
            </Link>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-9 h-9 rounded-full bg-secondary grid place-items-center text-sm font-semibold">
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.tier || "free"} plan</p>
            </div>
            <button onClick={doLogout} title="Logout" data-testid="logout-button" className="text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-20 h-16 border-b border-border bg-background/70 backdrop-blur-xl flex items-center justify-between px-4 lg:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)} data-testid="sidebar-open"><Menu className="h-5 w-5" /></button>
          <div className="hidden lg:block">
            <p className="label-overline">Workspace</p>
            <p className="text-sm font-medium">{user?.name || user?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            {user?.tier !== "premium" && user?.role !== "admin" && (
              <Link to="/pricing" data-testid="topbar-upgrade"
                    className="hidden sm:inline-flex items-center gap-2 px-4 h-9 rounded-full bg-emerald text-white text-sm font-medium hover:opacity-90 transition-opacity">
                <Crown className="h-4 w-4" />
                Upgrade — £5 / mo
              </Link>
            )}
            <button onClick={toggleTheme} data-testid="theme-toggle" className="h-9 w-9 grid place-items-center rounded-full border border-border hover:bg-secondary">
              {dark ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
            </button>
          </div>
        </header>
        <main className="p-4 lg:p-8 max-w-[1600px] mx-auto"><Outlet /></main>
      </div>
    </div>
  );
}

import {
  LayoutDashboard, Receipt, PiggyBank, Building2, TrendingUp, Star,
  Landmark, FileText, Settings, RefreshCcw, MoreHorizontal
} from "lucide-react";

export const BOTTOM_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/settings", label: "More", icon: MoreHorizontal, isMore: true },
];

export const NAV_SECTIONS = [
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

export const ROUTE_META = [
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

export function getRouteMeta(pathname) {
  return ROUTE_META.find((meta) => meta.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) || ROUTE_META[0];
}

export const KEYBOARD_GOTO = { d: "/dashboard", t: "/transactions", b: "/budgets", s: "/subscriptions", r: "/reports", i: "/import", g: "/settings" };

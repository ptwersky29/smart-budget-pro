import {
  LayoutDashboard, Wallet, Receipt, PiggyBank, Building2, TrendingUp, Star,
  Landmark, FileText, Settings, RefreshCcw, MoreHorizontal
} from "lucide-react";

export const BOTTOM_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/settings", label: "More", icon: MoreHorizontal, isMore: true },
];

export const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/accounts", label: "Accounts & Import", icon: Wallet },
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
    secondary: { label: "Accounts & Import", to: "/accounts" },
  },
  {
    paths: ["/transactions"],
    eyebrow: "Transactions",
    title: "Transactions",
    description: "Search, edit, and organise every transaction in one place.",
    primary: { label: "Add transaction", to: "/transactions" },
  },
  {
    paths: ["/budgets"],
    eyebrow: "Budgets",
    title: "Budgets",
    description: "Set simple limits, track progress, and keep spending easy to understand.",
    primary: { label: "Add budget", to: "/budgets" },
    secondary: { label: "View reports", to: "/reports" },
  },
  {
    paths: ["/subscriptions"],
    eyebrow: "Subscriptions",
    title: "Subscriptions",
    description: "Track recurring payments, detect subscriptions from your transactions, and manage them in one place.",
    primary: { label: "Add subscription", to: "/subscriptions" },
  },
  {
    paths: ["/accounts"],
    eyebrow: "Accounts & Import",
    title: "Your accounts.",
    description: "All your bank accounts, wallets, savings, and statement imports in one place.",
    primary: { label: "Connect bank", to: "/accounts" },
    secondary: { label: "Settings", to: "/settings" },
  },
  {
    paths: ["/investments"],
    eyebrow: "Investments",
    title: "Investments",
    description: "Look at future scenarios, growth trends, and simple projection planning.",
  },
  {
    paths: ["/jewish"],
    eyebrow: "Jewish",
    title: "Jewish Finance",
    description: "Maaser, Tzedakah, and holiday planning with a clean modern layout.",
    secondary: { label: "Reports", to: "/reports" },
  },
  {
    paths: ["/uk-tools"],
    eyebrow: "Tools",
    title: "UK Benefits",
    description: "Simple UK finance helpers, calculators, and planning tools.",
  },
  {
    paths: ["/reports"],
    eyebrow: "Reports",
    title: "Reports",
    description: "Review the story behind your money with clearer summaries and exportable reports.",
    primary: { label: "Download report", to: "/reports" },
    secondary: { label: "Dashboard", to: "/dashboard" },
  },
  {
    paths: ["/accounts/legacy", "/accounts/"],
    eyebrow: "Account",
    title: "Account Details",
    description: "View transactions, settings, and balance for this bank account.",
  },
  {
    paths: ["/settings"],
    eyebrow: "Settings",
    title: "Settings",
    description: "Manage your account, subscription, AI providers, integrations, and SMS settings.",
    primary: { label: "Pricing", to: "/pricing" },
    secondary: { label: "Accounts & Import", to: "/accounts" },
  },
];

export function getRouteMeta(pathname) {
  return ROUTE_META.find((meta) => meta.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) || ROUTE_META[0];
}

export const KEYBOARD_GOTO = { d: "/dashboard", t: "/transactions", b: "/budgets", s: "/subscriptions", r: "/reports", a: "/accounts", g: "/settings" };

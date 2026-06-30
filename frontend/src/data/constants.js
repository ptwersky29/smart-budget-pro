export const APP_NAME = "FinanceAI";
export const APP_TAGLINE = "Premium money workspace";
export const COPYRIGHT = "\u00a9 2026 FinanceAI. Built for the UK & the heimishe community.";
export const CURRENCY_SYMBOL = "\u00a3";

export const PAGES = {
  DASHBOARD: "/dashboard",
  TRANSACTIONS: "/transactions",
  BUDGETS: "/budgets",
  SUBSCRIPTIONS: "/subscriptions",
  REPORTS: "/reports",
  SETTINGS: "/settings",
  CATEGORIES: "/settings/categories",
  ACCOUNTS: "/accounts",
  INVESTMENTS: "/investments",
  JEWISH: "/jewish",
  UK_TOOLS: "/uk-tools",
  PRICING: "/pricing",
};

export const TIERS = {
  FREE: "free",
  PREMIUM: "premium",
  ADMIN: "admin",
};

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
};

export const AI = {
  FREE_DAILY_LIMIT: 5,
  PREMIUM_DAILY_LIMIT: Infinity,
  PROVIDERS: ["openai", "anthropic", "google", "openrouter"],
};

export const FEATURE_FLAGS = {
  BANK_SYNC: "premium",
  AI_INSIGHTS: "free",
  PREMIUM_REPORTS: "premium",
};

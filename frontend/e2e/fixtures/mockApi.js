const users = {
  newUser: {
    user_id: "user_new",
    email: "new@example.com",
    name: "New User",
    role: "free_user",
    tier: "free",
    onboarded: false,
    preferences: {},
  },
  returningUser: {
    user_id: "user_returning",
    email: "returning@example.com",
    name: "Rivka Cohen",
    role: "premium_user",
    tier: "premium",
    onboarded: true,
    preferences: {},
  },
  adminUser: {
    user_id: "user_admin",
    email: "admin@example.com",
    name: "Admin User",
    role: "admin",
    tier: "premium",
    onboarded: true,
    preferences: {},
  },
};

const account = {
  account_id: "acct_main",
  id: "acct_main",
  name: "Everyday Current",
  type: "current",
  balance: 2840.55,
  currency: "GBP",
  provider: "manual",
  is_offline: true,
  include_in_total: true,
  color: "#047857",
};

const transactions = [
  {
    tx_id: "tx_income",
    transaction_id: "tx_income",
    date: "2026-07-01",
    description: "Salary",
    merchant: "Employer",
    amount: 3200,
    category: "Income",
    is_income: true,
    source: "manual",
    account_id: "acct_main",
  },
  {
    tx_id: "tx_grocery",
    transaction_id: "tx_grocery",
    date: "2026-07-02",
    description: "Groceries",
    merchant: "Tesco",
    amount: -82.45,
    category: "Food",
    is_income: false,
    source: "manual",
    account_id: "acct_main",
  },
];

const budgets = [
  {
    budget_id: "budget_food",
    category: "Food",
    limit: 450,
    amount: 450,
    spent: 182.45,
    remaining: 267.55,
    progress_pct: 41,
    month: "2026-07",
    budget_type: "everyday",
  },
  {
    budget_id: "budget_travel",
    category: "Travel",
    limit: 120,
    amount: 120,
    spent: 130,
    remaining: -10,
    progress_pct: 108,
    month: "2026-07",
    budget_type: "everyday",
  },
];

const categories = [
  { id: "cat_income", name: "Income", section: "Income", type: "income" },
  { id: "cat_food", name: "Food", section: "Variable", type: "expense" },
  { id: "cat_travel", name: "Travel", section: "Variable", type: "expense" },
  { id: "cat_uncategorized", name: "Uncategorized", section: "Other", type: "expense" },
];

function validJwt(payload = {}) {
  const body = {
    sub: "user_returning",
    type: "access",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payload,
  };
  return `e2e.${btoa(JSON.stringify(body))}.sig`;
}

async function installApiMocks(page, { user = users.returningUser, latency = 0, forceError = false } = {}) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "") || "/";
    const method = request.method();

    if (latency) {
      await new Promise((resolve) => setTimeout(resolve, latency));
    }

    if (forceError && path !== "/auth/me" && path !== "/csrf-token") {
      return json(route, { detail: "The service is temporarily unavailable. Please try again." }, 503);
    }

    if (path === "/" || path === "/health") {
      return json(route, { status: "ok", app: "FinanceAI", checks: { database: "connected" } });
    }
    if (path === "/csrf-token") return json(route, { csrf_token: "csrf-e2e" });
    if (path === "/auth/me") return json(route, user);
    if (path === "/auth/login" || path === "/auth/register") {
      return json(route, {
        ...users.returningUser,
        access_token: validJwt(),
        refresh_token: validJwt({ type: "refresh" }),
      });
    }
    if (path === "/auth/logout") return json(route, { ok: true });
    if (path === "/gdpr/consent") return json(route, { current: { privacy: true, terms: true, marketing: false } });
    if (path === "/settings/app") return json(route, { language: "en", theme: "system", currency: "GBP", preferences: {} });
    if (path === "/categories") return json(route, { categories, hierarchy: { Variable: categories.slice(1, 3) } });
    if (path === "/accounts") return json(route, { accounts: [account] });
    if (path === "/accounts/overview/balances") return json(route, { accounts: [account], total_balance: account.balance });
    if (path.startsWith("/accounts/")) return json(route, { account, transactions });
    if (path === "/truelayer/connections") return json(route, { connections: [] });
    if (path === "/accounts/manual") return json(route, { accounts: [account] });
    if (path === "/dashboard/overview") {
      return json(route, {
        net_worth: 2840.55,
        balance: 2387.55,
        income: 3200,
        spend: 812.45,
        spending: 812.45,
        savings_rate: 74,
        grade: "A",
        health_score: 82,
        category_spend: [{ name: "Food", value: 182.45 }, { name: "Travel", value: 130 }],
        subscriptions: { value: 49.99 },
        truelayer_balance: 2840.55,
        accounts: [account],
        recent: transactions,
        monthly_flow: [
          { month: "May", income: 3100, spend: 1900 },
          { month: "Jun", income: 3200, spend: 1840 },
          { month: "Jul", income: 3200, spend: 812.45 },
        ],
      });
    }
    if (path === "/transactions" && method === "GET") {
      return json(route, { transactions, total: transactions.length, income_total: 3200, expense_total: 812.45 });
    }
    if (path === "/transactions" && method === "POST") return json(route, { ok: true, transaction: transactions[1] });
    if (path === "/budgets") return json(route, { budgets, groups: [], total_budget: 570, total_spent: 312.45 });
    if (path === "/budget-system/alerts" || path === "/budgets/alerts") {
      return json(route, { alerts: [{ severity: "warning", title: "Travel is over budget", description: "Review recent transport spend." }] });
    }
    if (path === "/budget-system/upcoming") return json(route, { upcoming: [{ name: "Rent", amount: 1200, date: "2026-07-05" }] });
    if (path.startsWith("/jewish/maaser")) return json(route, { enabled: true, percent: 10, balance_owed: 0, entries: [] });
    if (path.startsWith("/jewish") || path.startsWith("/reports")) return json(route, { ok: true, items: [], summary: {} });
    if (path.startsWith("/investments")) return json(route, { holdings: [], portfolio: {}, market: [] });
    if (path.startsWith("/subscriptions")) return json(route, { subscriptions: [] });
    if (path.startsWith("/statements")) return json(route, { statements: [] });
    if (path.startsWith("/sms")) return json(route, { senders: [], messages: [], inbox: [] });
    if (path.startsWith("/notifications")) return json(route, { notifications: [], unread_count: 0 });
    if (path.startsWith("/admin")) return json(route, { users: [], feature_flags: [], summary: {}, metrics: {} });
    if (path.startsWith("/billing")) return json(route, { ok: true, packages: [], subscription: null });
    if (path.startsWith("/integrations")) return json(route, { status: "not_configured", integrations: [] });
    if (path.startsWith("/uk")) return json(route, { take_home: 42000, monthly_take_home: 3500, effective_rate_pct: 27 });
    if (path.startsWith("/ai")) return json(route, { insights: [], message: "Mocked insight" });
    if (path.startsWith("/empty-states")) return json(route, { empty: false, guide: [] });
    if (path.startsWith("/onboarding")) return json(route, { completed: false, current_step: "accounts" });

    return json(route, { ok: true, data: [], items: [] });
  });
}

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

module.exports = { installApiMocks, users, validJwt };

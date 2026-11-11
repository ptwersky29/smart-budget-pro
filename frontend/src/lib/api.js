import axios from "axios";
import { cacheGet, cacheSet, cacheInvalidate, dedupe } from "./cache";
import { getToken, setToken, clearTokens } from "./storage";
import { isPublicDemo } from "./demoSession";

// Always use the configured backend URL (Render), even when running locally.
// This avoids needing a local backend server to use the deployed app.
const DEFAULT_BACKEND = "https://budget-pro-4jlg.onrender.com";

export const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND).replace(/\/+$/, "");
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

const OFFLINE_CACHE_KEY = "penni.offline-api-cache.v1";
const OFFLINE_CACHE_LIMIT = 80;

function offlineCacheKey(url, params) {
  return `${url || ""}::${JSON.stringify(params || {})}`;
}

function readOfflineCache() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeOfflineCache(entries) {
  try {
    const sorted = Object.entries(entries)
      .sort(([, a], [, b]) => (b.savedAt || 0) - (a.savedAt || 0))
      .slice(0, OFFLINE_CACHE_LIMIT);
    localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(Object.fromEntries(sorted)));
  } catch {
    // Offline caching is best-effort; quota limits must not interrupt the app.
  }
}

function cacheOfflineResponse(config, data) {
  // Never persist brokerage balances to localStorage / the offline cache.
  if (String(config?.url || "").startsWith("/trading212/")) return;
  if (config?.method?.toLowerCase() !== "get" || !config?.url) return;
  const entries = readOfflineCache();
  entries[offlineCacheKey(config.url, config.params)] = { data, savedAt: Date.now() };
  writeOfflineCache(entries);
}

function getOfflineResponse(config) {
  if (String(config?.url || "").startsWith("/trading212/")) return null;
  const entry = readOfflineCache()[offlineCacheKey(config?.url, config?.params)];
  return entry?.data ?? offlineDemoResponse(config);
}

function offlineDemoResponse(config) {
  const url = String(config?.url || "").split("?")[0];
  const today = new Date();
  const isoDate = (daysAgo) => {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString();
  };
  const transactions = [
    ["demo-1", "Salary", 3200, "income", 1],
    ["demo-2", "Tesco Express", -42.5, "grocery", 2],
    ["demo-3", "TfL Travel", -7.2, "public_transport", 3],
    ["demo-4", "Octopus Energy", -85.4, "utilities", 5],
    ["demo-5", "Coffee Corner", -4.8, "takeaway", 6],
    ["demo-6", "Netflix", -10.99, "entertainment", 9],
  ].map(([transaction_id, description, amount, category, daysAgo]) => ({
    transaction_id,
    description,
    merchant_name: description,
    normalized_merchant: description,
    amount,
    category,
    date: isoDate(daysAgo),
    account_id: "demo-current",
    account_name: "Penni Demo Account",
    currency: "GBP",
    approval_status: "approved",
    pending: false,
    source: "offline-demo",
  }));
  const accounts = [{
    account_id: "demo-current",
    account_name: "Penni Demo Account",
    name: "Penni Demo Account",
    account_type: "current",
    type: "current",
    balance: 1842.61,
    currency: "GBP",
    provider: "manual",
    is_offline: true,
    color: "#10b981",
    institution: "Penni",
  }];
  const budgets = [
    ["Grocery", 320, 198.4],
    ["Public Transport", 120, 64.2],
    ["Utilities", 180, 85.4],
    ["Eating Out", 140, 96.8],
  ].map(([category, limit, spent], index) => ({
    budget_id: `demo-budget-${index}`,
    category,
    limit,
    spent,
    remaining: limit - spent,
    progress_pct: Math.round((spent / limit) * 100),
    budget_type: "everyday",
    month: today.toISOString().slice(0, 7),
  }));

  if (url === "/dashboard/overview") {
    return {
      balance: 1842.61,
      truelayer_balance: 1842.61,
      accounts,
      income: 3200,
      spend: 249.49,
      savings_rate: 92.2,
      health_score: 92,
      categories: [
        { name: "Grocery", value: 198.4 },
        { name: "Eating Out", value: 96.8 },
        { name: "Utilities", value: 85.4 },
        { name: "Public Transport", value: 64.2 },
      ],
      monthly_flow: [{ month: today.toISOString().slice(0, 7), income: 3200, spend: 249.49 }],
      recent: transactions,
      needs_review_count: 0,
      source_breakdown: [{ source: "offline-demo", count: transactions.length }],
    };
  }
  if (url === "/transactions") {
    const requestedAccount = config?.params?.account_id;
    const matches = requestedAccount ? transactions.filter(t => t.account_id === requestedAccount) : transactions;
    return { transactions: matches, total: matches.length, offset: 0, limit: 100 };
  }
  if (url === "/budgets") return { budgets, event_groups: {} };
  if (url === "/accounts") return { accounts };
  if (url === "/categories") return { categories: budgets.map((budget) => ({ name: budget.category })) };
  if (url === "/budget-system/alerts") return { alerts: [] };
  if (url === "/budget-system/upcoming") return { upcoming: [] };
  if (url === "/budgets/insights") return { insights: [] };
  if (url === "/truelayer/connections") return { connections: [], total_transactions: transactions.length };
  if (url === "/notifications") return [];
  if (url === "/analytics/spending-by-category") return { categories: budgets.map(b=>({category:b.category,value:b.spent})) };
  if (url === "/analytics/spending-trends") return { trends:[] };
  if (url === "/analytics/period-comparison") return { current:{income:3200,spend:249.49},previous:{income:0,spend:0} };
  if (url === "/analytics/budget-comparison") return { comparisons:budgets.map(b=>({category:b.category,budget:b.limit,spent:b.spent,remaining:b.remaining,progress_pct:b.progress_pct})) };
  if (url === "/subscriptions") return { subscriptions:[] };
  if (url === "/investments") return { investments:[],accounts:[] };
  if (url === "/statements/history") return { history:[],statements:[] };
  return null;
}

let _csrfToken = null;
// One refresh request for all simultaneous 401 responses. Refresh tokens rotate.
let refreshPromise = null;

async function _ensureCsrf() {
  if (_csrfToken) return _csrfToken;
  try {
    const { data } = await axios.get(`${API}/csrf-token`, { withCredentials: true });
    _csrfToken = data.csrf_token;
  } catch { console.warn("[csrf] failed to fetch token — unsafe requests may fail"); }
  return _csrfToken;
}

const SAFE_METHODS = new Set(["get", "head", "options"]);

export function demoReadOnlyError() {
  const error = new Error("This is a read-only demo. Create a free account to save changes.");
  error.code = "PENNI_DEMO_READ_ONLY";
  error.response = { status: 403, data: { detail: error.message } };
  return error;
}

function demoResponse(config) {
  const url = String(config.url || "").split("?")[0];
  const mock = offlineDemoResponse(config);
  // Fail closed: never fall through to the real backend, even for an
  // unfamiliar endpoint. No authenticated or cached user information leaks.
  const data = mock !== null ? mock : (
    url === "/settings/app" ? { theme:"light", currency:"GBP", preferences:{} } :
    url === "/notifications" ? [] :
    url === "/jewish/maaser/summary" ? { balance: 0, total_due:0, total_given:0 } :
    url === "/jewish/maaser/ledger" ? { ledger:[], entries:[] } :
    url === "/jewish/maaser/settings" ? { settings:{} } :
    url === "/analytics/spending-by-category" ? { categories:[] } :
    { transactions:[], accounts:[], budgets:[], categories:[], items:[], rows:[], data:[], connections:[], history:[], alerts:[], upcoming:[] }
  );
  return { data: JSON.parse(JSON.stringify(data)), status:200, statusText:"Offline demo", headers:{ "x-penni-demo":"read-only" }, config, request:{} };
}


api.interceptors.request.use(async (config) => {
  if (isPublicDemo()) {
    const method = String(config.method || "get").toLowerCase();
    if (method !== "get" && method !== "head" && method !== "options")
      return Promise.reject(demoReadOnlyError());
    config.adapter = async request => demoResponse(request);
    config.withCredentials = false;
    delete config.headers.Authorization;
    return config;
  }
  const token = getToken("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (!SAFE_METHODS.has(config.method?.toLowerCase())) {
    const csrf = await _ensureCsrf();
    if (csrf) {
      config.headers["X-CSRF-Token"] = csrf;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (isPublicDemo()) return response;
    const method = response.config?.method?.toLowerCase();
    cacheOfflineResponse(response.config, response.data);
    if (method && !SAFE_METHODS.has(method)) {
      cacheInvalidate(response.config.url);
    }
    return response;
  },
  async (error) => {
    if (isPublicDemo()) return Promise.reject(error);
    const originalRequest = error.config || {};
    const requestUrl = String(originalRequest.url || "");
    if (!error?.response && originalRequest.method?.toLowerCase() === "get") {
      const cachedData = getOfflineResponse(originalRequest);
      if (cachedData !== null) {
        return {
          data: cachedData,
          status: 200,
          statusText: "Offline cache",
          headers: { "x-penni-offline": "true" },
          config: originalRequest,
        };
      }
    }
    if (
      error?.response?.status === 401 &&
      !originalRequest._retry &&
      !requestUrl.includes("/auth/refresh") &&
      !requestUrl.includes("/auth/login") &&
      !requestUrl.includes("/auth/register") &&
      !requestUrl.includes("/auth/forgot-password") &&
      !requestUrl.includes("/auth/reset-password") &&
      !requestUrl.includes("/auth/google") &&
      !requestUrl.includes("/auth/emergent-session") &&
      !requestUrl.includes("/gdpr/")
    ) {
      originalRequest._retry = true;
      const hadCredentials = Boolean(getToken("access_token") || getToken("refresh_token"));
      try {
        if (!refreshPromise) {
          refreshPromise = (async () => {
            const storedRt = getToken("refresh_token");
            const csrf = await _ensureCsrf();
            const refreshHeaders = {
              ...(storedRt ? { Authorization: `Bearer ${storedRt}` } : {}),
              ...(csrf ? { "X-CSRF-Token": csrf } : {}),
            };
            const response = await axios.post(`${API}/auth/refresh`, {}, {
              withCredentials: true, headers: refreshHeaders,
            });
            if (response?.data?.access_token) {
              setToken("access_token", response.data.access_token, true);
            }
            if (response?.data?.refresh_token) {
              setToken("refresh_token", response.data.refresh_token, true);
            }
            return response;
          })().finally(() => { refreshPromise = null; });
        }
        await refreshPromise;
        return api(originalRequest);
      } catch (refreshError) {
        console.warn("[auth] session refresh failed", refreshError?.response?.status);
        clearTokens();
        if (hadCredentials && typeof window !== "undefined" &&
            !window.location.pathname.startsWith("/login")) {
          window.location.assign("/login?expired=1");
        }
      }
    }
    return Promise.reject(error);
  }
);

api.cachedGet = async (url, params = {}, ttl) => {
  if (isPublicDemo()) return (await api.get(url, {params})).data;
  const cached = cacheGet(url, params);
  if (cached) return cached;
  const { data } = await dedupe(url, params, () => api.get(url, { params }));
  cacheSet(url, params, data, ttl);
  return data;
};

api.invalidate = (prefix) => cacheInvalidate(prefix);

export function formatApiError(errorOrDetail) {
  const payload = errorOrDetail?.response?.data ?? errorOrDetail;
  const detail = payload?.detail ?? payload?.message ?? payload;
  const requestId = payload?.request_id || errorOrDetail?.response?.headers?.["x-request-id"];

  let message;
  if (detail == null) {
    message = "Something went wrong. Please try again.";
  } else if (typeof detail === "string") {
    message = detail;
  } else if (Array.isArray(detail)) {
    message = detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : e?.message || JSON.stringify(e)))
      .join(" ");
  } else if (typeof detail.msg === "string") {
    message = detail.msg;
  } else if (typeof detail.message === "string") {
    message = detail.message;
  } else {
    message = "Something went wrong. Please try again.";
  }

  return requestId ? `${message} (Ref ${requestId})` : message;
}

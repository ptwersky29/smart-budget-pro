import axios from "axios";
import { cacheInvalidate, dedupe, swr } from "./cache";
import { getToken, setToken, clearTokens } from "./storage";
import { isPublicDemo } from "./demoSession";

// Always use the configured backend URL (Render), even when running locally.
// This avoids needing a local backend server to use the deployed app.
const DEFAULT_BACKEND = "https://budget-pro-4jlg.onrender.com";

export const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND).replace(/\/+$/, "");
export const API = `${BACKEND_URL}/api`;

const API_TIMEOUT_MS = Number(process.env.REACT_APP_API_TIMEOUT) || 45_000;
const SLOW_REQUEST_MS = 4_000;
const MAX_RETRIES = 2;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
  timeout: API_TIMEOUT_MS,
});

// ── Offline cache (per-response keys, written off the request path) ──────────
// The previous implementation parsed and re-stringified one 80-entry JSON blob
// on every successful GET, on the main thread. Each response now owns a single
// localStorage key and writes are coalesced into an idle callback.

const OFFLINE_PREFIX = "penni.api.v2:";
const LEGACY_OFFLINE_KEY = "penni.offline-api-cache.v1";
const OFFLINE_CACHE_LIMIT = 60;
const OFFLINE_ENTRY_MAX_CHARS = 200_000;

const pendingWrites = new Map();
let flushHandle = null;
let writesSincePrune = 0;
let legacyMigrationDone = false;

function offlineStorageKey(url, params) {
  const raw = `${url || ""}::${JSON.stringify(params || {})}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  const readable = raw.slice(0, 60).replace(/[^a-zA-Z0-9/_.:-]/g, "_");
  return `${OFFLINE_PREFIX}${(hash >>> 0).toString(36)}:${readable}`;
}

function storageAvailable() {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function scheduleIdle(fn) {
  if (typeof window === "undefined") return;
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(fn, { timeout: 2_000 });
  } else {
    setTimeout(fn, 0);
  }
}

function pruneOfflineCache() {
  if (!storageAvailable()) return;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(OFFLINE_PREFIX)) keys.push(key);
    }
    if (keys.length <= OFFLINE_CACHE_LIMIT) return;
    const dated = keys.map((key) => {
      let savedAt = 0;
      try { savedAt = JSON.parse(localStorage.getItem(key) || "{}").savedAt || 0; } catch { /* corrupt entry */ }
      return { key, savedAt };
    });
    dated.sort((a, b) => a.savedAt - b.savedAt);
    const excess = dated.length - OFFLINE_CACHE_LIMIT;
    for (let i = 0; i < excess; i += 1) localStorage.removeItem(dated[i].key);
  } catch {
    // Pruning is best-effort; quota errors must never interrupt the app.
  }
}

function flushOfflineCache() {
  flushHandle = null;
  if (!storageAvailable() || pendingWrites.size === 0) return;
  const entries = Array.from(pendingWrites.entries());
  pendingWrites.clear();
  for (const [key, payload] of entries) {
    try {
      const serialised = JSON.stringify(payload);
      if (serialised.length > OFFLINE_ENTRY_MAX_CHARS) continue;
      localStorage.setItem(key, serialised);
    } catch {
      // Quota exceeded — drop the write rather than break the request flow.
    }
  }
  writesSincePrune += entries.length;
  if (writesSincePrune >= 10) {
    writesSincePrune = 0;
    pruneOfflineCache();
  }
}

function scheduleFlush() {
  if (flushHandle !== null) return;
  flushHandle = setTimeout(() => scheduleIdle(flushOfflineCache), 250);
}

function migrateLegacyCache() {
  if (legacyMigrationDone || !storageAvailable()) return;
  legacyMigrationDone = true;
  try {
    const raw = localStorage.getItem(LEGACY_OFFLINE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    for (const [compositeKey, entry] of Object.entries(parsed || {})) {
      const [url, paramsJson] = String(compositeKey).split("::");
      let params = {};
      try { params = JSON.parse(paramsJson || "{}"); } catch { /* keep {} */ }
      if (!url || !entry?.data) continue;
      try {
        localStorage.setItem(
          offlineStorageKey(url, params),
          JSON.stringify({ data: entry.data, savedAt: entry.savedAt || Date.now() })
        );
      } catch { break; }
    }
    localStorage.removeItem(LEGACY_OFFLINE_KEY);
  } catch {
    // Corrupt legacy cache — discard it.
    try { localStorage.removeItem(LEGACY_OFFLINE_KEY); } catch { /* ignore */ }
  }
}

function cacheOfflineResponse(config, data) {
  if (isPublicDemo()) return;
  // Never persist brokerage balances to localStorage / the offline cache.
  if (String(config?.url || "").startsWith("/trading212/")) return;
  if (config?.method?.toLowerCase() !== "get" || !config?.url) return;
  if (data == null) return;
  pendingWrites.set(offlineStorageKey(config.url, config.params), {
    data,
    savedAt: Date.now(),
  });
  scheduleFlush();
}

function getOfflineResponse(config) {
  if (!storageAvailable()) return null;
  if (String(config?.url || "").startsWith("/trading212/")) return null;
  try {
    const raw = localStorage.getItem(offlineStorageKey(config?.url, config?.params));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    return entry?.data != null ? entry : null;
  } catch {
    return null;
  }
}

export function clearOfflineCache() {
  pendingWrites.clear();
  if (!storageAvailable()) return;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(OFFLINE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(LEGACY_OFFLINE_KEY);
  } catch {
    // ignore
  }
}

if (typeof window !== "undefined") {
  scheduleIdle(migrateLegacyCache);
}

function emit(name, detail) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // CustomEvent unavailable in some test environments.
  }
}

function armSlowTimer(config) {
  if (typeof window === "undefined" || !config || config._slowTimer) return;
  config._slowTimer = setTimeout(() => {
    config._slowTimer = null;
    emit("penni:slow-request", { url: config.url });
  }, SLOW_REQUEST_MS);
}

function clearSlowTimer(config) {
  if (config?._slowTimer) {
    clearTimeout(config._slowTimer);
    config._slowTimer = null;
  }
}

// ── Demo mode ────────────────────────────────────────────────────────────────

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

let _csrfToken = null;
// One refresh request for all simultaneous 401 responses. Refresh tokens rotate.
let refreshPromise = null;

async function _ensureCsrf() {
  if (_csrfToken) return _csrfToken;
  try {
    const { data } = await axios.get(`${API}/csrf-token`, { withCredentials: true, timeout: 10_000 });
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

function isCanceled(error) {
  return error?.name === "CanceledError" || error?.code === "ERR_CANCELED";
}

function retryDelayMs(error, attempt) {
  const retryAfter = error?.response?.headers?.["retry-after"];
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 5_000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 0), 5_000);
  }
  const base = Math.min(300 * 2 ** attempt, 2_000);
  return base + Math.floor(Math.random() * 250);
}

function isRetryable(error, config) {
  if (!config) return false;
  if (isPublicDemo()) return false;
  if (String(config.method || "get").toLowerCase() !== "get") return false;
  if (config._retryCount >= MAX_RETRIES) return false;
  if (config._skipRetry) return false;
  if (isCanceled(error)) return false;
  // Cancelled by the caller (route change) — never retry.
  if (config.signal?.aborted) return false;
  if (!error.response) {
    // Network failure or connection reset — retry. Timeouts are surfaced so the
    // user can decide rather than waiting through a second full timeout.
    return error.code !== "ECONNABORTED" && error.code !== "ETIMEDOUT";
  }
  return [408, 425, 429, 500, 502, 503, 504].includes(error.response.status);
}

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function refreshSession(originalRequest) {
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
          withCredentials: true,
          headers: refreshHeaders,
          timeout: API_TIMEOUT_MS,
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
    const status = refreshError?.response?.status;
    console.warn("[auth] session refresh failed", status);
    // Only an explicit auth rejection clears the session. A network blip must
    // not log the user out of an app they can still read offline.
    if (status === 401 || status === 403) {
      clearTokens();
      clearOfflineCache();
      if (hadCredentials && typeof window !== "undefined" &&
          !window.location.pathname.startsWith("/login")) {
        window.location.assign("/login?expired=1");
      }
    }
    throw refreshError;
  }
}

// ── Interceptors ─────────────────────────────────────────────────────────────

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
  armSlowTimer(config);
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
    clearSlowTimer(response.config);
    if (isPublicDemo()) return response;
    const method = response.config?.method?.toLowerCase();
    cacheOfflineResponse(response.config, response.data);
    emit("penni:request-ok", { url: response.config?.url });
    if (method && !SAFE_METHODS.has(method)) {
      cacheInvalidate(response.config.url);
    }
    return response;
  },
  async (error) => {
    clearSlowTimer(error?.config);
    if (isPublicDemo()) return Promise.reject(error);
    const originalRequest = error.config || {};
    const requestUrl = String(originalRequest.url || "");

    if (isCanceled(error)) return Promise.reject(error);

    // Real cached data only. Demo fixtures are scoped to demo mode above; a
    // logged-in user offline must never be shown invented balances.
    if (!error?.response && originalRequest.method?.toLowerCase() === "get") {
      const cached = getOfflineResponse(originalRequest);
      if (cached) {
        emit("penni:offline-response", { url: originalRequest.url, savedAt: cached.savedAt });
        return {
          data: cached.data,
          status: 200,
          statusText: "Offline cache",
          headers: {
            "x-penni-offline": "true",
            "x-penni-cached-at": new Date(cached.savedAt).toISOString(),
          },
          config: originalRequest,
          request: {},
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
      return refreshSession(originalRequest);
    }

    if (isRetryable(error, originalRequest)) {
      const attempt = originalRequest._retryCount || 0;
      originalRequest._retryCount = attempt + 1;
      await wait(retryDelayMs(error, attempt));
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);

// ── Public helpers ───────────────────────────────────────────────────────────

api.cachedGet = async (url, params = {}, ttl) => {
  if (isPublicDemo()) return (await api.get(url, {params})).data;
  return swr(url, params, async () => (await api.get(url, { params })).data, ttl).fresh;
};

/** Cached value + background refresh. Never rejects when a cached value exists. */
api.swrGet = (url, params = {}, ttl) => {
  if (isPublicDemo()) {
    return {
      cached: null,
      timestamp: null,
      stale: false,
      fresh: api.get(url, { params }).then((r) => r.data),
    };
  }
  return swr(url, params, async () => (await api.get(url, { params })).data, ttl);
};

api.invalidate = (prefix) => cacheInvalidate(prefix);
api.clearOfflineCache = clearOfflineCache;

/** Wake a sleeping backend while the shell renders. Fire-and-forget. */
api.warmup = () => {
  if (isPublicDemo()) return Promise.resolve();
  return axios.get(`${API}/health`, { timeout: 20_000 }).catch(() => {});
};

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

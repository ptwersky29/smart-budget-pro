import axios from "axios";
import { cacheGet, cacheSet, cacheInvalidate, dedupe } from "./cache";
import { getToken, setToken, clearTokens } from "./storage";

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
  if (config?.method?.toLowerCase() !== "get" || !config?.url) return;
  const entries = readOfflineCache();
  entries[offlineCacheKey(config.url, config.params)] = { data, savedAt: Date.now() };
  writeOfflineCache(entries);
}

function getOfflineResponse(config) {
  const entry = readOfflineCache()[offlineCacheKey(config?.url, config?.params)];
  return entry?.data ?? null;
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

api.interceptors.request.use(async (config) => {
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
    const method = response.config?.method?.toLowerCase();
    cacheOfflineResponse(response.config, response.data);
    if (method && !SAFE_METHODS.has(method)) {
      cacheInvalidate(response.config.url);
    }
    return response;
  },
  async (error) => {
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

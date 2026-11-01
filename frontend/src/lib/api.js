import axios from "axios";
import { cacheGet, cacheSet, cacheInvalidate, dedupe } from "./cache";
import { getToken, setToken, clearTokens } from "./storage";

// Always use the configured backend URL (Render), even when running locally.
// This avoids needing a local backend server to use the deployed app.
const DEFAULT_BACKEND = "https://budget-pro-4jlg.onrender.com";

export const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND).replace(/\/+$/, "");
export const API = `${BACKEND_URL}/api`;

// Render may take time to wake up; never leave authentication waiting forever.
const AUTH_TIMEOUT_MS = 45000;
const CSRF_TIMEOUT_MS = 15000;
// These routes are explicitly exempt from CSRF by the FastAPI middleware.
const CSRF_EXEMPT_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
  "/auth/emergent-session",
]);

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

let _csrfToken = null;

async function _ensureCsrf() {
  if (_csrfToken) return _csrfToken;
  try {
    const { data } = await axios.get(`${API}/csrf-token`, { withCredentials: true, timeout: CSRF_TIMEOUT_MS });
    _csrfToken = data.csrf_token;
  } catch { console.warn("[csrf] failed to fetch token — unsafe requests may fail"); }
  return _csrfToken;
}

const SAFE_METHODS = new Set(["get", "head", "options"]);

api.interceptors.request.use(async (config) => {
  const requestPath = String(config.url || "").split("?")[0];
  if ((requestPath === "/auth/login" || requestPath === "/auth/me") && config.timeout == null) {
    config.timeout = AUTH_TIMEOUT_MS;
  }
  const token = getToken("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (!SAFE_METHODS.has(config.method?.toLowerCase()) && !CSRF_EXEMPT_PATHS.has(requestPath)) {
    const csrf = await _ensureCsrf();
    if (csrf) {
      config.headers["X-CSRF-Token"] = csrf;
    }
  }
  return config;
});

// A single refresh request must serve all simultaneous 401 responses.
// Rotating refresh tokens separately for every request revokes the other requests.
let refreshInFlight = null;

function refreshAuthTokens() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const storedRt = getToken("refresh_token");
      // Respect "Remember me" rather than silently converting a session into
      // a persistent login each time a new access token is issued.
      const persistent = localStorage.getItem("refresh_token") !== null;
      const csrf = storedRt ? null : await _ensureCsrf();
      const headers = {
        ...(storedRt ? { Authorization: `Bearer ${storedRt}` } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      };
      const { data } = await axios.post(`${API}/auth/refresh`, {}, {
        withCredentials: true,
        headers,
        timeout: AUTH_TIMEOUT_MS,
      });
      if (!data?.access_token) {
        throw new Error("Token refresh returned no access token");
      }
      setToken("access_token", data.access_token, persistent);
      if (data.refresh_token) setToken("refresh_token", data.refresh_token, persistent);
      return data;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => {
    const method = response.config?.method?.toLowerCase();
    if (method && !SAFE_METHODS.has(method)) {
      cacheInvalidate(response.config.url);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config || {};
    const requestUrl = String(originalRequest.url || "");
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
      !requestUrl.includes("/gdpr/") &&
      // Don't refresh or redirect anonymous visitors on public pages.
      (getToken("access_token") || getToken("refresh_token"))
    ) {
      originalRequest._retry = true;
      try {
        await refreshAuthTokens();
        return api(originalRequest);
      } catch (refreshError) {
        const status = refreshError?.response?.status;
        if (status === 401 || status === 403) {
          // The server has definitively rejected the refresh token.
          clearTokens();
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
            window.location.assign("/login?expired=1");
          }
        }
        // Network failures or an unavailable server must NOT erase a valid session.
        return Promise.reject(refreshError);
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

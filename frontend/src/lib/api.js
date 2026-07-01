import axios from "axios";
import { cacheGet, cacheSet, cacheInvalidate, dedupe } from "./cache";
import { getToken, setToken, clearTokens } from "./storage";

const fallbackBackend = typeof window !== "undefined" && (
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1"
)
  ? (process.env.REACT_APP_BACKEND_URL || "https://budget-pro-4jlg.onrender.com")
  : "http://localhost:8000";

export const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || fallbackBackend).replace(/\/+$/, "");
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

let _csrfToken = null;

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
      !requestUrl.includes("/auth/me") &&
      !requestUrl.includes("/auth/login") &&
      !requestUrl.includes("/auth/register") &&
      !requestUrl.includes("/auth/forgot-password") &&
      !requestUrl.includes("/auth/reset-password") &&
      !requestUrl.includes("/auth/google") &&
      !requestUrl.includes("/auth/emergent-session") &&
      !requestUrl.includes("/gdpr/")
    ) {
      originalRequest._retry = true;
      try {
        const storedRt = getToken("refresh_token");
        const refreshHeaders = storedRt ? { Authorization: `Bearer ${storedRt}` } : {};
        const refreshResponse = await axios.post(`${API}/auth/refresh`, {}, {
          withCredentials: true,
          headers: refreshHeaders,
        });
        if (refreshResponse?.data?.access_token) {
          setToken("access_token", refreshResponse.data.access_token, true);
        }
        if (refreshResponse?.data?.refresh_token) {
          setToken("refresh_token", refreshResponse.data.refresh_token, true);
        }
        return api(originalRequest);
      } catch (refreshError) {
        const status = refreshError?.response?.status;
        console.warn("[auth] refresh failed", status, refreshError?.response?.data);
        clearTokens();
        // Redirect to login so the user isn't stuck in a zombie authenticated state
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
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

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

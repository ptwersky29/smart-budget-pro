import axios from "axios";

const fallbackBackend =
  typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")
    ? "https://financeai-api.onrender.com"
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
  } catch { /* CSRF best-effort */ }
  return _csrfToken;
}

const SAFE_METHODS = new Set(["get", "head", "options"]);

api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem("access_token");
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
  (response) => response,
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
      !requestUrl.includes("/auth/emergent-session")
    ) {
      originalRequest._retry = true;
      try {
        const refreshResponse = await axios.post(`${API}/auth/refresh`, {}, { withCredentials: true });
        if (refreshResponse?.data?.access_token) {
          localStorage.setItem("access_token", refreshResponse.data.access_token);
        }
        if (refreshResponse?.data?.refresh_token) {
          localStorage.setItem("refresh_token", refreshResponse.data.refresh_token);
        }
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
      }
    }
    return Promise.reject(error);
  }
);

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

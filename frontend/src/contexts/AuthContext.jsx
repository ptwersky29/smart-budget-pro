import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api } from "../lib/api";
import { cacheInvalidate } from "../lib/cache";
import { setToken, clearTokens } from "../lib/storage";
import { isPublicDemo, DEMO_USER } from "../lib/demoSession";

const AuthCtx = createContext(null);
const OFFLINE_PROFILE_KEY = "penni.offline-profile.v1";
const VERIFY_RETRY_DELAYS = [1_000, 4_000, 10_000];

function readOfflineProfile() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_PROFILE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveOfflineProfile(profile) {
  if (!profile) return;
  const { access_token, refresh_token, ...safeProfile } = profile;
  try { localStorage.setItem(OFFLINE_PROFILE_KEY, JSON.stringify(safeProfile)); } catch { /* quota */ }
}

function isUnauthorized(error) {
  return error?.response?.status === 401 || error?.response?.status === 403 && error?.response?.data?.code === "token_expired";
}

export const AuthProvider = ({ children }) => {
  const [initialProfile] = useState(() => (isPublicDemo() ? DEMO_USER : readOfflineProfile()));
  const [user, setUser] = useState(initialProfile || null);
  // The shell renders immediately from the cached profile; /auth/me verifies
  // in the background. Only a first-ever visit waits on the network.
  const [loading, setLoading] = useState(!initialProfile && !isPublicDemo());
  const [connection, setConnection] = useState("online");
  const mountedRef = useRef(true);
  const retryRef = useRef(null);

  const stripTokens = useCallback((payload) => {
    if (!payload) return payload;
    const { access_token, refresh_token, ...userData } = payload;
    return userData;
  }, []);

  const syncTokensFromLocation = useCallback(() => {
    const qp = new URLSearchParams(window.location.search);
    const hp = new URLSearchParams((window.location.hash || "").replace(/^#/, "?"));
    const accessToken = qp.get("access_token") || hp.get("access_token");
    const refreshToken = qp.get("refresh_token") || hp.get("refresh_token");
    if (accessToken) {
      setToken("access_token", accessToken, true);
      if (refreshToken) setToken("refresh_token", refreshToken, true);
      window.history.replaceState(null, "", window.location.pathname);
      return true;
    }
    return false;
  }, []);

  const verify = useCallback(async (attempt = 0) => {
    if (isPublicDemo()) {
      if (mountedRef.current) { setUser(DEMO_USER); setLoading(false); }
      return;
    }
    try {
      const { data } = await api.get("/auth/me", { _skipRetry: true });
      if (!mountedRef.current) return;
      const profile = stripTokens(data);
      saveOfflineProfile(profile);
      setUser(profile);
      setConnection("online");
      setLoading(false);
      return;
    } catch (error) {
      if (!mountedRef.current) return;
      if (isUnauthorized(error)) {
        clearTokens();
        setUser(false);
        setConnection("online");
        setLoading(false);
        return;
      }
      // Network, timeout or server error: keep the cached session instead of
      // silently downgrading the user to an offline profile.
      const fallback = readOfflineProfile();
      setUser((current) => current || fallback || false);
      setConnection(error?.response ? "degraded" : "offline");
      setLoading(false);

      const delay = VERIFY_RETRY_DELAYS[attempt];
      if (delay !== undefined) {
        retryRef.current = setTimeout(() => { verify(attempt + 1); }, delay);
      }
    }
  }, [stripTokens]);

  const checkAuth = useCallback(() => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    return verify(0);
  }, [verify]);

  useEffect(() => {
    mountedRef.current = true;
    if (!isPublicDemo()) syncTokensFromLocation();
    checkAuth();

    const handleOnline = () => checkAuth();
    const handleOffline = () => setConnection("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      mountedRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [checkAuth, syncTokensFromLocation]);

  const login = useCallback(async (email, password, rememberMe = false) => {
    const { data } = await api.post("/auth/login", { email, password, remember_me: rememberMe });
    if (data?.access_token) setToken("access_token", data.access_token, rememberMe);
    if (data?.refresh_token) setToken("refresh_token", data.refresh_token, rememberMe);
    const profile = stripTokens(data);
    api.clearOfflineCache();
    cacheInvalidate();
    saveOfflineProfile(profile);
    setUser(profile);
    setConnection("online");
    return data;
  }, [stripTokens]);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data?.access_token) setToken("access_token", data.access_token, true);
    if (data?.refresh_token) setToken("refresh_token", data.refresh_token, true);
    const profile = stripTokens(data);
    api.clearOfflineCache();
    cacheInvalidate();
    saveOfflineProfile(profile);
    setUser(profile);
    setConnection("online");
    return data;
  }, [stripTokens]);

  const continueOffline = useCallback(() => {
    const savedProfile = readOfflineProfile();
    const offlineProfile = savedProfile || {
      id: "offline-local",
      name: "Offline workspace",
      email: "",
      onboarded: true,
    };
    saveOfflineProfile(offlineProfile);
    setUser({ ...offlineProfile, isOffline: true });
    setConnection("offline");
    return offlineProfile;
  }, []);

  const logout = useCallback(async () => {
    if (isPublicDemo()) {
      try { window.sessionStorage.removeItem("penni.public-demo.readonly.v1"); } catch {}
      window.location.assign("/");
      return;
    }
    try { await api.post("/auth/logout"); } catch { /* server logout best-effort */ }
    clearTokens();
    api.clearOfflineCache();
    cacheInvalidate();
    try { localStorage.removeItem(OFFLINE_PROFILE_KEY); } catch { /* ignore */ }
    setUser(false);
  }, []);

  const value = React.useMemo(
    () => ({
      user,
      setUser,
      loading,
      connection,
      login,
      register,
      logout,
      continueOffline,
      refresh: checkAuth,
    }),
    [user, loading, connection, login, register, logout, continueOffline, checkAuth]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);

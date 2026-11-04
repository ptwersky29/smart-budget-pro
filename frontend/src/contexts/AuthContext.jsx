import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { setToken, clearTokens, isTokenExpired } from "../lib/storage";
import { isPublicDemo, DEMO_USER } from "../lib/demoSession";

const AuthCtx = createContext(null);
const OFFLINE_PROFILE_KEY = "penni.offline-profile.v1";

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
  localStorage.setItem(OFFLINE_PROFILE_KEY, JSON.stringify(safeProfile));
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const checkAuth = useCallback(async () => {
    if (isPublicDemo()) { setUser(DEMO_USER); setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      const profile = stripTokens(data);
      saveOfflineProfile(profile);
      setUser(profile);
    } catch {
      const offlineProfile = readOfflineProfile();
      setUser(offlineProfile ? { ...offlineProfile, isOffline: true } : false);
    } finally {
      setLoading(false);
    }
  }, [stripTokens]);

  useEffect(() => {
    if (!isPublicDemo()) syncTokensFromLocation();
    checkAuth();
  }, [checkAuth, syncTokensFromLocation]);

  const login = useCallback(async (email, password, rememberMe = false) => {
    const { data } = await api.post("/auth/login", { email, password, remember_me: rememberMe });
    if (data?.access_token) setToken("access_token", data.access_token, rememberMe);
    if (data?.refresh_token) setToken("refresh_token", data.refresh_token, rememberMe);
    const profile = stripTokens(data);
    saveOfflineProfile(profile);
    setUser(profile);
    return data;
  }, [stripTokens]);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data?.access_token) setToken("access_token", data.access_token, true);
    if (data?.refresh_token) setToken("refresh_token", data.refresh_token, true);
    const profile = stripTokens(data);
    saveOfflineProfile(profile);
    setUser(profile);
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
    localStorage.removeItem(OFFLINE_PROFILE_KEY);
    setUser(false);
  }, []);

  const value = React.useMemo(
    () => ({ user, setUser, loading, login, register, logout, continueOffline, refresh: checkAuth }),
    [user, loading, login, register, logout, continueOffline, checkAuth]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { setToken, clearTokens, isTokenExpired } from "../lib/storage";

const AuthCtx = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const stripTokens = useCallback((payload) => {
    if (!payload) return payload;
    const { access_token, refresh_token, ...userData } = payload;
    return userData;
  }, []);

  const syncTokensFromLocation = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (accessToken) {
      setToken("access_token", accessToken, true);
      if (refreshToken) setToken("refresh_token", refreshToken, true);
      window.history.replaceState(null, "", window.location.pathname);
      return true;
    }
    return false;
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(stripTokens(data));
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, [stripTokens]);

  useEffect(() => {
    syncTokensFromLocation();
    // If URL hash has OAuth tokens, AuthCallback will handle auth — skip
    // checkAuth to avoid race where it sets user=false before AuthCallback finishes
    if (window.location.hash.includes("access_token=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth, syncTokensFromLocation]);

  const login = useCallback(async (email, password, rememberMe = false) => {
    const { data } = await api.post("/auth/login", { email, password, remember_me: rememberMe });
    if (data?.access_token) setToken("access_token", data.access_token, rememberMe);
    if (data?.refresh_token) setToken("refresh_token", data.refresh_token, rememberMe);
    setUser(stripTokens(data));
    return data;
  }, [stripTokens]);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data?.access_token) setToken("access_token", data.access_token, true);
    if (data?.refresh_token) setToken("refresh_token", data.refresh_token, true);
    setUser(stripTokens(data));
    return data;
  }, [stripTokens]);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* server logout best-effort */ }
    clearTokens();
    setUser(false);
  }, []);

  const value = React.useMemo(
    () => ({ user, setUser, loading, login, register, logout, refresh: checkAuth }),
    [user, loading, login, register, logout, checkAuth]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";

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
      localStorage.setItem("access_token", accessToken);
      if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
      window.history.replaceState(null, "", window.location.pathname);
      return true;
    }
    return false;
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(stripTokens(data));
    } catch (err) {
      console.debug("auth/me check failed (expected when not logged in)", err?.response?.status);
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, [stripTokens]);

  useEffect(() => {
    syncTokensFromLocation();
    checkAuth();
  }, [checkAuth, syncTokensFromLocation]);

  const login = useCallback(async (email, password, rememberMe = false) => {
    const { data } = await api.post("/auth/login", { email, password, remember_me: rememberMe });
    setUser(stripTokens(data));
    return data;
  }, [stripTokens]);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    setUser(stripTokens(data));
    return data;
  }, [stripTokens]);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch (err) { console.error("logout error", err); }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("financeai_token");
    localStorage.removeItem("session_token");
    setUser(false);
  }, []);

  const value = React.useMemo(
    () => ({ user, setUser, loading, login, register, logout, refresh: checkAuth }),
    [user, loading, login, register, logout, checkAuth]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);

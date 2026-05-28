import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";

const AuthCtx = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (err) {
      console.debug("auth/me check failed (expected when not logged in)", err?.response?.status);
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("access_token");
    if (accessToken) {
      localStorage.setItem("access_token", accessToken);
      const refreshToken = params.get("refresh_token");
      if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
      window.history.replaceState(null, "", window.location.pathname);
    }
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (email, password, rememberMe = false) => {
    const { data } = await api.post("/auth/login", { email, password, remember_me: rememberMe });
    if (data.access_token) {
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token || "");
    }
    setUser(data);
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data.access_token) {
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token || "");
    }
    setUser(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch (err) { console.error("logout error", err); }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(false);
  }, []);

  const value = React.useMemo(
    () => ({ user, setUser, loading, login, register, logout, refresh: checkAuth }),
    [user, loading, login, register, logout, checkAuth]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);

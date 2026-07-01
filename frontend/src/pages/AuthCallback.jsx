import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { setToken, getToken } from "../lib/storage";
import AppSplash from "../components/AppSplash";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
    (async () => {
      const hash = window.location.hash;
      if (!hash) return;
      const params = new URLSearchParams(hash.replace(/^#?/, "?"));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const error = params.get("error");
      const adminToken = params.get("admin_token");

      if (adminToken) {
        setToken("admin_token", adminToken, true);
        toast.success("Admin authenticated");
        navigate("/admin", { replace: true });
        return;
      }

      if (error) {
        toast.error(error === "access_denied" ? "You denied the request" : error);
        navigate("/login?error=oauth_failed", { replace: true });
        return;
      }

      // Save tokens from hash fragment immediately (Google OAuth or direct login)
      if (accessToken) {
        setToken("access_token", accessToken, true);
        if (refreshToken) setToken("refresh_token", refreshToken, true);
        window.location.hash = "";
      }

      try {
        const stored = getToken("access_token");
        if (stored) {
          const { data: me } = await api.get("/auth/me");
          setUser(me);
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/login?error=no_token", { replace: true });
        }
      } catch (e) {
        console.error("[AuthCallback] session validation failed:", e?.response?.status, e?.response?.data?.detail);
        navigate("/login?error=auth_failed", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return <AppSplash text="Completing sign in…" />;
}

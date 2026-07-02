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

      if (!hash || hash === "#") {
        const stored = getToken("access_token");
        if (stored) {
          try {
            const { data: me } = await api.get("/auth/me");
            setUser(me);
            navigate("/dashboard", { replace: true });
            return;
          } catch {
            // Stored auth was stale; continue to the normal failure path.
          }
        }
        toast.error("Authentication failed. Please try again.");
        navigate("/login?error=no_callback_data", { replace: true });
        return;
      }

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

      if (accessToken) {
        setToken("access_token", accessToken, true);
        if (refreshToken) setToken("refresh_token", refreshToken, true);
        window.location.hash = "";

        try {
          const { data: me } = await api.get("/auth/me");
          setUser(me);
          toast.success("Welcome back!");
          navigate("/dashboard", { replace: true });
        } catch {
          toast.error("Login failed. Please try again.");
          navigate("/login?error=token_validation_failed", { replace: true });
        }
      } else {
        toast.error("Authentication incomplete. Please try again.");
        navigate("/login?error=missing_token", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return <AppSplash text="Completing sign in..." />;
}

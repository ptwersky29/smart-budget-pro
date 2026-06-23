import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { getToken } from "../lib/storage";
import AppSplash from "../components/AppSplash";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
    (async () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.replace(/^#?/, "?"));
      const token = params.get("access_token") || params.get("code");
      const error = params.get("error");
      const adminToken = params.get("admin_token");

      if (adminToken) {
        localStorage.setItem("admin_token", adminToken);
        toast.success("Admin authenticated");
        navigate("/admin", { replace: true });
        return;
      }

      if (error) {
        toast.error(error === "access_denied" ? "You denied the request" : error);
        navigate("/login?error=oauth_failed", { replace: true });
        return;
      }

      try {
        let accessToken;
        if (token) {
          // OAuth implicit flow — exchange the fragment token for a session cookie
          const resp = await api.post("/auth/truelayer/oauth-token", { access_token: token });
          accessToken = resp.data?.access_token;
          if (resp.data?.user) setUser(resp.data.user);
        }

        const stored = getToken();
        accessToken = accessToken || stored;

        if (accessToken) {
          // Validate session
          const { data: me } = await api.get("/auth/me");
          setUser(me);
          const { data: sessionData } = await api.post("/auth/emergent-session", { session_id: me.user_id });
          if (sessionData?.token) {
            try { localStorage.setItem("token", sessionData.token); } catch {}
          }
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/login?error=no_token", { replace: true });
        }
      } catch (e) {
        const status = e.response?.status;
        const detail = e.response?.data?.detail;
        console.error("[AuthCallback] emergent-session (session_id) failed:", { status, detail, e });
        navigate("/login?error=oauth_failed", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return <AppSplash text="Completing sign in…" />;
}

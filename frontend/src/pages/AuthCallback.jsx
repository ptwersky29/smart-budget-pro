import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { setToken } from "../lib/storage";
import Skeleton from "../components/ui/Skeleton";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const hash = window.location.hash;
    console.log("[AuthCallback] hash:", hash);
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const sessionId = params.get("session_id");
    console.log("[AuthCallback] tokens from hash:", {
      accessToken: accessToken ? "present" : "missing",
      refreshToken: refreshToken ? "present" : "missing",
      sessionId: sessionId ? "present" : "missing",
    });

    if (accessToken) {
      (async () => {
        try {
          const { data } = await api.post("/auth/emergent-session", {
            access_token: accessToken,
            refresh_token: refreshToken || undefined,
          });
          const { access_token, refresh_token, ...userData } = data || {};
          if (access_token) setToken("access_token", access_token, true);
          if (refresh_token) setToken("refresh_token", refresh_token, true);
          setUser(userData);
          window.history.replaceState(null, "", "/dashboard");
          navigate("/dashboard", { replace: true, state: { user: userData } });
        } catch (e) {
          const status = e?.response?.status;
          const detail = e?.response?.data?.detail;
          console.error("[AuthCallback] emergent-session failed:", { status, detail, e });
          navigate("/login?error=oauth_failed", { replace: true });
        }
      })();
      return;
    }

    if (!sessionId) {
      console.warn("[AuthCallback] no access_token or session_id in hash");
      navigate("/login");
      return;
    }
    (async () => {
      try {
        const { data } = await api.post("/auth/emergent-session", { session_id: sessionId });
        const { access_token, refresh_token, ...userData } = data || {};
        if (access_token) setToken("access_token", access_token, true);
        if (refresh_token) setToken("refresh_token", refresh_token, true);
        setUser(userData);
        window.history.replaceState(null, "", "/dashboard");
        navigate("/dashboard", { replace: true, state: { user: userData } });
      } catch (e) {
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail;
        console.error("[AuthCallback] emergent-session (session_id) failed:", { status, detail, e });
        navigate("/login?error=oauth_failed", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <Skeleton className="h-4 w-48" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const sessionId = params.get("session_id");

    if (accessToken) {
      (async () => {
        try {
          const { data } = await api.post("/auth/emergent-session", {
            access_token: accessToken,
            refresh_token: refreshToken || undefined,
          });
          const { access_token, refresh_token, ...userData } = data || {};
          setUser(userData);
          window.history.replaceState(null, "", "/dashboard");
          navigate("/dashboard", { replace: true, state: { user: userData } });
        } catch (e) {
          navigate("/login?error=oauth_failed", { replace: true });
        }
      })();
      return;
    }

    if (!sessionId) {
      navigate("/login");
      return;
    }
    (async () => {
      try {
        const { data } = await api.post("/auth/emergent-session", { session_id: sessionId });
        const { access_token, refresh_token, ...userData } = data || {};
        setUser(userData);
        window.history.replaceState(null, "", "/dashboard");
        navigate("/dashboard", { replace: true, state: { user: userData } });
      } catch (e) {
        navigate("/login?error=oauth_failed", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-emerald" />
      <p className="text-muted-foreground">Verifying your session…</p>
    </div>
  );
}

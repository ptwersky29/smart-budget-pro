import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppSplash from "../components/AppSplash";
import { DEMO_SESSION_KEY } from "../lib/demoSession";

/** Start Penni's actual offline application using synthetic read-only data.
 * A full navigation creates a fresh provider tree and cannot carry over a
 * previously signed-in user's in-memory financial records. */
export default function DemoEntry() {
  const navigate = useNavigate();
  useEffect(() => {
    try { window.sessionStorage.setItem(DEMO_SESSION_KEY, "true"); }
    catch { return navigate("/login", {replace:true}); }
    window.location.replace("/dashboard");
  }, [navigate]);
  return <AppSplash text="Opening Penni demo…" />;
}

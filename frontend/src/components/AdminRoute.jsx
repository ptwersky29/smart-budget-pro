import React, { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import AppSplash from "./AppSplash";

export default function AdminRoute({ children }) {
  const { user, loading, authUnavailable, refresh } = useAuth();
  const location = useLocation();
  const navState = useMemo(() => ({ from: location }), [location]);
  if (loading) return <AppSplash text="Verifying access..." />;
  if (authUnavailable && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
        <h1 className="text-xl font-semibold">Connecting to Penni…</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          The server is temporarily unavailable or waking up. Your login has not been erased.
        </p>
        <button type="button" onClick={refresh}
          className="rounded-full bg-primary px-5 py-2.5 text-primary-foreground">
          Retry connection
        </button>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={navState} replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

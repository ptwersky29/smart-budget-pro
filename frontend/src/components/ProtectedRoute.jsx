import React, { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import AppSplash from "./AppSplash";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navState = useMemo(() => ({ from: location }), [location]);
  if (loading) return <AppSplash text="Signing in…" />;
  if (!user) return <Navigate to="/login" state={navState} replace />;
  return children;
}

import React from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import "App.css";
import { AuthProvider } from "./contexts/AuthContext";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import ConsentBanner from "./components/ConsentBanner";
import AppLayout from "./pages/AppLayout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Budgets from "./pages/Budgets";
import Connections from "./pages/Connections";
import Investments from "./pages/Investments";
import Jewish from "./pages/Jewish";
import UKTools from "./pages/UKTools";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import SMS from "./pages/SMS";
import Statements from "./pages/Statements";
import Subscriptions from "./pages/Subscriptions";
import Integrations from "./pages/Integrations";
import Pricing from "./pages/Pricing";
import PaymentSuccess from "./pages/PaymentSuccess";
import AuthCallback from "./pages/AuthCallback";
import OnboardingWizard from "./pages/OnboardingWizard";
import Privacy from "./pages/Privacy";

function AppRouter() {
  const location = useLocation();
  const authHash = location.hash || "";
  if (authHash.includes("access_token=") || authHash.includes("refresh_token=") || authHash.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingWizard /></ProtectedRoute>} />
      <Route path="/billing/success" element={<PaymentSuccess />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/sms" element={<SMS />} />
        <Route path="/statements" element={<Statements />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/investments" element={<Investments />} />
        <Route path="/jewish" element={<Jewish />} />
        <Route path="/uk-tools" element={<UKTools />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthProvider>
          <ErrorBoundary>
            <AppRouter />
            <ConsentBanner />
          </ErrorBoundary>
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

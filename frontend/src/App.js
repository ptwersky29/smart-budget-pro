import React from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import "@/App.css";
import { AuthProvider } from "./contexts/AuthContext";
import { Toaster } from "sonner";
import ProtectedRoute from "./components/ProtectedRoute";
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
import Integrations from "./pages/Integrations";
import Pricing from "./pages/Pricing";
import PaymentSuccess from "./pages/PaymentSuccess";
import AuthCallback from "./pages/AuthCallback";

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) {
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
      <Route path="/billing/success" element={<PaymentSuccess />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/connections" element={<Connections />} />
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
      <AuthProvider>
        <AppRouter />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  );
}

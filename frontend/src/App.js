import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import "./App.css";
import { AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { CategoriesProvider } from "./contexts/CategoriesContext";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import ConsentBanner from "./components/ConsentBanner";
import PageLoader from "./components/PageLoader";

const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Transactions = lazy(() => import("./pages/Transactions"));
const BudgetPage = lazy(() => import("./pages/BudgetPage"));
const BankStatements = lazy(() => import("./pages/BankStatements"));
const Investments = lazy(() => import("./pages/Investments"));
const Jewish = lazy(() => import("./pages/Jewish"));
const UKTools = lazy(() => import("./pages/UKTools"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const CategoryManager = lazy(() => import("./pages/CategoryManager"));
const Subscriptions = lazy(() => import("./pages/Subscriptions"));
const Connections = lazy(() => import("./pages/Connections"));
const Integrations = lazy(() => import("./pages/Integrations"));
const SMS = lazy(() => import("./pages/SMS"));
const Statements = lazy(() => import("./pages/Statements"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const Pricing = lazy(() => import("./pages/Pricing"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const OnboardingWizard = lazy(() => import("./pages/OnboardingWizard"));
const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AppLayout = lazy(() => import("./pages/AppLayout"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));

function AppRouter() {
  const location = useLocation();
  const authHash = location.hash || "";

  if (
    authHash.includes("access_token=") ||
    authHash.includes("refresh_token=") ||
    authHash.includes("session_id=")
  ) {
    console.log("[AppRouter] hash detected, rendering AuthCallback");
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
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingWizard />
          </ProtectedRoute>
        }
      />
      <Route path="/billing/success" element={<PaymentSuccess />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/budgets" element={<BudgetPage />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/import" element={<BankStatements />} />
        <Route path="/investments" element={<Investments />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/sms" element={<SMS />} />
        <Route path="/statements" element={<Statements />} />
        <Route path="/accounts/:connectionId" element={<AccountPage />} />
        <Route path="/jewish" element={<Jewish />} />
        <Route path="/uk-tools" element={<UKTools />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/categories" element={<CategoryManager />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthProvider>
          <SettingsProvider>
            <CategoriesProvider>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <AppRouter />
                </Suspense>
                <ConsentBanner />
              </ErrorBoundary>
            </CategoriesProvider>
          </SettingsProvider>
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

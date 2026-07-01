import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api, BACKEND_URL, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import AuthVisual from "../components/AuthVisual";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => { document.title = "Sign In | Penni"; }, []);

  useEffect(() => {
    if (searchParams.get("expired") === "1") {
      toast.info("Your session expired. Please sign in again.");
    }
  }, [searchParams]);

  const validate = () => {
    const e = {};
    if (!email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = "Enter a valid email address";
    if (!password) e.password = "Password is required";
    return e;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setBusy(true);
    try {
      const data = await login(email, password, rememberMe);
      toast.success("Welcome back");
      if (!data.onboarded) {
        navigate("/onboarding");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      const msg = (status ? `(${status}) ` : "") + (formatApiError(detail) || "Incorrect email or password. Please try again.");
      toast.error(msg);
      setErrors({ submit: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Form side */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <Link to="/" className="flex items-center gap-2.5 mb-10">
            <div className="w-10 h-10 rounded-full gradient-emerald grid place-items-center text-white font-bold text-lg shadow-md shadow-emerald/20 ring-1 ring-white/15">&pound;</div>
            <span className="font-semibold tracking-tight text-lg">Penni</span>
          </Link>

          <h1 className="text-3xl tracking-tight font-semibold">Welcome back.</h1>
          <p className="text-sm text-muted-foreground mt-2">Sign in to your premium finance workspace.</p>

          <form onSubmit={onSubmit} noValidate className="space-y-5 mt-8">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="label-overline">Email</label>
              <Input
                id="login-email"
                data-testid="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: "" })); }}
                className={`mt-1 w-full ${errors.email ? "border-ruby focus:border-ruby" : ""}`}
              />
              {errors.email && <p className="text-xs text-ruby mt-1" role="alert">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="label-overline">Password</label>
                <Link to="/forgot-password" className="text-xs text-emerald hover:underline">Forgot password?</Link>
              </div>
              <div className="relative mt-1">
                <Input
                  id="login-password"
                  data-testid="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: "" })); }}
                  className={`w-full pr-11 ${errors.password ? "border-ruby focus:border-ruby" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-ruby mt-1" role="alert">{errors.password}</p>}
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-border accent-emerald"
              />
              Remember me for 30 days
            </label>

            {/* Submit error */}
            {errors.submit && (
              <p className="text-xs text-ruby bg-ruby/5 border border-ruby/20 rounded-xl px-3 py-2" role="alert">
                {errors.submit}
              </p>
            )}

            <Button
              data-testid="login-submit"
              disabled={busy}
              variant="primary"
              size="pill"
              className="w-full"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            {/* Google */}
            <Button variant="outlinePill" size="pill" className="w-full" asChild>
              <a href={`${BACKEND_URL}/api/auth/google`}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </a>
            </Button>
          </form>

          <p className="text-xs text-muted-foreground mt-6 text-center">
            No account?{" "}
            <Link to="/register" className="text-emerald hover:underline">Create one free</Link>
          </p>

          {/* Trust bar */}
          <div className="mt-8 flex items-center justify-center gap-4 text-xs text-muted-foreground border-t border-border pt-6">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald" /> 256-bit encrypted</span>
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald" /> TLS 1.3</span>
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald" /> Cancel anytime</span>
          </div>
        </div>
      </div>

      <AuthVisual title="Premium money, quietly automated." />
    </div>
  );
}

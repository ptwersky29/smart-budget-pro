import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { BACKEND_URL, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Eye, EyeOff, Check, ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import AuthVisual from "../components/AuthVisual";
import "./AuthPages.css";
import Logo from "../components/Logo";

function PasswordStrength({ password }) {
  const checks = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "Contains a number", ok: /\d/.test(password) },
    { label: "Contains a special character", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  if (!password) return null;
  return (
    <div className="auth-password-checks mt-2 grid gap-1.5">
      {checks.map(({ label, ok }) => (
        <p key={label} className={`text-xs flex items-center gap-1.5 ${ok ? "text-primary" : "text-muted-foreground"}`}>
          <Check className={`h-3 w-3 shrink-0 ${ok ? "text-primary" : "text-border"}`} />
          {label}
        </p>
      ))}
    </div>
  );
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => { document.title = "Create Account | Penni"; }, []);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Enter a valid email address";
    if (!form.password) e.password = "Password is required";
    else if (form.password.length < 8) e.password = "Password must be at least 8 characters";
    if (!confirmPassword) e.confirm = "Please confirm your password";
    else if (form.password !== confirmPassword) e.confirm = "Passwords do not match";
    if (!agreeTerms) e.terms = "You must agree to the Privacy Policy to continue";
    return e;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      requestAnimationFrame(() => document.getElementById(errs.name ? "register-name" : errs.email ? "register-email" : errs.password ? "register-password" : errs.confirm ? "register-confirm" : "register-terms")?.focus());
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await register(form);
      toast.success("Account created - welcome to Penni!");
      navigate("/onboarding");
    } catch (err) {
      const msg = formatApiError(err.response?.data?.detail) || "Could not create account. Please try again.";
      toast.error(msg);
      setErrors({ submit: msg });
    } finally {
      setBusy(false);
    }
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => { setForm({ ...form, [key]: e.target.value }); setErrors((p) => ({ ...p, [key]: "" })); },
  });

  return (
    <div className="penni-auth grid min-h-[100dvh] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
      {/* Form side */}
      <main className="auth-form-side flex min-w-0 items-center justify-center p-5 sm:p-8 lg:px-10">
        <div className="auth-form-panel w-full max-w-[440px]">
          <Link to="/" aria-label="Penni home" className="auth-brand mb-8 inline-flex items-center gap-2.5">
            <Logo size="md" />
            <span className="auth-wordmark text-xl font-bold tracking-[-0.05em]">Penni</span>
          </Link>

          <Link to="/" className="auth-back-link"><ArrowLeft size={15} /> Back to home</Link>
          <span className="auth-kicker"><Sparkles size={14} /> YOUR MONEY, MADE CLEARER</span>
          <h1 className="auth-heading text-4xl font-bold">Create your free account<span className="auth-heading-dot">.</span></h1>
          <p className="auth-subtitle mt-3 text-sm text-muted-foreground">One place for your accounts, budgets and plans. No Penni subscription required.</p>

          <form onSubmit={onSubmit} noValidate className="auth-form mt-7 space-y-4 sm:space-y-5">
            {/* Name */}
            <div>
              <label htmlFor="register-name" className="auth-field-label">Full name *</label>
              <Input
                id="register-name"
                aria-invalid={Boolean(errors.name)}
                data-testid="register-name"
                autoComplete="name"
                required
                {...field("name")}
                className={`auth-input mt-1.5 w-full ${errors.name ? "border-ruby" : ""}`}
              />
              {errors.name && <p className="text-xs text-ruby mt-1" role="alert">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="register-email" className="auth-field-label">Email address *</label>
              <Input
                id="register-email"
                aria-invalid={Boolean(errors.email)}
                data-testid="register-email"
                type="email"
                autoComplete="email"
                required
                {...field("email")}
                className={`auth-input mt-1.5 w-full ${errors.email ? "border-ruby" : ""}`}
              />
              {errors.email && <p className="text-xs text-ruby mt-1" role="alert">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="register-password" className="auth-field-label">Password *</label>
              <div className="relative mt-1.5">
                <Input
                  id="register-password"
                  aria-invalid={Boolean(errors.password)}
                data-testid="register-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors((p) => ({ ...p, password: "" })); }}
                  className={`auth-input w-full pr-11 ${errors.password ? "border-ruby" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="auth-password-toggle absolute right-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-ruby mt-1" role="alert">{errors.password}</p>}
              <PasswordStrength password={form.password} />
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="register-confirm" className="auth-field-label">Confirm password *</label>
              <div className="relative mt-1.5">
                <Input
                  id="register-confirm"
                  aria-invalid={Boolean(errors.confirm)}
                data-testid="register-confirm"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setErrors((p) => ({ ...p, confirm: "" })); }}
                  className={`auth-input w-full pr-11 ${errors.confirm ? "border-ruby" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="auth-password-toggle absolute right-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirm && <p className="text-xs text-ruby mt-1" role="alert">{errors.confirm}</p>}
            </div>

            {/* Terms */}
            <div>
              <label className="auth-checkbox-row flex min-h-11 items-start gap-3 text-sm text-muted-foreground cursor-pointer">
                <input
                  id="register-terms"
                  aria-invalid={Boolean(errors.terms)}
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => { setAgreeTerms(e.target.checked); setErrors((p) => ({ ...p, terms: "" })); }}
                  className="mt-1 h-4 w-4 rounded border-border accent-indigo-600"
                />
                <span>
                  I agree to the{" "}
                  <Link to="/privacy" className="text-primary hover:underline" target="_blank" rel="noreferrer">
                    Privacy Policy
                  </Link>
                </span>
              </label>
              {errors.terms && <p className="text-xs text-ruby mt-1" role="alert">{errors.terms}</p>}
            </div>

            {/* Submit error */}
            {errors.submit && (
              <p className="text-xs text-ruby bg-ruby/5 border border-ruby/20 rounded-xl px-3 py-2" role="alert">
                {errors.submit}
              </p>
            )}

            <Button
              data-testid="register-submit"
              disabled={busy}
              variant="primary"
              size="pill"
              className="auth-submit w-full"
              type="submit"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create free account"}
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="auth-divider-label bg-background px-3 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            {/* Google */}
            <Button variant="outlinePill" size="pill" className="auth-oauth-button w-full" asChild>
              <a href={`${BACKEND_URL}/api/auth/google`}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign up with Google
              </a>
            </Button>
          </form>

          <p className="auth-switch mt-7 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="auth-inline-link text-primary hover:underline">Sign in</Link>
          </p>

          {/* Trust bar */}
          <div className="auth-trust-bar mt-8 flex flex-wrap items-center justify-center gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
            <span><Check className="h-3.5 w-3.5" /> Free Penni account</span>
            <span><ShieldCheck className="h-3.5 w-3.5" /> No bank connection required</span>
          </div>
        </div>
      </main>
      <AuthVisual title="Clarity for your money. Confidence for what comes next." />
    </div>
  );
}

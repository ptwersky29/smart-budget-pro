import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { BACKEND_URL, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Eye, EyeOff, Check } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import AuthVisual from "../components/AuthVisual";

function PasswordStrength({ password }) {
  const checks = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "Contains a number", ok: /\d/.test(password) },
    { label: "Contains a special character", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1">
      {checks.map(({ label, ok }) => (
        <p key={label} className={`text-xs flex items-center gap-1.5 ${ok ? "text-emerald" : "text-muted-foreground"}`}>
          <Check className={`h-3 w-3 shrink-0 ${ok ? "text-emerald" : "text-border"}`} />
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
    if (form.password !== confirmPassword) e.confirm = "Passwords do not match";
    if (!agreeTerms) e.terms = "You must agree to the Privacy Policy to continue";
    return e;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
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
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Form side */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <Link to="/" className="flex items-center gap-2 mb-10">
            <div className="w-9 h-9 rounded-xl gradient-emerald grid place-items-center text-white font-bold">&pound;</div>
            <span className="font-semibold tracking-tight text-lg">Penni</span>
          </Link>

          <h1 className="text-3xl tracking-tight font-semibold">Create your account.</h1>
          <p className="text-sm text-muted-foreground mt-2">Free forever. Premium when you need it.</p>

          <form onSubmit={onSubmit} noValidate className="space-y-5 mt-8">
            {/* Name */}
            <div>
              <label htmlFor="register-name" className="label-overline">Full name *</label>
              <Input
                id="register-name"
                data-testid="register-name"
                autoComplete="name"
                required
                {...field("name")}
                className={`mt-1 w-full ${errors.name ? "border-ruby" : ""}`}
              />
              {errors.name && <p className="text-xs text-ruby mt-1" role="alert">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="register-email" className="label-overline">Email address *</label>
              <Input
                id="register-email"
                data-testid="register-email"
                type="email"
                autoComplete="email"
                required
                {...field("email")}
                className={`mt-1 w-full ${errors.email ? "border-ruby" : ""}`}
              />
              {errors.email && <p className="text-xs text-ruby mt-1" role="alert">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="register-password" className="label-overline">Password *</label>
              <div className="relative mt-1">
                <Input
                  id="register-password"
                  data-testid="register-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors((p) => ({ ...p, password: "" })); }}
                  className={`w-full pr-11 ${errors.password ? "border-ruby" : ""}`}
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
              <PasswordStrength password={form.password} />
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="register-confirm" className="label-overline">Confirm password *</label>
              <div className="relative mt-1">
                <Input
                  id="register-confirm"
                  data-testid="register-confirm"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setErrors((p) => ({ ...p, confirm: "" })); }}
                  className={`w-full pr-11 ${errors.confirm ? "border-ruby" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirm && <p className="text-xs text-ruby mt-1" role="alert">{errors.confirm}</p>}
            </div>

            {/* Terms */}
            <div>
              <label className="flex items-start gap-2.5 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => { setAgreeTerms(e.target.checked); setErrors((p) => ({ ...p, terms: "" })); }}
                  className="mt-0.5 rounded border-border accent-emerald"
                />
                <span>
                  I agree to the{" "}
                  <Link to="/privacy" className="text-emerald hover:underline" target="_blank" rel="noreferrer">
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
              className="w-full"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create free account"}
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
                Sign up with Google
              </a>
            </Button>
          </form>

          <p className="text-xs text-muted-foreground mt-6 text-center">
            Already have an account?{" "}
            <Link to="/login" className="text-emerald hover:underline">Sign in</Link>
          </p>

          {/* Trust bar */}
          <div className="mt-8 flex items-center justify-center gap-4 text-xs text-muted-foreground border-t border-border pt-6">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald" /> 14-day free trial</span>
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald" /> Cancel anytime</span>
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald" /> TLS 1.3</span>
          </div>
        </div>
      </div>
      <AuthVisual title="A finance workspace that respects your time, your tax band, and your community." />
    </div>
  );
}

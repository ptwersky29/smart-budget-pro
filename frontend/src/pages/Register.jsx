import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register(form);
      toast.success("Account created. Welcome!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not register");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <Link to="/" className="flex items-center gap-2 mb-10">
            <div className="w-9 h-9 rounded-xl gradient-emerald grid place-items-center text-white font-bold">£</div>
            <span className="font-semibold tracking-tight text-lg">FinanceAI</span>
          </Link>
          <h1 className="text-3xl tracking-tight font-medium">Create your account.</h1>
          <p className="text-sm text-muted-foreground mt-2">Free forever. Premium when you want it.</p>

          <form onSubmit={onSubmit} className="space-y-4 mt-8">
            <div>
              <label className="label-overline">Name</label>
              <input data-testid="register-name" required value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
            </div>
            <div>
              <label className="label-overline">Email</label>
              <input data-testid="register-email" type="email" required value={form.email} onChange={(e)=>setForm({...form, email:e.target.value})} className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
            </div>
            <div>
              <label className="label-overline">Password</label>
              <input data-testid="register-password" type="password" required minLength={6} value={form.password} onChange={(e)=>setForm({...form, password:e.target.value})} className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
            </div>
            <button data-testid="register-submit" disabled={busy} className="btn-pill w-full gradient-emerald text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : "Create account"}
            </button>
          </form>
          <p className="text-xs text-muted-foreground mt-6 text-center">Already have an account? <Link to="/login" className="text-emerald hover:underline">Sign in</Link></p>
        </div>
      </div>
      <div className="hidden lg:block bg-gradient-to-br from-emerald-900 via-slate-900 to-black p-12 text-white">
        <div className="h-full flex flex-col justify-between">
          <p className="label-overline opacity-80">Why FinanceAI</p>
          <div>
            <p className="text-4xl font-medium tracking-tight leading-tight">A finance OS that respects your time, your tax band, and your community.</p>
            <ul className="mt-8 space-y-3 text-sm opacity-90">
              <li>✓ UK bank sync via TrueLayer</li>
              <li>✓ Claude Sonnet 4.5 AI coach</li>
              <li>✓ Maaser & Tzedakah tracking</li>
              <li>✓ Universal Credit & HMRC estimator</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

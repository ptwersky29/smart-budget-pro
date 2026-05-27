import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const AUTH_BG = "https://images.unsplash.com/photo-1618556450991-2f1af64e8191?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwzfHxhYnN0cmFjdCUyMHByZW1pdW0lMjBmaW5hbmNlJTIwdGVjaCUyMGJhY2tncm91bmR8ZW58MHx8fHwxNzc5MTk5MTE5fDA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <Link to="/" className="flex items-center gap-2 mb-10">
            <div className="w-9 h-9 rounded-xl gradient-emerald grid place-items-center text-white font-bold">£</div>
            <span className="font-semibold tracking-tight text-lg">FinanceAI</span>
          </Link>
          <h1 className="text-3xl tracking-tight font-medium">Welcome back.</h1>
          <p className="text-sm text-muted-foreground mt-2">Sign in to your premium finance OS.</p>

          <form onSubmit={onSubmit} className="space-y-4 mt-8">
            <div>
              <label className="label-overline">Email</label>
              <input data-testid="login-email" type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
            </div>
            <div>
              <label className="label-overline">Password</label>
              <input data-testid="login-password" type="password" required value={password} onChange={(e)=>setPassword(e.target.value)} className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
            </div>
            <button data-testid="login-submit" disabled={busy} className="btn-pill w-full gradient-emerald text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : "Sign in"}
            </button>
          </form>
          <p className="text-xs text-muted-foreground mt-6 text-center">No account? <Link to="/register" className="text-emerald hover:underline">Create one</Link></p>
        </div>
      </div>
      <div className="hidden lg:block relative overflow-hidden">
        <img src={AUTH_BG} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-black/30 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <p className="label-overline opacity-80">FinanceAI</p>
          <p className="text-3xl font-medium tracking-tight mt-2">Premium money, quietly automated.</p>
        </div>
      </div>
    </div>
  );
}

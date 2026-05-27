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
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or continue with</span></div>
            </div>
            <a href={`${process.env.REACT_APP_BACKEND_URL || 'https://budget-pro-4jlg.onrender.com'}/api/auth/google`}
               className="btn-pill w-full border border-border hover:bg-secondary flex items-center justify-center gap-2">
              <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Sign in with Google
            </a>
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

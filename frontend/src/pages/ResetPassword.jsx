import React, { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Loader2, Lock, CheckCircle2 } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setDone(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not reset password");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-8">
        <div className="text-center">
          <Lock className="h-12 w-12 text-ruby mx-auto mb-4" />
          <h1 className="text-2xl tracking-tight font-medium">Invalid reset link</h1>
          <p className="text-sm text-muted-foreground mt-2">This link is missing a reset token.</p>
          <Link to="/forgot-password" className="btn-pill border border-border mt-6 inline-block">Request new link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-8">
      <div className="w-full max-w-sm">
        {done ? (
          <div className="text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald mx-auto mb-4" />
            <h1 className="text-3xl tracking-tight font-medium">Password reset</h1>
            <p className="text-sm text-muted-foreground mt-3">Redirecting to login…</p>
          </div>
        ) : (
          <>
            <h1 className="text-3xl tracking-tight font-medium">Set new password.</h1>
            <p className="text-sm text-muted-foreground mt-2">Choose a strong password you haven't used before.</p>
            <form onSubmit={onSubmit} className="space-y-4 mt-8">
              <div>
                <label className="label-overline">New password</label>
                <input type="password" required minLength={8} value={password}
                       onChange={(e) => setPassword(e.target.value)}
                       placeholder="At least 8 characters" className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
              </div>
              <div>
                <label className="label-overline">Confirm password</label>
                <input type="password" required minLength={8} value={confirm}
                       onChange={(e) => setConfirm(e.target.value)}
                       placeholder="Repeat password" className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
              </div>
              <button disabled={busy} className="btn-pill w-full gradient-emerald text-white disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset password"}
              </button>
            </form>
            <p className="text-xs text-muted-foreground mt-6 text-center">
              Remember your password? <Link to="/login" className="text-emerald hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => { document.title = "Reset Password | Penni"; }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not send reset email");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-8">
      <div className="w-full max-w-sm">
        <Link to="/login" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-10">
          <ArrowLeft className="h-4 w-4" /> Back to login
        </Link>
        {sent ? (
          <div className="text-center">
            <Mail className="h-12 w-12 text-emerald mx-auto mb-4" />
            <h1 className="text-3xl tracking-tight font-medium">Check your email</h1>
            <p className="text-sm text-muted-foreground mt-3">
              If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
            </p>
            <p className="text-xs text-muted-foreground mt-6">
              Didn't receive it? <button onClick={() => setSent(false)} className="text-emerald hover:underline bg-transparent border-0 px-4 py-2 cursor-pointer">Try again</button>
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-3xl tracking-tight font-medium">Reset password.</h1>
            <p className="text-sm text-muted-foreground mt-2">Enter your email and we'll send you a reset link.</p>
            <form onSubmit={onSubmit} className="space-y-4 mt-8">
              <div>
                <label className="label-overline">Email</label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                       placeholder="you@example.com" className="mt-1 w-full" />
              </div>
              <Button disabled={busy} variant="primary" size="pill" className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "" : "This link is missing a verification token.");
  const started = useRef(false);

  useEffect(() => {
    document.title = "Verify Email | Penni";
  }, []);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api
      .post("/auth/verify-email", null, { params: { token } })
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setMessage(formatApiError(err.response?.data?.detail) || "This verification link is invalid or expired.");
      });
  }, [token]);

  return (
    <div className="min-h-screen grid place-items-center bg-background p-8">
      <div className="w-full max-w-sm text-center">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 text-emerald mx-auto mb-4 animate-spin" />
            <h1 className="text-3xl tracking-tight font-medium">Verifying email</h1>
            <p className="text-sm text-muted-foreground mt-3">One moment while we confirm your address.</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 text-emerald mx-auto mb-4" />
            <h1 className="text-3xl tracking-tight font-medium">Email verified</h1>
            <p className="text-sm text-muted-foreground mt-3">Your email address is now confirmed.</p>
            <Button variant="primary" size="pill" asChild className="mt-6">
              <Link to="/login">Continue to login</Link>
            </Button>
          </>
        )}
        {status === "error" && (
          <>
            <MailWarning className="h-12 w-12 text-ruby mx-auto mb-4" />
            <h1 className="text-3xl tracking-tight font-medium">Verification failed</h1>
            <p className="text-sm text-muted-foreground mt-3">{message}</p>
            <Button variant="outlinePill" asChild className="mt-6">
              <Link to="/login">Back to login</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

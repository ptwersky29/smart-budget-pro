import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import Skeleton from "../components/ui/Skeleton";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [status, setStatus] = useState("loading");

  const sessionId = params.get("session_id") || "";
  const outcome = params.get("outcome") || "";

  useEffect(() => {
    if (!sessionId && !outcome) {
      setStatus("noop");
      return;
    }
    if (outcome && outcome !== "approved") {
      setStatus("failed");
      return;
    }
    (async () => {
      try {
        if (sessionId) {
          const { data } = await api.get(`/billing/status/${sessionId}`);
          if (data.payment_status === "paid" || data.status === "complete") {
            setStatus("success");
          } else {
            setStatus("pending");
          }
        } else {
          setStatus("success");
        }
        await refresh();
      } catch {
        setStatus("pending");
      }
    })();
  }, [sessionId, outcome, refresh]);

  return (
    <div className="min-h-screen grid place-items-center bg-background p-8">
      <div className="rounded-3xl border border-border bg-card p-10 max-w-md w-full text-center">
        {status === "loading" || status === "pending" ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-10 rounded-full mx-auto" />
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
            <Skeleton className="h-12 w-full mt-6" />
          </div>
        ) : status === "success" ? (
          <>
            <CheckCircle2 className="h-12 w-12 text-emerald mx-auto" />
            <h2 className="text-3xl tracking-tight font-medium mt-4">You're Premium</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Unlimited AI, bank sync, premium reports — all unlocked.
            </p>
            <button onClick={() => navigate("/dashboard")} data-testid="goto-dashboard"
                    className="btn-pill gradient-emerald text-white mt-8 w-full">
              Go to dashboard
            </button>
          </>
        ) : (
          <>
            <XCircle className="h-10 w-10 text-ruby mx-auto" />
            <h2 className="text-2xl tracking-tight font-medium mt-4">Payment not completed</h2>
            <p className="text-sm text-muted-foreground mt-2">The transaction did not complete.</p>
            <button onClick={() => navigate("/pricing")}
                    className="btn-pill border border-border mt-6 w-full">
              Back to pricing
            </button>
          </>
        )}
      </div>
    </div>
  );
}

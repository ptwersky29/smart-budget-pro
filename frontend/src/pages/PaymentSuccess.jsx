import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [refreshed, setRefreshed] = useState(false);

  const outcome = params.get("outcome") || "unknown";
  const sessionId = params.get("session_id") || "";
  const approvalCode = params.get("approval_code") || "";
  const status = params.get("status") || "";
  const txnId = params.get("txn_id") || "";
  const signatureValid = params.get("signature_valid") === "1";
  const failReason = params.get("fail_reason") || "";

  useEffect(() => {
    if (outcome === "approved" && !refreshed) {
      refresh().finally(() => setRefreshed(true));
    }
  }, [outcome, refresh, refreshed]);

  const approved = outcome === "approved";

  return (
    <div className="min-h-screen grid place-items-center bg-background p-8">
      <div className="rounded-3xl border border-border bg-card p-10 max-w-md w-full text-center">
        {!sessionId && outcome === "unknown" ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-emerald mx-auto" />
            <h2 className="text-2xl tracking-tight font-medium mt-4">Loading…</h2>
          </>
        ) : approved ? (
          <>
            <CheckCircle2 className="h-12 w-12 text-emerald mx-auto" />
            <h2 className="text-3xl tracking-tight font-medium mt-4">You're Premium ✨</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Unlimited AI, bank sync, premium reports — all unlocked.
            </p>
            <div className="mt-6 p-4 rounded-xl bg-secondary/40 text-left text-xs space-y-1">
              {txnId && <p><span className="text-muted-foreground">Transaction:</span> <span className="font-mono">{txnId}</span></p>}
              {approvalCode && <p><span className="text-muted-foreground">Approval:</span> <span className="font-mono">{approvalCode}</span></p>}
              {status && <p><span className="text-muted-foreground">Status:</span> <span className="font-mono">{status}</span></p>}
              <p className="flex items-center gap-1 pt-1">
                {signatureValid ? <ShieldCheck className="h-3 w-3 text-emerald" /> : <ShieldAlert className="h-3 w-3 text-topaz" />}
                <span className={signatureValid ? "text-emerald" : "text-topaz"}>
                  {signatureValid ? "Signature verified" : "Signature could not be verified"}
                </span>
              </p>
            </div>
            <button onClick={() => navigate("/dashboard")} data-testid="goto-dashboard"
                    className="btn-pill gradient-emerald text-white mt-8 w-full">
              Go to dashboard
            </button>
          </>
        ) : (
          <>
            <XCircle className="h-10 w-10 text-ruby mx-auto" />
            <h2 className="text-2xl tracking-tight font-medium mt-4">Payment not completed</h2>
            <p className="text-sm text-muted-foreground mt-2">
              {failReason ? failReason : status === "DECLINED" ? "Your card was declined." : "The transaction did not complete."}
            </p>
            {(txnId || approvalCode) && (
              <div className="mt-6 p-4 rounded-xl bg-secondary/40 text-left text-xs space-y-1">
                {txnId && <p><span className="text-muted-foreground">Transaction:</span> <span className="font-mono">{txnId}</span></p>}
                {approvalCode && <p><span className="text-muted-foreground">Code:</span> <span className="font-mono">{approvalCode}</span></p>}
                {status && <p><span className="text-muted-foreground">Status:</span> <span className="font-mono">{status}</span></p>}
              </div>
            )}
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

import React, { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useSearchParams } from "react-router-dom";
import { Building2, Loader2, CheckCircle2, XCircle, RefreshCcw, Trash2, ArrowRight, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";

const STATES = {
  idle: { label: "Ready", color: "text-muted-foreground" },
  connecting: { label: "Connecting…", color: "text-topaz" },
  redirecting: { label: "Redirecting to your bank…", color: "text-topaz" },
  verifying: { label: "Verifying…", color: "text-topaz" },
  success: { label: "Connected", color: "text-emerald" },
  failed: { label: "Failed", color: "text-ruby" },
};

export default function Connections() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [conns, setConns] = useState([]);
  const [logs, setLogs] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, l, tl] = await Promise.all([
        api.get("/truelayer/connections"),
        api.get("/truelayer/logs"),
        api.get("/integrations/truelayer"),
      ]);
      setConns(c.data.connections); setLogs(l.data.logs);
      setNeedsSetup(!tl.data.has_secret);
    } catch (err) { console.error("connections load failed", err); }
  }, []);

  useEffect(() => {
    const s = params.get("status");
    if (s === "success") { setStatus("success"); toast.success("Bank connected successfully"); }
    if (s === "failed") { setStatus("failed"); setError(params.get("reason")); toast.error("Connection failed"); }
    load();
  }, [params, load]);

  const connect = async () => {
    setStatus("connecting"); setError(null);
    try {
      const { data } = await api.get("/truelayer/auth-url");
      setStatus("redirecting");
      // Brief visual delay so user sees the state
      setTimeout(() => { window.location.href = data.auth_url; }, 600);
    } catch (e) {
      setStatus("failed");
      const msg = formatApiError(e.response?.data?.detail);
      setError(msg);
      if (msg?.includes("not configured")) {
        toast.error("TrueLayer not configured. An admin needs to add credentials in Settings.");
      } else {
        toast.error("Could not generate auth URL");
      }
    }
  };

  const removeConn = async (id) => {
    try { await api.delete(`/truelayer/connections/${id}`); toast.success("Connection removed"); await load(); }
    catch (err) { console.error(err); toast.error("Could not remove"); }
  };

  const refreshConn = async (id) => {
    try { await api.post(`/truelayer/refresh/${id}`); toast.success("Token refreshed"); await load(); }
    catch (e) { console.error(e); toast.error(formatApiError(e.response?.data?.detail) || "Refresh failed"); }
  };

  return (
    <div className="space-y-8" data-testid="connections-root">
      <div>
        <p className="label-overline text-emerald">Banks</p>
        <h1 className="text-4xl tracking-tight font-medium mt-1">Bank connections.</h1>
        <p className="text-sm text-muted-foreground mt-2">Connect your UK bank securely via TrueLayer. Read-only. Revoke any time.</p>
      </div>

      {needsSetup && (
        <div className="rounded-2xl border border-topaz/40 bg-topaz/5 p-4 flex items-center gap-3" data-testid="needs-setup">
          <SettingsIcon className="h-5 w-5 text-topaz shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-sm">TrueLayer isn't set up yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">Add your TrueLayer Client ID and Secret in Integrations before connecting a bank.</p>
          </div>
          <a href="/integrations" className="btn-pill border border-topaz text-topaz text-sm hover:bg-topaz/10">Set up</a>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl gradient-emerald grid place-items-center"><Building2 className="h-7 w-7 text-white" /></div>
            <div>
              <p className="text-xl tracking-tight font-medium">Connect a new bank</p>
              <p className={`text-sm ${STATES[status].color}`}>{STATES[status].label}{error ? ` — ${error}` : ""}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {status === "failed" && (
              <button onClick={connect} data-testid="retry-connect" className="btn-pill border border-border text-sm">Retry</button>
            )}
            <button onClick={connect} disabled={status === "connecting" || status === "redirecting" || needsSetup} data-testid="connect-bank-button" className="btn-pill gradient-emerald text-white text-sm disabled:opacity-50">
              {status === "connecting" || status === "redirecting" ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Working…</> : <>Connect Bank <ArrowRight className="h-4 w-4 ml-2" /></>}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="p-6 border-b border-border">
          <p className="label-overline">Linked accounts</p>
          <p className="text-xl tracking-tight font-medium mt-1">{conns.length} connection{conns.length !== 1 ? "s" : ""}</p>
        </div>
        {conns.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No banks connected yet.</div>
        ) : (
          <ul>
            {conns.map((c) => (
              <li key={c.connection_id} className="px-6 py-4 flex items-center justify-between border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary grid place-items-center"><Building2 className="h-4 w-4" /></div>
                  <div>
                    <p className="font-medium">{c.provider_name}</p>
                    <p className="text-xs text-muted-foreground">expires {c.expires_at?.slice(0, 10)} · status {c.status}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => refreshConn(c.connection_id)} data-testid={`refresh-${c.connection_id}`} className="h-9 w-9 rounded-full grid place-items-center hover:bg-secondary"><RefreshCcw className="h-4 w-4" /></button>
                  <button onClick={() => removeConn(c.connection_id)} data-testid={`remove-${c.connection_id}`} className="h-9 w-9 rounded-full grid place-items-center hover:bg-secondary text-ruby"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="rounded-2xl border border-border bg-card">
        <summary onClick={() => setShowDebug(!showDebug)} data-testid="toggle-debug" className="px-6 py-4 cursor-pointer label-overline">OAuth debug logs ({logs.length})</summary>
        <div className="px-6 pb-6 space-y-2 text-xs font-mono max-h-72 overflow-auto">
          {logs.map((l) => (
            <div key={l.log_id} className="flex gap-3">
              {l.event.includes("success") ? <CheckCircle2 className="h-3 w-3 text-emerald shrink-0 mt-0.5"/> : l.event.includes("fail") || l.event.includes("error") ? <XCircle className="h-3 w-3 text-ruby shrink-0 mt-0.5"/> : <span className="w-3 h-3 rounded-full bg-muted shrink-0 mt-0.5"/>}
              <div>
                <p className="text-foreground">{l.event}</p>
                <p className="text-muted-foreground">{l.created_at?.slice(0, 19)} · {JSON.stringify(l.payload).slice(0, 80)}</p>
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

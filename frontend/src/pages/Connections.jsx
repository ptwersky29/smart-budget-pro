import React, { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useSearchParams } from "react-router-dom";
import { Building2, Loader2, CheckCircle2, XCircle, RefreshCcw, Trash2, ArrowRight, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, MetricCard, PageHeader, SectionCard } from "../components/ui/layout";

export default function Connections() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [conns, setConns] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [totalTx, setTotalTx] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [importFromDate, setImportFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/truelayer/connections");
      setConns(data.connections);
      setSyncLogs(data.recent_syncs);
      setTotalTx(data.total_transactions);
    } catch (err) {
      if (err.response?.status === 500 && err.response?.data?.detail?.includes("configured")) {
        setNeedsSetup(true);
      }
      console.error("connections load failed", err);
    }
  }, []);

  const reconnectCount = conns.filter((c) => c.status === "reconnect_required").length;

  useEffect(() => {
    const s = params.get("status");
    const reason = params.get("reason");
    if (s === "success") { setStatus("success"); toast.success(`Bank connected — ${params.get("accounts") || ""} account(s) linked`); }
    if (s === "failed") {
      setStatus("failed");
      setError(reason);
      if (reason === "no_accounts") {
        toast.error("No bank accounts were selected");
      } else if (reason === "invalid_state") {
        toast.error("Your connect session expired. Please try again.");
      } else if (reason === "token_exchange") {
        toast.error("Bank authentication failed. Please reconnect.");
      } else {
        toast.error("Connection failed");
      }
    }
    load();
  }, [params, load]);

  const connect = async () => {
    setStatus("connecting"); setError(null);
    try {
      const { data } = await api.get("/truelayer/auth-url", {
        params: importFromDate ? { from_date: importFromDate } : {},
      });
      setStatus("redirecting");
      setTimeout(() => { window.location.href = data.auth_url; }, 600);
    } catch (e) {
      setStatus("failed");
      const msg = formatApiError(e.response?.data?.detail);
      setError(msg);
      if (msg?.includes("not configured") || msg?.includes("administrator")) {
        setNeedsSetup(true);
        toast.error("Banking not configured yet — admin needs to set up TrueLayer");
      } else if (msg?.toLowerCase().includes("date")) {
        toast.error("Please choose a valid import start date");
      } else {
        toast.error(msg || "Could not connect");
      }
    }
  };

  const reconnectConn = async (connectionId) => {
    setStatus("connecting"); setError(null);
    try {
      const { data } = await api.post(`/truelayer/reconnect/${connectionId}`);
      setStatus("redirecting");
      setTimeout(() => { window.location.href = data.auth_url; }, 600);
    } catch (e) {
      setStatus("failed");
      const msg = formatApiError(e.response?.data?.detail);
      setError(msg);
      if (msg?.includes("not configured")) {
        setNeedsSetup(true);
      }
      toast.error(msg || "Reconnect failed");
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/truelayer/sync");
      toast.success(`Synced: ${data.new_transactions} new, ${data.duplicates_skipped} duplicates`);
      setTotalTx(prev => prev + data.new_transactions);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Sync failed");
    } finally { setSyncing(false); }
  };

  const removeConn = async (id) => {
    try { await api.delete(`/truelayer/connections/${id}`); toast.success("Connection removed"); await load(); }
    catch (err) { console.error(err); toast.error("Could not remove"); }
  };

  return (
    <div className="space-y-8" data-testid="connections-root">
      <PageHeader
        eyebrow="Accounts"
        title="Bank connections."
        description="Connect your UK bank securely via TrueLayer, keep sync status visible, and reconnect when needed."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Connections" value={conns.length.toString()} icon={Building2} />
        <MetricCard label="Transactions synced" value={totalTx.toLocaleString()} icon={Clock} />
        <MetricCard label="Reconnect needed" value={reconnectCount.toString()} tone={reconnectCount ? "ruby" : "emerald"} />
      </div>

      {needsSetup && (
        <div className="rounded-[1.5rem] border border-topaz/40 bg-topaz/5 p-4 flex items-center gap-3" data-testid="needs-setup">
          <AlertCircle className="h-5 w-5 text-topaz shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-sm">Banking not yet available</p>
            <p className="text-xs text-muted-foreground mt-0.5">The administrator needs to configure TrueLayer in Settings before you can connect a bank.</p>
          </div>
          <a href="/settings" className="btn-pill border border-topaz text-topaz text-sm hover:bg-topaz/10">Admin settings</a>
        </div>
      )}

      {!needsSetup && conns.some((c) => c.status === "reconnect_required") && (
        <div className="rounded-[1.5rem] border border-ruby/40 bg-ruby/5 p-4 flex items-center gap-3" data-testid="needs-reconnect">
          <AlertCircle className="h-5 w-5 text-ruby shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-sm">One or more bank connections need reconnecting</p>
            <p className="text-xs text-muted-foreground mt-0.5">Click Connect Bank again to re-authenticate the affected bank and resume automatic sync.</p>
          </div>
        </div>
      )}

      {!needsSetup && (
        <SectionCard eyebrow="Connect" title="Add a new bank" contentClassName="pt-0">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl gradient-emerald grid place-items-center"><Building2 className="h-7 w-7 text-white" /></div>
              <div>
                <p className="text-xl tracking-tight font-medium">Connect a new bank</p>
                <p className="text-sm text-muted-foreground">Securely link your UK bank account — read-only access</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 min-w-[260px]">
              <div>
                <label className="label-overline">Import start date</label>
                <input
                  type="date"
                  value={importFromDate}
                  onChange={(e) => setImportFromDate(e.target.value)}
                  className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none"
                />
                <p className="text-xs text-muted-foreground mt-1">FinanceAI will import transactions from this date when you connect.</p>
              </div>
              <div className="flex gap-2 justify-end">
              {status === "failed" && (
                <button onClick={connect} data-testid="retry-connect" className="btn-pill border border-border text-sm">Retry</button>
              )}
              <button onClick={connect} disabled={status === "connecting" || status === "redirecting"} data-testid="connect-bank-button" className="btn-pill gradient-emerald text-white text-sm disabled:opacity-50">
                {status === "connecting" || status === "redirecting" ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Working…</> : <>Connect Bank <ArrowRight className="h-4 w-4 ml-2" /></>}
              </button>
              </div>
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-ruby">Failed: {error}</p>}
        </SectionCard>
      )}

      <SectionCard eyebrow="Linked accounts" title={`${conns.length} connection${conns.length !== 1 ? "s" : ""}`} contentClassName="p-0">
        <div className="p-6 border-b border-border/70 flex items-center justify-between flex-wrap gap-3">
          {conns.length > 0 && (
            <button onClick={syncNow} disabled={syncing} data-testid="sync-now" className="btn-pill border border-border text-sm disabled:opacity-50">
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
        {conns.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={needsSetup ? "Banking not configured yet" : "No banks connected yet"}
              description={needsSetup ? "The administrator needs to configure TrueLayer in Settings before you can connect a bank." : "Click Connect Bank above to get started."}
              className="border-0 bg-transparent shadow-none"
            />
          </div>
        ) : (
          <ul>
            {conns.map((c) => (
              <li key={c.connection_id} className="px-6 py-4 flex items-center justify-between border-b border-border/70 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary grid place-items-center"><Building2 className="h-4 w-4" /></div>
                  <div>
                    <p className="font-medium">{c.account_name}
                      {c.account_type && <span className="text-xs text-muted-foreground ml-2">{c.account_type}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.status === "active" ? <span className="text-emerald">Active</span> : c.status === "reconnect_required" ? <span className="text-ruby">Reconnect required</span> : c.status}
                      {c.import_from_date && <span className="ml-2">importing from {new Date(c.import_from_date).toLocaleDateString()}</span>}
                      {c.expires_at && <span className="ml-2">expires {new Date(c.expires_at).toLocaleDateString()}</span>}
                      {c.last_sync_at && <span className="ml-2">last sync {new Date(c.last_sync_at).toLocaleDateString()}</span>}
                    </p>
                    {c.last_error && <p className="text-xs text-ruby mt-1 max-w-[48rem] truncate" title={c.last_error}>{c.last_error}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c.status === "reconnect_required" && (
                    <button onClick={() => reconnectConn(c.connection_id)} data-testid={`reconnect-${c.connection_id}`} className="btn-pill border border-ruby text-ruby text-sm">
                      Reconnect
                    </button>
                  )}
                  <button onClick={() => removeConn(c.connection_id)} data-testid={`remove-${c.connection_id}`} className="h-9 w-9 rounded-full grid place-items-center hover:bg-secondary text-ruby"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {syncLogs.length > 0 && (
        <SectionCard eyebrow="Sync history" title="Recent transaction sync activity" contentClassName="p-0">
          <div className="divide-y divide-border text-sm max-h-64 overflow-auto">
            {syncLogs.map((l, i) => (
              <div key={i} className="px-6 py-3 flex items-center gap-3">
                {l.status === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald shrink-0" /> :
                 l.status === "error" ? <XCircle className="h-4 w-4 text-ruby shrink-0" /> :
                 <span className="h-4 w-4 rounded-full bg-muted shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="truncate">{l.message || l.event}</p>
                  <p className="text-xs text-muted-foreground">{l.created_at ? new Date(l.created_at).toLocaleString() : ""}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

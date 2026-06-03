import React, { useCallback, useEffect, useState, useRef } from "react";
import { api, formatApiError } from "../lib/api";
import { useSearchParams } from "react-router-dom";
import { Building2, Loader2, CheckCircle2, XCircle, RefreshCcw, Trash2, ArrowRight, AlertCircle, Clock, Wallet } from "lucide-react";
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
  const [initialSync, setInitialSync] = useState(false);
  const [initialSyncPhase, setInitialSyncPhase] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [importFromDate, setImportFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  });
  const [editingNickname, setEditingNickname] = useState(null);
  const [nicknameValue, setNicknameValue] = useState("");
  const pollingRef = useRef(null);
  const pollAbortRef = useRef(null);

  const load = useCallback(async () => {
    if (pollAbortRef.current) pollAbortRef.current.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    try {
      const { data } = await api.get("/truelayer/connections", { signal: controller.signal });
      if (controller.signal.aborted) return;
      setConns(data.connections);
      setSyncLogs(data.recent_syncs);
      setTotalTx(data.total_transactions);
    } catch (err) {
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
      if (err.response?.status === 500 && err.response?.data?.detail?.includes("configured")) {
        setNeedsSetup(true);
      }
      console.error("connections load failed", err);
    }
  }, []);

  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/truelayer/sync");
      toast.success(`Synced: ${data.new_transactions} new, ${data.duplicates_skipped} duplicates`);
      setTotalTx(prev => prev + data.new_transactions);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Sync failed");
    } finally { setSyncing(false); }
  }, [load]);

  const reconnectCount = conns.filter((c) => c.status === "reconnect_required").length;
  const totalBalance = conns.reduce((sum, c) => sum + (c.balance || 0), 0);

  useEffect(() => {
    const s = params.get("status");
    const reason = params.get("reason");
    const accts = parseInt(params.get("accounts") || "0", 10);
    if (s === "success") {
      setStatus("success");
      toast.success(`Bank connected — ${params.get("accounts") || ""} account(s) linked`);
      // Auto-start initial sync
      if (accts > 0) {
        setInitialSync(true);
        setInitialSyncPhase("Importing transactions...");
        doSync().finally(() => {
          setInitialSync(false);
          setInitialSyncPhase("");
        });
      }
    }
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
    // Start polling for live updates (async-safe: waits for each request to finish)
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      await load();
      if (cancelled) return;
      pollingRef.current = setTimeout(poll, 15000);
    };
    poll();
    return () => {
      cancelled = true;
      if (pollingRef.current) { clearTimeout(pollingRef.current); pollingRef.current = null; }
      if (pollAbortRef.current) { pollAbortRef.current.abort(); pollAbortRef.current = null; }
    };
  }, [params, load, doSync]);

  const saveNickname = async (connectionId) => {
    try {
      await api.put(`/truelayer/connections/${connectionId}`, { nickname: nicknameValue });
      toast.success("Nickname saved");
      setEditingNickname(null);
      await load();
    } catch (e) {
      toast.error("Failed to save nickname");
    }
  };

  const editDate = async (connectionId, date) => {
    try {
      await api.put(`/truelayer/connections/${connectionId}`, { import_start_date: date });
      toast.success("Import date updated");
      await load();
    } catch (e) {
      toast.error("Failed to update import date");
    }
  };

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

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <MetricCard label="Connections" value={conns.length.toString()} icon={Building2} />
        <MetricCard label="Transactions synced" value={totalTx.toLocaleString()} icon={Clock} />
        <MetricCard label="Total Balance" value={totalBalance !== 0 ? `£${totalBalance.toLocaleString()}` : "—"} icon={Wallet} tone="emerald" />
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

      {initialSync && (
        <div className="rounded-2xl border border-emerald/40 bg-emerald/5 p-5 flex items-center gap-4">
          <Loader2 className="h-5 w-5 animate-spin text-emerald shrink-0" />
          <div>
            <p className="font-medium text-sm text-emerald">{initialSyncPhase}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Your bank transactions are being imported in the background. This may take a minute.</p>
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
                  className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-ring focus:outline-none"
                />
                <p className="text-xs text-muted-foreground mt-1">FinanceAI will import transactions from this date when you connect.</p>
              </div>
              <div className="flex gap-2 justify-end">
              {status === "failed" && (
                <button onClick={connect} data-testid="retry-connect" className="btn-pill border border-border text-sm">Retry</button>
              )}
              <button onClick={connect} disabled={status === "connecting" || status === "redirecting" || initialSync} data-testid="connect-bank-button" className="btn-pill gradient-emerald text-white text-sm disabled:opacity-50">
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
            <button onClick={doSync} disabled={syncing || initialSync} data-testid="sync-now" className="btn-pill border border-border text-sm disabled:opacity-50">
              {syncing || initialSync ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
              {syncing || initialSync ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
        {conns.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Building2}
              title={needsSetup ? "Banking not configured yet" : "No banks connected yet"}
              description={needsSetup ? "The administrator needs to configure TrueLayer in Settings before you can connect a bank." : "Click Connect Bank above to get started."}
            />
          </div>
        ) : (
          <ul>
            {conns.map((c) => (
              <li key={c.connection_id} className="px-6 py-4 flex items-center justify-between border-b border-border/70 last:border-0 gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-secondary grid place-items-center shrink-0"><Building2 className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {editingNickname === c.connection_id ? (
                        <form onSubmit={(e) => { e.preventDefault(); saveNickname(c.connection_id); }} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={nicknameValue}
                            onChange={(e) => setNicknameValue(e.target.value)}
                            className="h-8 px-3 rounded-xl bg-secondary/50 border border-border focus:border-ring focus:outline-none text-sm font-medium w-48"
                            autoFocus
                          />
                          <button type="submit" className="text-xs text-emerald font-medium">Save</button>
                          <button type="button" onClick={() => setEditingNickname(null)} className="text-xs text-muted-foreground">Cancel</button>
                        </form>
                      ) : (
                        <>
                          <p className="font-medium truncate">{c.account_name}</p>
                          <button onClick={() => { setEditingNickname(c.connection_id); setNicknameValue(c.nickname || c.account_name); }} className="text-xs text-muted-foreground hover:text-emerald shrink-0">✎</button>
                        </>
                      )}
                      {c.account_type && <span className="text-xs text-muted-foreground shrink-0">{c.account_type}</span>}
                      {c.balance !== null && c.balance !== undefined && (
                        <span className="text-sm font-semibold text-foreground ml-auto shrink-0">
                          £{c.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-xs text-muted-foreground font-normal ml-1">{c.balance_currency}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {c.status === "active" ? <span className="text-emerald">● Active</span> : c.status === "reconnect_required" ? <span className="text-ruby">● Reconnect required</span> : <span className="text-topaz">● {c.status}</span>}
                      {c.import_from_date && <span className="ml-2">from {new Date(c.import_from_date).toLocaleDateString()}</span>}
                      {c.last_sync_at && <span className="ml-2">synced {new Date(c.last_sync_at).toLocaleString()}</span>}
                    </p>
                    {c.last_error && <p className="text-xs text-ruby mt-1 max-w-[48rem] truncate" title={c.last_error}>{c.last_error}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.status === "reconnect_required" && (
                    <button onClick={() => reconnectConn(c.connection_id)} data-testid={`reconnect-${c.connection_id}`} className="btn-pill border border-ruby text-ruby text-xs whitespace-nowrap">
                      Reconnect
                    </button>
                  )}
                  <button onClick={() => removeConn(c.connection_id)} data-testid={`remove-${c.connection_id}`} className="h-9 w-9 rounded-full grid place-items-center hover:bg-secondary text-ruby" title="Remove connection"><Trash2 className="h-4 w-4" /></button>
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

import React, { useCallback, useEffect, useState, useRef } from "react";
import { api, formatApiError } from "../lib/api";
import { useSearchParams, Link } from "react-router-dom";
import { Building2, Loader2, CheckCircle2, XCircle, RefreshCcw, Trash2, ArrowRight, AlertCircle, Clock, Wallet, Pencil } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, MetricCard, PageHeader, SectionCard } from "../components/ui/layout";
import Skeleton from "../components/ui/Skeleton";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BankCardMockup from "../components/BankCardMockup";

export default function Connections() {
  useEffect(() => { document.title = "Bank Connections | FinanceAI"; }, []);
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
        eyebrow="Import"
        title="Bank connections."
        description="Connect your UK bank securely via TrueLayer, keep sync status visible, and reconnect when needed."
        actions={
          <div className="flex items-center gap-3">
            <div>
              <input type="date" value={importFromDate} onChange={(e) => setImportFromDate(e.target.value)}
                className="h-10 px-3 rounded-xl bg-secondary/50 border border-transparent text-xs sm:text-sm focus:border-ring focus:outline-none" />
            </div>
            <Button onClick={connect} disabled={status === "connecting" || status === "redirecting" || initialSync} data-testid="connect-bank-button" variant="primary" size="pill">
              {status === "connecting" || status === "redirecting" ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</> : <>Connect Bank <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
            {status === "failed" && (
              <Button onClick={connect} data-testid="retry-connect" variant="outlinePill" size="pill">Retry</Button>
            )}
          </div>
        }
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
          <Button variant="outlinePill" size="pillSm" className="border-topaz text-topaz hover:bg-topaz/10" asChild>
            <a href="/settings">Admin settings</a>
          </Button>
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
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-ruby">Failed: {error}</p>}

      <SectionCard eyebrow="Linked accounts" title={`${conns.length} connection${conns.length !== 1 ? "s" : ""}`} contentClassName="p-0">
        <div className="p-6 border-b border-border/70 flex items-center justify-between flex-wrap gap-3">
          {conns.length > 0 && (
            <Button onClick={doSync} disabled={syncing || initialSync} data-testid="sync-now" variant="outlinePill" size="pill">
              {syncing || initialSync ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
              {syncing || initialSync ? "Syncing…" : "Sync now"}
            </Button>
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
          <div className="p-5 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {conns.map((c, i) => {
                const bcInst = c.config?.institution || c.account_name || c.nickname || c.provider;
                return (
                  <div key={c.connection_id} className={`fade-up delay-${Math.min(i, 5)}`}>
                    <BankCardMockup connection={c} size="sm" showStatus />
                    {/* Actions row below card */}
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      {editingNickname === c.connection_id ? (
                        <form onSubmit={(e) => { e.preventDefault(); saveNickname(c.connection_id); }} className="flex items-center gap-1.5 w-full">
                          <input type="text" value={nicknameValue} onChange={(e) => setNicknameValue(e.target.value)}
                            className="flex-1 h-8 px-2.5 rounded-lg bg-secondary/50 border border-border focus:border-ring focus:outline-none text-xs font-medium" autoFocus />
                          <button type="submit" className="text-xs text-emerald font-medium shrink-0">Save</button>
                          <button type="button" onClick={() => setEditingNickname(null)} className="text-xs text-muted-foreground shrink-0">Cancel</button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button onClick={(e) => { e.preventDefault(); setEditingNickname(c.connection_id); setNicknameValue(c.nickname || c.account_name); }}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald transition-colors">
                            <Pencil className="h-3 w-3" /> {c.nickname ? "Edit" : "Rename"}
                          </button>
                          <span className="text-xs text-muted-foreground/40">·</span>
                          {c.status === "active" ? <span className="text-[11px] text-emerald font-medium">● Active</span> : c.status === "reconnect_required" ? <span className="text-[11px] text-ruby font-medium">● Reconnect</span> : <span className="text-[11px] text-topaz">● {c.status}</span>}
                          {c.import_from_date && <><span className="text-xs text-muted-foreground/40">·</span><span className="text-[11px] text-muted-foreground">from {new Date(c.import_from_date).toLocaleDateString()}</span></>}
                        </div>
                      )}
                    </div>
                    {c.last_sync_at && !editingNickname && (
                      <p className="text-[10px] text-muted-foreground mt-1">synced {new Date(c.last_sync_at).toLocaleString()}</p>
                    )}
                    {c.last_error && !editingNickname && (
                      <p className="text-[10px] text-ruby mt-1 truncate" title={c.last_error}>{c.last_error}</p>
                    )}
                    {/* Action buttons */}
                    <div className="mt-2 flex items-center gap-2">
                      {c.status === "reconnect_required" && (
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); reconnectConn(c.connection_id); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-ruby/30 text-ruby hover:bg-ruby/5 transition-colors">
                          Reconnect
                        </button>
                      )}
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeConn(c.connection_id); }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-ruby hover:border-ruby/30 transition-colors">
                        <Trash2 className="h-3 w-3 inline mr-1" />Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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

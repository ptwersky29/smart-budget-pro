import React, { useCallback, useEffect, useState, useRef } from "react";
import { api, formatApiError } from "../lib/api";
import { Building2, Loader2, Upload, RefreshCcw, Trash2, AlertCircle, ArrowRight, FileText } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader, SectionCard } from "../components/ui/layout";
import { Button } from "../components/ui/button";
import BankCardMockup from "../components/BankCardMockup";

export default function BankStatements() {
  useEffect(() => { document.title = "Bank & Statements | FinanceAI"; }, []);
  const [status, setStatus] = useState("idle");
  const [conns, setConns] = useState([]);
  const [totalTx, setTotalTx] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [importFromDate, setImportFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  });

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const loadConns = useCallback(async () => {
    try {
      const { data } = await api.get("/truelayer/connections");
      setConns(data.connections);
      setTotalTx(data.total_transactions);
    } catch (err) {
      if (err.response?.status === 500 && err.response?.data?.detail?.includes("configured")) {
        setNeedsSetup(true);
      }
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/statements");
      setUploadHistory(data.statements || data || []);
    } catch {}
  }, []);

  useEffect(() => { loadConns(); loadHistory(); }, [loadConns, loadHistory]);

  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/truelayer/sync");
      toast.success(`Synced: ${data.new_transactions} new, ${data.duplicates_skipped} duplicates`);
      await loadConns();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Sync failed");
    } finally { setSyncing(false); }
  }, [loadConns]);

  const connect = async () => {
    setStatus("connecting");
    try {
      const { data } = await api.get("/truelayer/auth-url", {
        params: importFromDate ? { from_date: importFromDate } : {},
      });
      setStatus("redirecting");
      setTimeout(() => { window.location.href = data.auth_url; }, 600);
    } catch (e) {
      setStatus("failed");
      const msg = formatApiError(e.response?.data?.detail);
      if (msg?.includes("not configured") || msg?.includes("administrator")) {
        setNeedsSetup(true);
        toast.error("Banking not configured yet — admin needs to set up TrueLayer");
      } else {
        toast.error(msg || "Could not connect");
      }
    }
  };

  const removeConn = async (id) => {
    try { await api.delete(`/truelayer/connections/${id}`); toast.success("Connection removed"); await loadConns(); }
    catch { toast.error("Could not remove"); }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File too large — max 5 MB"); return; }
    setUploadBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/statements/upload", fd);
      toast.success(`Statement processed: ${data.transaction_count || 0} transactions found`);
      await loadHistory();
    } catch (e) { toast.error(formatApiError(e) || "Upload failed"); }
    finally { setUploadBusy(false); }
  };

  const totalBalance = conns.reduce((sum, c) => sum + (c.balance || 0), 0);
  const needsReconnect = conns.some((c) => c.status === "reconnect_required");

  return (
    <div className="space-y-8" data-testid="import-root">
      <PageHeader
        eyebrow="Import"
        title="Import your data."
        description="Connect your bank, upload statements, and keep everything in sync."
        actions={
          <Button variant="outlinePill" size="pill" onClick={doSync} disabled={syncing || conns.length === 0}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Sync now
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-3 sm:p-5 shadow-card">
          <p className="label-overline text-[10px] sm:text-[11px]">Bank connections</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-3xl tracking-tight font-semibold">{conns.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-3 sm:p-5 shadow-card">
          <p className="label-overline text-[10px] sm:text-[11px]">Transactions synced</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-3xl tracking-tight font-semibold">{totalTx.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-3 sm:p-5 shadow-card">
          <p className="label-overline text-[10px] sm:text-[11px]">Total balance</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-3xl tracking-tight font-semibold">{totalBalance !== 0 ? `£${totalBalance.toLocaleString()}` : "—"}</p>
        </div>
      </div>

      {(needsSetup || needsReconnect) && (
        <div className={`rounded-xl border p-3 flex items-center gap-2 text-xs ${needsReconnect ? "border-ruby/40 bg-ruby/5 text-ruby" : "border-topaz/40 bg-topaz/5 text-topaz"}`}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          {needsReconnect
            ? "Some bank connections need reconnecting — use the Reconnect button below."
            : "Banking not configured — ask an admin to set up TrueLayer in Settings."}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Bank Connections */}
        <SectionCard contentClassName="p-0">
          <div className="p-5 border-b border-border/70 flex items-center gap-3 flex-wrap">
          <Button variant="primary" size="pill" onClick={connect} disabled={status === "connecting" || status === "redirecting"}>
            {status === "connecting" || status === "redirecting" ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</> : <>Connect Bank <ArrowRight className="h-4 w-4" /></>}
          </Button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              From
              <input type="date" value={importFromDate} onChange={(e) => setImportFromDate(e.target.value)}
                className="h-8 px-2 rounded-lg bg-secondary/50 border border-transparent text-xs focus:border-ring focus:outline-none" />
            </label>
          </div>
          {conns.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Building2} title="No banks connected" description="Connect a bank to automatically import transactions." />
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {conns.map((c, i) => (
                  <div key={c.connection_id} className={`fade-up delay-${Math.min(i, 5)}`}>
                    <BankCardMockup connection={c} size="xs" showStatus />
                    <div className="mt-2 flex items-center gap-2 justify-between">
                      <p className="text-[10px] text-muted-foreground">
                        {c.config?.institution && <span>{c.config.institution}</span>}
                        {c.last_sync_at && <span>{c.config?.institution ? " · " : ""}synced {new Date(c.last_sync_at).toLocaleDateString()}</span>}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {c.status === "reconnect_required" && (
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation();
                            (async () => { try { const { data } = await api.post(`/truelayer/reconnect/${c.connection_id}`); setTimeout(() => { window.location.href = data.auth_url; }, 600); } catch { toast.error("Reconnect failed"); } })();
                          }} className="text-xs px-2 py-1 rounded-lg border border-ruby/30 text-ruby hover:bg-ruby/5 transition-colors">Reconnect</button>
                        )}
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeConn(c.connection_id); }}
                          className="text-xs px-2 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-ruby hover:border-ruby/30 transition-colors">
                          <Trash2 className="h-3 w-3 inline mr-1" />Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Statement Upload */}
        <SectionCard eyebrow="Manual import" title="Upload a statement" contentClassName="p-0">
          <div
            className={`p-10 text-center border-b border-border/70 transition-colors ${dragOver ? "bg-emerald/5" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files[0]); }}
          >
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
              <Upload className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium">Drop a CSV or PDF here</p>
            <p className="text-xs text-muted-foreground mt-1">or click to browse — max 5 MB</p>
            <input ref={fileRef} type="file" accept=".csv,.pdf" onChange={(e) => { handleUpload(e.target.files[0]); e.target.value = ""; }}
              className="hidden" />
            <Button variant="outlinePill" size="pill" onClick={() => fileRef.current?.click()} disabled={uploadBusy} className="mt-4">
              {uploadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploadBusy ? "Processing…" : "Choose file"}
            </Button>
          </div>
          {uploadHistory.length > 0 ? (
            <div className="divide-y divide-border text-sm max-h-48 overflow-auto">
              {uploadHistory.map((s, i) => (
                <div key={i} className="px-6 py-3 flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs">{s.filename || `Statement ${i + 1}`}</p>
                    <p className="text-xs text-muted-foreground">{s.created_at ? new Date(s.created_at).toLocaleDateString() : ""}</p>
                  </div>
                  {s.transaction_count && <span className="text-xs text-muted-foreground shrink-0">{s.transaction_count} txns</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No statements uploaded yet
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

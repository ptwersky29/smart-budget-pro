import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Upload, FileText, Loader2, Sparkles, CheckCircle2, Trash2, ArrowDownRight, ArrowUpRight, Save } from "lucide-react";
import { PageHeader, SectionCard } from "../components/ui/layout";
import Skeleton from "../components/ui/Skeleton";

export default function Statements() {
  useEffect(() => { document.title = "Statements | FinanceAI"; }, []);
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(null); // freshly parsed result
  const [history, setHistory] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/statements");
      setHistory(data.statements);
    } catch (err) { toast.error("Could not load statement history"); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const onFile = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File too large (max 5 MB)"); return; }
    setBusy(true); setCurrent(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/statements/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setCurrent(data);
      toast.success(`AI extracted ${data.transaction_count} transaction${data.transaction_count !== 1 ? "s" : ""}`);
      await loadHistory();
    } catch (e) {
      console.error(e);
      toast.error(formatApiError(e.response?.data?.detail) || "Upload failed");
    } finally { setBusy(false); }
  };

  const saveAll = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/statements/${current.statement_id}/save`);
      toast.success(`Saved ${data.saved_count} transactions`);
      setCurrent(null);
      await loadHistory();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Save failed"); }
    finally { setSaving(false); }
  };

  const removeStmt = async (id) => {
    try { await api.delete(`/statements/${id}`); toast.success("Statement removed"); await loadHistory(); }
    catch (err) { console.error(err); toast.error("Could not remove"); }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-8" data-testid="statements-root">
      <PageHeader
        eyebrow="Money"
        title="Drop a statement. AI reads it."
        description="Upload a CSV or PDF bank statement — the system extracts each transaction so you can review and save it in one click."
        meta={user?.tier !== "premium" && user?.role !== "admin" ? [<span key="limit" className="toolbar-chip">Free tier · 1 upload/day</span>] : null}
      />

      <div
        data-testid="statement-dropzone"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${dragging ? "border-emerald bg-emerald/5" : "border-border bg-card hover:border-emerald/50"}`}
      >
        <input ref={fileRef} type="file" accept=".csv,.pdf,application/pdf,text/csv" className="hidden"
               onChange={(e) => onFile(e.target.files?.[0])} data-testid="statement-file-input" />
        {busy ? (
          <div className="space-y-4">
            <Skeleton className="h-14 w-14 rounded-2xl mx-auto" />
            <Skeleton className="h-5 w-48 mx-auto" />
            <Skeleton className="h-4 w-72 mx-auto" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl gradient-emerald grid place-items-center"><Upload className="h-6 w-6 text-white" /></div>
            <p className="text-lg tracking-tight font-medium">Drop a CSV or PDF here</p>
            <p className="text-xs text-muted-foreground">or click to choose — max 5 MB · powered by Claude Sonnet 4.5</p>
          </div>
        )}
      </div>

      {current && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="parsed-preview">
          <div className="p-6 pb-3 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald" /><p className="label-overline">AI extracted</p></div>
              <p className="text-xl tracking-tight font-medium mt-1">{current.transaction_count} transaction{current.transaction_count !== 1 ? "s" : ""} from {current.filename}</p>
              <p className="text-xs text-muted-foreground mt-1">Review below, then save all to your account.</p>
            </div>
            <button onClick={saveAll} disabled={saving} data-testid="save-all-button" className="btn-pill gradient-emerald text-white text-sm disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Save all</>}
            </button>
          </div>
          {/* Mobile card view */}
          <div className="block sm:hidden divide-y divide-border">
            {current.transactions.map((t, i) => (
              <div key={`${t.date}-${i}-${t.description}`} className="px-4 py-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{t.date}</p>
                    <p className="font-medium text-sm truncate max-w-[40vw]" title={t.description}>{t.description}</p>
                  </div>
                  <span className={`shrink-0 font-medium tabular-nums ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}>
                    {t.amount > 0 ? "+" : "−"}{current.currency === "USD" ? "$" : "£"}{Math.abs(t.amount).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary capitalize">{t.category}</span>
                  <span className="text-xs text-muted-foreground">{Math.round((t.confidence || 0) * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-y border-border bg-secondary/30">
                <th className="px-6 py-3">Date</th><th className="px-6 py-3">Description</th><th className="px-6 py-3">Category</th><th className="px-6 py-3">Conf.</th><th className="px-6 py-3 text-right">Amount</th>
              </tr></thead>
              <tbody>
                {current.transactions.map((t, i) => (
                  <tr key={`${t.date}-${i}-${t.description}`} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="px-6 py-3 text-xs text-muted-foreground">{t.date}</td>
                    <td className="px-6 py-3 font-medium max-w-md truncate" title={t.description}>{t.description}</td>
                    <td className="px-6 py-3"><span className="text-xs px-2 py-1 rounded-full bg-secondary capitalize">{t.category}</span></td>
                    <td className="px-6 py-3 text-xs text-muted-foreground">{Math.round((t.confidence || 0) * 100)}%</td>
                    <td className={`px-6 py-3 text-right font-medium ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}>
                      <span className="inline-flex items-center gap-1">
                        {t.amount > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {t.amount > 0 ? "+" : "−"}{current.currency === "USD" ? "$" : "£"}{Math.abs(t.amount).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SectionCard eyebrow="History" title={`${history.length} previous upload${history.length !== 1 ? "s" : ""}`} contentClassName="p-0">
        {history.length === 0 ? (
          <div className="px-6 pb-6 text-sm text-muted-foreground">No statements uploaded yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((s) => (
              <li key={s.statement_id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-secondary grid place-items-center"><FileText className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{s.filename || "Statement"}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.created_at?.slice(0, 10)} · {s.kind?.toUpperCase()} · {Math.round((s.size_bytes || 0) / 1024)} KB
                    {s.saved && <span className="text-emerald"> · {s.saved_count} saved <CheckCircle2 className="h-3 w-3 inline" /></span>}
                  </p>
                </div>
                <button onClick={() => removeStmt(s.statement_id)} data-testid={`del-stmt-${s.statement_id}`} className="p-2 text-muted-foreground hover:text-ruby"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

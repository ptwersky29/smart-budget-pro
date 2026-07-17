import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Upload, FileText, Loader2, Sparkles, CheckCircle2, Trash2, ArrowDownRight, ArrowUpRight, Save, ChevronDown, Building2, Pencil, X, Check } from "lucide-react";
import { PageHeader, SectionCard } from "../components/ui/layout";
import Skeleton from "../components/ui/Skeleton";
import { Button } from "../components/ui/button";

function getDisplayName(a) {
  if (!a) return "";
  const name = a.name || a.provider || "";
  const suffix = a.type === "savings" ? " (Savings)" : a.type === "credit" ? " (Credit)" : "";
  return name + suffix;
}

export default function Statements() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => { document.title = "Statements | Penni"; }, []);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState({});
  const [editingCell, setEditingCell] = useState(null);

  // Pick up draft from route state (e.g. after upload from account detail page)
  useEffect(() => {
    if (location.state?.draft) {
      setCurrent(location.state.draft);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/statements");
      setHistory(data.statements || []);
    } catch (err) { toast.error("Could not load statement history"); }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const { data } = await api.get("/accounts");
      const list = data.accounts || [];
      setAccounts(list);
      if (list.length === 1) setSelectedAccountId(list[0].account_id);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadHistory(); loadAccounts(); }, [loadHistory, loadAccounts]);

  const onFile = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File too large (max 5 MB)"); return; }
    setBusy(true); setCurrent(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/statements/upload", form);
      setCurrent(data);
      toast.success(`AI extracted ${data.transaction_count} transaction${data.transaction_count !== 1 ? "s" : ""}`);
      await loadHistory();
    } catch (e) {
      console.error("[UPLOAD_ERR]", e.response?.status, e.response?.data);
      toast.error(formatApiError(e.response?.data?.detail) || "Upload failed");
    } finally { setBusy(false); }
  };

  const getMergedTransactions = () => {
    const keys = Object.keys(edits);
    if (keys.length === 0) return current.transactions;
    return current.transactions.map((t, i) =>
      edits[i] ? { ...t, ...edits[i] } : t
    );
  };

  const saveAll = async () => {
    if (!current) return;
    if (!selectedAccountId) { toast.error("Select an account before saving"); return; }
    setSaving(true);
    const form = new FormData();
    form.append("account_id", selectedAccountId);
    const merged = getMergedTransactions();
    form.append("transactions_json", JSON.stringify(merged));
    try {
      const { data } = await api.post(`/statements/${current.statement_id}/save`, form);
      toast.success(`Saved ${data.saved_count} transactions`);
      setCurrent(null);
      setEdits({});
      setEditingCell(null);
      setSelectedAccountId(accounts.length === 1 ? accounts[0].account_id : "");
      await loadHistory();
      navigate("/transactions");
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
            <div className="flex items-center gap-3">
              <div className="relative">
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="appearance-none bg-secondary/60 border border-border rounded-xl px-3 py-2 pr-8 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-emerald/40 cursor-pointer"
                  aria-label="Select account"
                >
                  <option value="" disabled>{accounts.length === 0 ? "No accounts" : "Select account…"}</option>
                  {accounts.map((a) => (
                    <option key={a.account_id} value={a.account_id}>{getDisplayName(a)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
              <Button onClick={saveAll} disabled={saving || !selectedAccountId} data-testid="save-all-button" variant="primary" size="pill">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Save all</>}
              </Button>
            </div>
          </div>
          {/* Mobile card view */}
          <div className="block sm:hidden divide-y divide-border">
            {getMergedTransactions().map((t, i) => {
              const val = edits[i] || {};
              return (
                <div key={`${t.date}-${i}-${t.description}`} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {editingCell?.idx === i && editingCell?.field === "date" ? (
                        <input type="date" value={val.date ?? t.date} onChange={e => { setEdits(p => ({...p, [i]: {...p[i], date: e.target.value}})); setEditingCell(null); }}
                          className="w-full text-xs bg-secondary/40 rounded px-1 py-0.5 border border-emerald/50 focus:outline-none"
                          autoFocus onBlur={() => setEditingCell(null)} />
                      ) : (
                        <p className="text-xs text-muted-foreground cursor-pointer hover:text-emerald flex items-center gap-1"
                           onClick={() => setEditingCell({ idx: i, field: "date" })}>
                          {t.date} <Pencil className="h-3 w-3 opacity-40" />
                        </p>
                      )}
                      {editingCell?.idx === i && editingCell?.field === "description" ? (
                        <input type="text" defaultValue={val.description ?? t.description}
                          onChange={e => setEdits(p => ({...p, [i]: {...p[i], description: e.target.value}}))}
                          className="w-full text-sm bg-secondary/40 rounded px-1 py-0.5 border border-emerald/50 focus:outline-none"
                          autoFocus onBlur={() => setEditingCell(null)} />
                      ) : (
                        <p className="font-medium text-sm truncate max-w-[40vw] cursor-pointer hover:text-emerald flex items-center gap-1"
                           title={t.description} onClick={() => setEditingCell({ idx: i, field: "description" })}>
                          {t.description} <Pencil className="h-3 w-3 shrink-0 opacity-40" />
                        </p>
                      )}
                    </div>
                    {editingCell?.idx === i && editingCell?.field === "amount" ? (
                      <input type="number" step="0.01" defaultValue={val.amount ?? t.amount}
                        onChange={e => setEdits(p => ({...p, [i]: {...p[i], amount: parseFloat(e.target.value)}}))}
                        className="w-24 text-right text-sm bg-secondary/40 rounded px-1 py-0.5 border border-emerald/50 focus:outline-none tabular-nums"
                        autoFocus onBlur={() => setEditingCell(null)} />
                    ) : (
                      <span className={`shrink-0 font-medium tabular-nums cursor-pointer hover:text-emerald flex items-center gap-1 ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}
                            onClick={() => setEditingCell({ idx: i, field: "amount" })}>
                        {t.amount > 0 ? "+" : "−"}{current.currency === "USD" ? "$" : "£"}{Math.abs(t.amount).toFixed(2)}
                        <Pencil className="h-3 w-3 opacity-40" />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {editingCell?.idx === i && editingCell?.field === "category" ? (
                      <input type="text" defaultValue={val.category ?? t.category}
                        onChange={e => setEdits(p => ({...p, [i]: {...p[i], category: e.target.value}}))}
                        className="text-xs bg-secondary/40 rounded px-1 py-0.5 border border-emerald/50 focus:outline-none capitalize"
                        autoFocus onBlur={() => setEditingCell(null)} />
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary capitalize cursor-pointer hover:text-emerald flex items-center gap-1"
                            onClick={() => setEditingCell({ idx: i, field: "category" })}>
                        {t.category} <Pencil className="h-3 w-3 opacity-40" />
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{Math.round((t.confidence || 0) * 100)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-y border-border bg-secondary/30">
                <th className="px-6 py-3">Date</th><th className="px-6 py-3">Description</th><th className="px-6 py-3">Category</th><th className="px-6 py-3">Conf.</th><th className="px-6 py-3 text-right">Amount</th>
              </tr></thead>
              <tbody>
                {getMergedTransactions().map((t, i) => {
                  const val = edits[i] || {};
                  return (
                    <tr key={`${t.date}-${i}-${t.description}`} className="border-b border-border last:border-0 hover:bg-secondary/40">
                      <td className="px-6 py-3 text-xs text-muted-foreground">
                        {editingCell?.idx === i && editingCell?.field === "date" ? (
                          <input type="date" value={val.date ?? t.date} onChange={e => { setEdits(p => ({...p, [i]: {...p[i], date: e.target.value}})); }}
                            className="w-full bg-secondary/40 rounded px-1 py-0.5 border border-emerald/50 focus:outline-none text-xs"
                            autoFocus onBlur={() => setEditingCell(null)} />
                        ) : (
                          <span className="cursor-pointer hover:text-emerald flex items-center gap-1"
                                onClick={() => setEditingCell({ idx: i, field: "date" })}>
                            {t.date} <Pencil className="h-3 w-3 opacity-30 shrink-0" />
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 font-medium max-w-md truncate">
                        {editingCell?.idx === i && editingCell?.field === "description" ? (
                          <input type="text" defaultValue={val.description ?? t.description}
                            onChange={e => setEdits(p => ({...p, [i]: {...p[i], description: e.target.value}}))}
                            className="w-full bg-secondary/40 rounded px-1 py-0.5 border border-emerald/50 focus:outline-none text-sm"
                            autoFocus onBlur={() => setEditingCell(null)} />
                        ) : (
                          <span className="cursor-pointer hover:text-emerald flex items-center gap-1"
                                title={t.description} onClick={() => setEditingCell({ idx: i, field: "description" })}>
                            {t.description} <Pencil className="h-3 w-3 opacity-30 shrink-0" />
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        {editingCell?.idx === i && editingCell?.field === "category" ? (
                          <input type="text" defaultValue={val.category ?? t.category}
                            onChange={e => setEdits(p => ({...p, [i]: {...p[i], category: e.target.value}}))}
                            className="w-full bg-secondary/40 rounded px-1 py-0.5 border border-emerald/50 focus:outline-none text-xs capitalize"
                            autoFocus onBlur={() => setEditingCell(null)} />
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full bg-secondary capitalize cursor-pointer hover:text-emerald flex items-center gap-1 inline-flex"
                                onClick={() => setEditingCell({ idx: i, field: "category" })}>
                            {t.category} <Pencil className="h-3 w-3 opacity-30" />
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-xs text-muted-foreground">{Math.round((t.confidence || 0) * 100)}%</td>
                      <td className="px-6 py-3 text-right font-medium">
                        {editingCell?.idx === i && editingCell?.field === "amount" ? (
                          <input type="number" step="0.01" defaultValue={val.amount ?? t.amount}
                            onChange={e => setEdits(p => ({...p, [i]: {...p[i], amount: parseFloat(e.target.value)}}))}
                            className="w-28 text-right bg-secondary/40 rounded px-1 py-0.5 border border-emerald/50 focus:outline-none text-sm tabular-nums"
                            autoFocus onBlur={() => setEditingCell(null)} />
                        ) : (
                          <span className={`cursor-pointer hover:text-emerald flex items-center gap-1 justify-end ${t.amount > 0 ? "text-emerald" : "text-foreground"}`}
                                onClick={() => setEditingCell({ idx: i, field: "amount" })}>
                            <span className="inline-flex items-center gap-1">
                              {t.amount > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                              {t.amount > 0 ? "+" : "−"}{current.currency === "USD" ? "$" : "£"}{Math.abs(t.amount).toFixed(2)}
                            </span>
                            <Pencil className="h-3 w-3 opacity-30" />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
              <li key={s.id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-secondary grid place-items-center"><FileText className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{s.filename || "Statement"}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.created_at?.slice(0, 10)} · {s.kind?.toUpperCase()} · {Math.round((s.size_bytes || 0) / 1024)} KB
                    {s.saved && <span className="text-emerald"> · {s.saved_count} saved <CheckCircle2 className="h-3 w-3 inline" /></span>}
                  </p>
                </div>
                <button onClick={() => removeStmt(s.id)} data-testid={`del-stmt-${s.id}`} className="p-2 text-muted-foreground hover:text-ruby"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

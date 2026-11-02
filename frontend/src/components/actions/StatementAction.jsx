import React, { useEffect, useRef, useState } from "react";
import { Upload, Loader2, Save, FileText } from "lucide-react";
import { api, formatApiError } from "../../lib/api";
import { toast } from "sonner";
import PenniSelect from "../PenniSelect";
import { Button } from "../ui/button";

export default function StatementAction({ initialDraft, initialAccountId, onSaved, accounts = [] }) {
  const [draft, setDraft] = useState(initialDraft || null);
  const [rows, setRows] = useState(initialDraft?.transactions || []);
  const [accountId, setAccountId] = useState(initialAccountId || "");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const file = useRef(null);
  useEffect(() => {
    setDraft(initialDraft || null);
    setRows(initialDraft?.transactions || []);
    setAccountId(initialAccountId || "");
  }, [initialDraft, initialAccountId]);

  const upload = async (picked) => {
    if (!picked) return;
    if (picked.size > 5 * 1024 * 1024) { toast.error("Maximum file size is 5 MB"); return; }
    if (!/\.(csv|pdf)$/i.test(picked.name)) { toast.error("Choose a CSV or PDF file"); return; }
    setBusy(true);
    setDuplicateWarning(null);
    try {
      const body = new FormData();
      body.append("file", picked);
      if (accountId) body.append("account_id", accountId);
      const { data } = await api.post("/statements/upload", body);
      setDraft(data);
      setRows(data.transactions || []);
      toast.success("Statement extracted. Review before saving.");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Could not upload statement"); }
    finally { setBusy(false); }
  };
  const update = (index, field, value) => {setDuplicateWarning(null);setRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));};
  const save = async (confirmDuplicates = false) => {
    if (!accountId) { toast.error("Choose the receiving account"); return; }
    if (!draft?.statement_id) { toast.error("Upload a statement first"); return; }
    setSaving(true);
    try {
      const body = new FormData();
      body.append("account_id", accountId);
      body.append("transactions_json", JSON.stringify(rows));
      if (confirmDuplicates) body.append("allow_duplicates", "true");
      const { data } = await api.post(`/statements/${draft.statement_id}/save`, body);
      toast.success(`Saved ${data.saved_count} transactions`);
      onSaved?.();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 409 && detail?.code === "duplicate_statement_transactions") {
        setDuplicateWarning(detail);
      } else toast.error(formatApiError(detail) || "Could not save statement");
    }
    finally { setSaving(false); }
  };
  return <div className="space-y-4">
    <div>
      <label className="mb-1.5 block text-xs font-semibold">Import into account</label>
      <PenniSelect value={accountId} onChange={event => {setAccountId(event.target.value);setDuplicateWarning(null)}}
        className="flex h-10 w-full items-center rounded-xl border border-border bg-card px-3 text-sm" aria-label="Select bank account">
        <option value="">Select an account</option>
        {accounts.map(a => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}
      </PenniSelect>
    </div>
    {!draft && <div role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.current?.click(); } }}
      onClick={() => file.current?.click()}
      onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); upload(event.dataTransfer.files[0]); }}
      className="cursor-pointer rounded-xl border-2 border-dashed border-border bg-secondary/20 px-6 py-12 text-center hover:border-emerald/50">
      {busy ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald" /> : <Upload className="mx-auto h-6 w-6 text-emerald" />}
      <p className="mt-3 text-sm font-semibold">Choose or drop a PDF/CSV statement</p>
      <p className="mt-1 text-xs text-muted-foreground">Maximum 5 MB · You can review transactions before saving</p>
    </div>}
    <input ref={file} type="file" accept=".pdf,.csv" className="hidden" onChange={event => { upload(event.target.files[0]); event.target.value = ""; }}/>
    {draft && <>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald/10 p-3">
        <span className="flex items-center gap-2 text-xs font-semibold text-emerald"><FileText className="h-4 w-4"/> {rows.length} extracted transactions</span>
        <button type="button" onClick={() => {setDraft(null); setRows([]);}} className="text-xs font-semibold text-emerald hover:underline">Choose another file</button>
      </div>
      <div className="subtle-scroll max-h-[45vh] overflow-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="sticky top-0 bg-card"><tr className="border-b border-border"><th className="p-2">Date</th><th className="p-2">Description</th><th className="p-2">Category</th><th className="p-2">Amount</th></tr></thead>
          <tbody>{rows.map((row,i)=><tr key={i} className="border-b border-border/60 last:border-0">
            <td className="p-2"><input type="date" aria-label={`Date for row ${i+1}`} value={String(row.date||"").slice(0,10)} onChange={e=>update(i,"date",e.target.value)} className="w-28 rounded-md border border-border bg-card p-1"/></td>
            <td className="p-2"><input aria-label={`Description for row ${i+1}`} value={row.description||""} onChange={e=>update(i,"description",e.target.value)} className="w-44 rounded-md border border-border bg-card p-1"/></td>
            <td className="p-2"><input aria-label={`Category for row ${i+1}`} value={row.category||""} onChange={e=>update(i,"category",e.target.value)} className="w-32 rounded-md border border-border bg-card p-1"/></td>
            <td className="p-2"><input type="number" step="0.01" aria-label={`Amount for row ${i+1}`} value={row.amount??""} onChange={e=>update(i,"amount",Number(e.target.value))} className="w-24 rounded-md border border-border bg-card p-1"/></td>
          </tr>)}</tbody>
        </table>
      </div>
      <Button variant="primary" onClick={save} disabled={!accountId || saving || !rows.length} className="w-full">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>} Save {rows.length} transactions
      </Button>
    </>}
  </div>;
}

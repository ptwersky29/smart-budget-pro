import React, { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { MessageSquare, Sparkles, Loader2, Trash2, CheckCircle2, AlertTriangle, Phone } from "lucide-react";

const SAMPLE = "Tesco: You spent £42.50 at TESCO EXPRESS on 03/05/26. Available balance £812.40.";

export default function SMS() {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const [inbox, setInbox] = useState([]);
  const [tw, setTw] = useState(null);
  const [twForm, setTwForm] = useState({ account_sid: "", auth_token: "", phone_number: "" });

  const loadInbox = useCallback(async () => {
    const { data } = await api.get("/sms/inbox");
    setInbox(data.messages);
  }, []);
  const loadTw = useCallback(async () => {
    if (user?.role !== "admin") return;
    try {
      const { data } = await api.get("/admin/twilio-config");
      setTw(data);
      setTwForm({ account_sid: data.account_sid || "", auth_token: "", phone_number: data.phone_number || "" });
    } catch (err) { console.error("twilio config load", err); }
  }, [user?.role]);
  useEffect(() => { loadInbox(); loadTw(); }, [loadInbox, loadTw]);

  const parse = async (autoSave = false) => {
    if (!text.trim()) return;
    setBusy(true); setLast(null);
    try {
      const { data } = await api.post("/sms/parse", { text, auto_save: autoSave });
      setLast(data);
      if (autoSave && data.transaction_id) toast.success("Transaction saved");
      else if (data.parsed?.is_transaction) toast.success(`Parsed (confidence ${(data.parsed.confidence * 100).toFixed(0)}%)`);
      else toast.message("Not a transaction", { description: data.parsed?.reason_if_not_transaction });
      await loadInbox();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "AI parse failed");
    } finally { setBusy(false); }
  };

  const saveExisting = async (id) => {
    try { const { data } = await api.post(`/sms/${id}/save`); toast.success("Saved to transactions"); await loadInbox(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { await api.delete(`/sms/${id}`); await loadInbox(); };

  const saveTw = async (e) => {
    e.preventDefault();
    try {
      const p = { ...twForm }; if (!p.auth_token) delete p.auth_token;
      await api.put("/admin/twilio-config", p);
      toast.success("Twilio settings saved"); await loadTw();
    } catch { toast.error("Could not save"); }
  };

  return (
    <div className="space-y-8" data-testid="sms-root">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="label-overline text-emerald">SMS Finance</p>
          <h1 className="text-4xl tracking-tight font-medium mt-1">Paste any bank SMS. AI does the rest.</h1>
        </div>
        {user?.tier !== "premium" && user?.role !== "admin" && (
          <span className="text-xs px-3 py-1 rounded-full bg-secondary text-muted-foreground">Free tier · 3 parses/day</span>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-3"><MessageSquare className="h-4 w-4 text-emerald" /><p className="label-overline">Paste a transaction SMS</p></div>
        <textarea data-testid="sms-text" rows={4} value={text} onChange={(e)=>setText(e.target.value)} placeholder={SAMPLE} className="w-full p-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none text-sm leading-relaxed" />
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={()=>setText(SAMPLE)} data-testid="sms-sample" className="btn-pill border border-border text-sm">Try a sample</button>
          <div className="flex-1" />
          <button onClick={()=>parse(false)} disabled={busy} data-testid="sms-parse" className="btn-pill border border-border text-sm disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-2"/> Parse with AI</>}
          </button>
          <button onClick={()=>parse(true)} disabled={busy} data-testid="sms-parse-save" className="btn-pill gradient-emerald text-white text-sm disabled:opacity-50">
            Parse & save
          </button>
        </div>

        {last && (
          <div className="mt-6 p-5 rounded-xl bg-secondary/40 space-y-3">
            <div className="flex items-center gap-2">
              {last.parsed?.is_transaction
                ? <CheckCircle2 className="h-4 w-4 text-emerald" />
                : <AlertTriangle className="h-4 w-4 text-topaz" />}
              <p className="label-overline">{last.parsed?.is_transaction ? "Detected transaction" : "Not a transaction"}</p>
              <span className="ml-auto text-xs text-muted-foreground">Confidence {Math.round((last.parsed?.confidence || 0) * 100)}%</span>
            </div>
            {last.parsed?.is_transaction ? (
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                <Row label="Amount" value={`${last.parsed.is_income ? "+" : "−"}£${Math.abs(last.parsed.amount).toFixed(2)}`} accent={last.parsed.is_income ? "emerald" : ""} />
                <Row label="Merchant" value={last.parsed.merchant || "—"} />
                <Row label="Description" value={last.parsed.description} />
                <Row label="Category" value={last.parsed.category} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{last.parsed?.reason_if_not_transaction || "Could not interpret."}</p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-6 pb-3"><p className="label-overline">Recent SMS</p><p className="text-xl tracking-tight font-medium mt-1">{inbox.length} message{inbox.length !== 1 ? "s" : ""}</p></div>
        {inbox.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No SMS parsed yet.</div> :
          <ul className="divide-y divide-border">
            {inbox.map((m) => (
              <li key={m.sms_id} className="px-6 py-4 flex items-start gap-4">
                <div className={`mt-1 h-2 w-2 rounded-full ${m.parsed?.is_transaction ? "bg-emerald" : "bg-topaz"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{m.text}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>{m.created_at?.slice(0,16).replace("T"," ")}</span>
                    <span>· {m.source}</span>
                    {m.parsed?.is_transaction && <span>· {m.parsed.is_income ? "+" : "−"}£{Math.abs(m.parsed.amount).toFixed(2)} ({m.parsed.category})</span>}
                    {m.transaction_id && <span className="text-emerald">· saved</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {m.parsed?.is_transaction && !m.transaction_id && (
                    <button onClick={()=>saveExisting(m.sms_id)} data-testid={`save-${m.sms_id}`} className="text-xs px-3 py-1.5 rounded-full bg-emerald text-white">Save</button>
                  )}
                  <button onClick={()=>del(m.sms_id)} data-testid={`del-${m.sms_id}`} className="h-8 w-8 grid place-items-center rounded-full hover:bg-secondary text-muted-foreground"><Trash2 className="h-4 w-4"/></button>
                </div>
              </li>
            ))}
          </ul>
        }
      </div>

      {user?.role === "admin" && (
        <div className="rounded-2xl border border-border bg-card p-6" data-testid="twilio-admin-card">
          <div className="flex items-center gap-2 mb-1"><Phone className="h-4 w-4 text-emerald" /><p className="label-overline">Twilio (admin) — automatic SMS</p></div>
          <p className="text-xs text-muted-foreground mb-4">Wire up automatic SMS parsing. Add the webhook URL below to your Twilio number's <em>A MESSAGE COMES IN</em> setting (HTTP POST).</p>
          <form onSubmit={saveTw} className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label-overline">Account SID</label>
              <input data-testid="tw-sid" value={twForm.account_sid} onChange={(e)=>setTwForm({...twForm, account_sid:e.target.value})} placeholder="ACxxxxxxxxxxxxxxxx" className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none font-mono text-sm" />
            </div>
            <div>
              <label className="label-overline">Auth Token {tw?.has_token && <span className="ml-1 normal-case tracking-normal text-muted-foreground">(set)</span>}</label>
              <input data-testid="tw-token" type="password" value={twForm.auth_token} onChange={(e)=>setTwForm({...twForm, auth_token:e.target.value})} placeholder={tw?.has_token ? "•••••••••• (unchanged)" : "Paste token"} className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none font-mono text-sm" />
            </div>
            <div>
              <label className="label-overline">Twilio phone number</label>
              <input data-testid="tw-number" value={twForm.phone_number} onChange={(e)=>setTwForm({...twForm, phone_number:e.target.value})} placeholder="+447700900123" className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none font-mono text-sm" />
            </div>
            <div>
              <label className="label-overline">Webhook URL</label>
              <input readOnly value={tw?.webhook_url || ""} className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/30 text-xs font-mono" />
            </div>
            <button data-testid="tw-save" className="btn-pill gradient-emerald text-white text-sm">Save Twilio settings</button>
          </form>
        </div>
      )}
    </div>
  );
}

const Row = ({label, value, accent}) => (
  <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className={`font-medium ${accent === "emerald" ? "text-emerald" : ""}`}>{value}</span></div>
);

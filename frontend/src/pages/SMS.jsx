import React, { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { MessageSquare, Sparkles, Loader2, Trash2, CheckCircle2, AlertTriangle, Phone } from "lucide-react";
import { PageHeader, SectionCard } from "../components/ui/layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

const SAMPLE = "Tesco: You spent £42.50 at TESCO EXPRESS on 03/05/26. Available balance £812.40.";

export default function SMS({ embedded }) {
  useEffect(() => { if (!embedded) document.title = "SMS Transactions | Penni"; }, [embedded]);
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const [inbox, setInbox] = useState([]);
  const [tw, setTw] = useState(null);
  const [twForm, setTwForm] = useState({ account_sid: "", auth_token: "", phone_number: "" });

  // Phone registration
  const [senders, setSenders] = useState([]);
  const [phoneInput, setPhoneInput] = useState("");
  const [regBusy, setRegBusy] = useState(false);

  const loadSenders = useCallback(async () => {
    try {
      const { data } = await api.get("/sms/senders");
      setSenders(data.senders);
    } catch { /* senders not critical */ }
  }, []);

  const loadInbox = useCallback(async () => {
    try {
      const { data } = await api.get("/sms/inbox");
      setInbox(data.messages || data.inbox || []);
    } catch { toast.error("Could not load SMS inbox"); }
  }, []);
  const loadTw = useCallback(async () => {
    if (user?.role !== "admin") return;
    try {
      const { data } = await api.get("/admin/twilio-config");
      setTw(data);
      setTwForm({ account_sid: data.account_sid || "", auth_token: "", phone_number: data.phone_number || "" });
    } catch (err) { toast.error("Could not load Twilio config"); }
  }, [user?.role]);
  useEffect(() => { loadInbox(); loadTw(); loadSenders(); }, [loadInbox, loadTw, loadSenders]);

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
    try {
      const { data } = await api.post(`/sms/${id}/save`);
      toast.success("Transaction saved");
      await loadInbox();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Could not save");
    }
  };
  const del = async (id) => { try { await api.delete(`/sms/${id}`); await loadInbox(); } catch { toast.error("Could not delete"); } };

  const saveTw = async (e) => {
    e.preventDefault();
    try {
      const p = { ...twForm }; if (!p.auth_token) delete p.auth_token;
      await api.put("/admin/twilio-config", p);
      toast.success("Twilio settings saved"); await loadTw();
    } catch { toast.error("Could not save"); }
  };

  const registerPhone = async (e) => {
    e.preventDefault();
    if (!phoneInput.trim()) return;
    setRegBusy(true);
    try {
      await api.post("/sms/register-sender", { phone_number: phoneInput.trim() });
      toast.success("Phone number registered");
      setPhoneInput("");
      await loadSenders();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not register");
    } finally { setRegBusy(false); }
  };

  const deleteSender = async (id) => {
    try {
      await api.delete(`/sms/senders/${id}`);
      toast.success("Phone number removed");
      await loadSenders();
    } catch { toast.error("Could not remove"); }
  };

  return (
    <div className="space-y-6" data-testid="sms-root">
      {!embedded && (
        <PageHeader
          eyebrow="Accounts"
          title="Paste any bank SMS. AI does the rest."
          description="Drop in a bank SMS and Penni will extract the transaction, category, and useful metadata."
        />
      )}

      <SectionCard eyebrow="Your Phone" title={senders.length ? `${senders.length} phone${senders.length !== 1 ? "s" : ""} registered` : "Register your phone"} data-testid="phone-card">
        <p className="text-xs text-muted-foreground mb-4">Register your mobile number so the system recognises your SMS messages and can send automatic replies.</p>
        <form onSubmit={registerPhone} className="flex items-center gap-3 mb-4">
          <Input value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="+447700900123" className="flex-1 font-mono text-sm" />
          <Button type="submit" disabled={regBusy || !phoneInput.trim()} variant="primary" size="pill" className="shrink-0">
            {regBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register"}
          </Button>
        </form>
        {senders.length > 0 && (
          <ul className="divide-y divide-border -mx-6 -mb-4">
            {senders.map((s) => (
              <li key={s.id} className="px-6 py-3 flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald shrink-0" />
                <span className="text-sm font-mono">{s.phone_number}</span>
                <span className="text-xs text-muted-foreground">{s.verified_at ? `verified ${s.verified_at.slice(0, 10)}` : "pending"}</span>
                <button onClick={() => deleteSender(s.id)} className="ml-auto p-3 text-muted-foreground hover:text-ruby" title="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard eyebrow="Parse" title="Paste a transaction SMS" contentClassName="pt-0">
        <div className="flex items-center gap-2 mb-3"><MessageSquare className="h-4 w-4 text-emerald" /><p className="label-overline">Paste a transaction SMS</p></div>
        <textarea data-testid="sms-text" rows={4} value={text} onChange={(e)=>setText(e.target.value)} placeholder={SAMPLE} className="w-full p-4 rounded-xl bg-secondary/50 border border-transparent focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none text-sm leading-relaxed" />
        <div className="flex flex-wrap gap-2 mt-3">
          <Button onClick={()=>setText(SAMPLE)} data-testid="sms-sample" variant="outlinePill" size="pill">Try a sample</Button>
          <div className="flex-1" />
          <Button onClick={()=>parse(false)} disabled={busy} data-testid="sms-parse" variant="outlinePill" size="pill">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-2"/> Parse with AI</>}
          </Button>
          <Button onClick={()=>parse(true)} disabled={busy} data-testid="sms-parse-save" variant="primary" size="pill">
            Parse & save
          </Button>
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
      </SectionCard>

      <SectionCard eyebrow="Inbox" title={`${inbox.length} message${inbox.length !== 1 ? "s" : ""}`} contentClassName="p-0">
        {inbox.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No SMS parsed yet.</div> :
          <ul className="divide-y divide-border">
            {inbox.map((m) => (
              <li key={m.sms_id} className="px-6 py-4 flex items-start gap-4">
                <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${m.direction === "inbound" ? "bg-emerald" : "bg-muted"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{m.text}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>{m.created_at?.slice(0,16).replace("T"," ")}</span>
                    <span>· {m.source || m.direction}</span>
                    {m.sender_phone && <span>· {m.sender_phone}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => saveExisting(m.sms_id)} data-testid={`save-${m.sms_id}`} className="text-xs px-4 py-2.5 rounded-full bg-emerald text-white">Save</button>
                  <button onClick={() => del(m.sms_id)} data-testid={`del-${m.sms_id}`} className="p-3 text-muted-foreground hover:text-ruby" title="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        }
      </SectionCard>

      {user?.role === "admin" && (
        <SectionCard eyebrow="Admin" title="Twilio — automatic SMS" data-testid="twilio-admin-card">
          <div className="flex items-center gap-2 mb-1"><Phone className="h-4 w-4 text-emerald" /><p className="label-overline">Twilio (admin) — automatic SMS</p></div>
          <p className="text-xs text-muted-foreground mb-4">Wire up automatic SMS parsing. Add the webhook URL below to your Twilio number's <em>A MESSAGE COMES IN</em> setting (HTTP POST).</p>
          <form onSubmit={saveTw} className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label-overline">Account SID</label>
              <Input data-testid="tw-sid" value={twForm.account_sid} onChange={(e)=>setTwForm({...twForm, account_sid:e.target.value})} placeholder="ACxxxxxxxxxxxxxxxx" className="mt-1 w-full font-mono text-sm" />
            </div>
            <div>
              <label className="label-overline">Auth Token {tw?.has_token && <span className="ml-1 normal-case tracking-normal text-muted-foreground">(set)</span>}</label>
              <Input data-testid="tw-token" type="password" value={twForm.auth_token} onChange={(e)=>setTwForm({...twForm, auth_token:e.target.value})} placeholder={tw?.has_token ? "•••••••••• (unchanged)" : "Paste token"} className="mt-1 w-full font-mono text-sm" />
            </div>
            <div>
              <label className="label-overline">Twilio phone number</label>
              <Input data-testid="tw-number" value={twForm.phone_number} onChange={(e)=>setTwForm({...twForm, phone_number:e.target.value})} placeholder="+447700900123" className="mt-1 w-full font-mono text-sm" />
            </div>
            <div>
              <label className="label-overline">Webhook URL</label>
              <input readOnly value={tw?.webhook_url || ""} className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/30 text-xs font-mono cursor-not-allowed" />
            </div>
            <Button data-testid="tw-save" variant="primary" size="pill">Save Twilio settings</Button>
          </form>
        </SectionCard>
      )}
    </div>
  );
}

const Row = ({label, value, accent}) => (
  <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className={`font-medium ${accent === "emerald" ? "text-emerald" : ""}`}>{value}</span></div>
);

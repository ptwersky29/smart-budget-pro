import React, { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import {
  Building2, Phone, ShieldCheck, ExternalLink, Loader2, CheckCircle2, AlertCircle, Copy, Sparkles, Trash2,
  CreditCard, Calendar, MessageSquare, TrendingUp, ArrowRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic Claude", models: ["claude-sonnet-4-5-20250929", "claude-opus-4-1-20250805", "claude-3-7-sonnet-20250219"], url: "https://console.anthropic.com/settings/keys" },
  { value: "openai",    label: "OpenAI",          models: ["gpt-5", "gpt-5-mini", "gpt-4o", "gpt-4o-mini"],                           url: "https://platform.openai.com/api-keys" },
  { value: "gemini",    label: "Google Gemini",   models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro"],                   url: "https://aistudio.google.com/apikey" },
];

export default function Integrations() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // TrueLayer (admin only)
  const [tl, setTl] = useState(null);
  const [tlForm, setTlForm] = useState({ client_id: "", client_secret: "", redirect_uri: "", environment: "sandbox" });
  const [tlBusy, setTlBusy] = useState(false);
  const [tlTest, setTlTest] = useState(null);

  // Twilio (per-user)
  const [tw, setTw] = useState(null);
  const [twForm, setTwForm] = useState({ account_sid: "", auth_token: "", phone_number: "" });
  const [twBusy, setTwBusy] = useState(false);
  const [twTest, setTwTest] = useState(null);

  // AI Provider (per-user bring-your-own-key)
  const [aiProviders, setAiProviders] = useState([]);
  const [aiForm, setAiForm] = useState({ name: "", provider: "anthropic", model: "claude-sonnet-4-5-20250929", api_key: "", is_default: true });
  const [aiBusy, setAiBusy] = useState(false);

  // Tyl billing
  const [tylConfig, setTylConfig] = useState(null);

  // Hebrew calendar
  const [hebcalStatus, setHebcalStatus] = useState(null);

  const loadAi = useCallback(async () => {
    try { const { data } = await api.get("/ai/providers"); setAiProviders(data.providers || []); }
    catch (err) { console.error(err); }
  }, []);

  const loadTl = useCallback(async () => {
    try {
      const { data } = await api.get("/integrations/truelayer");
      setTl(data);
      setTlForm({
        client_id: data.client_id || "",
        client_secret: "",
        redirect_uri: data.redirect_uri || "",
        environment: data.environment || "sandbox",
      });
    } catch (err) { console.error(err); }
  }, []);

  const loadTw = useCallback(async () => {
    try {
      const { data } = await api.get("/integrations/twilio");
      setTw(data);
      setTwForm({ account_sid: data.account_sid || "", auth_token: "", phone_number: data.phone_number || "" });
    } catch (err) { console.error(err); }
  }, []);

  const loadTyl = useCallback(async () => {
    try { const { data } = await api.get("/billing/tyl/config"); setTylConfig(data); }
    catch { setTylConfig({ configured: false }); }
  }, []);

  const loadHebcal = useCallback(async () => {
    try {
      const { data } = await api.get("/jewish/holiday-budget");
      setHebcalStatus(data.holidays ? { ok: true, count: data.holidays.length } : { ok: true, count: 0 });
    } catch { setHebcalStatus({ ok: false }); }
  }, []);

  useEffect(() => { loadTl(); loadTw(); loadAi(); loadTyl(); loadHebcal(); }, [loadTl, loadTw, loadAi, loadTyl, loadHebcal]);

  const saveTl = async (e) => {
    e.preventDefault(); setTlBusy(true); setTlTest(null);
    try {
      const p = { ...tlForm }; if (!p.client_secret) delete p.client_secret;
      await api.put("/integrations/truelayer", p);
      toast.success("TrueLayer saved");
      await loadTl();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Save failed"); }
    finally { setTlBusy(false); }
  };

  const testTl = async () => {
    setTlBusy(true); setTlTest(null);
    try {
      const { data } = await api.post("/integrations/truelayer/test");
      setTlTest(data);
      toast.success(data.ok ? `TrueLayer reachable (${data.source})` : "Auth host unreachable");
    } catch (err) {
      const msg = formatApiError(err.response?.data?.detail);
      setTlTest({ ok: false, error: msg });
      toast.error(msg || "Test failed");
    } finally { setTlBusy(false); }
  };

  const saveTw = async (e) => {
    e.preventDefault(); setTwBusy(true); setTwTest(null);
    try {
      const p = { ...twForm }; if (!p.auth_token) delete p.auth_token;
      await api.put("/integrations/twilio", p);
      toast.success("Twilio saved");
      await loadTw();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Save failed"); }
    finally { setTwBusy(false); }
  };

  const testTw = async () => {
    setTwBusy(true); setTwTest(null);
    try {
      const { data } = await api.post("/integrations/twilio/test");
      setTwTest(data);
      toast.success(`Connected to ${data.friendly_name || "Twilio"}`);
      await loadTw();
    } catch (err) {
      const msg = formatApiError(err.response?.data?.detail);
      setTwTest({ ok: false, error: msg });
      toast.error(msg || "Test failed");
    } finally { setTwBusy(false); }
  };

  const copy = (val) => {
    navigator.clipboard?.writeText(val);
    toast.success("Copied to clipboard");
  };

  const saveAi = async (e) => {
    e.preventDefault(); setAiBusy(true);
    try {
      if (!aiForm.api_key) { toast.error("Paste your API key"); setAiBusy(false); return; }
      await api.post("/ai/providers", aiForm);
      toast.success(`${aiForm.provider} provider added`);
      setAiForm({ name: "", provider: "anthropic", model: "claude-sonnet-4-5-20250929", api_key: "", is_default: true });
      await loadAi();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Save failed"); }
    finally { setAiBusy(false); }
  };

  const removeAi = async (id) => {
    if (!window.confirm("Remove this AI provider?")) return;
    try { await api.delete(`/ai/providers/${id}`); toast.success("Removed"); await loadAi(); }
    catch { toast.error("Could not remove"); }
  };

  const activeAi = aiProviders.find(p => p.is_default);
  const providerMeta = PROVIDERS.find(p => p.value === aiForm.provider) || PROVIDERS[0];

  return (
    <div className="space-y-8" data-testid="integrations-root">
      <div>
        <p className="label-overline text-emerald">Integrations</p>
        <h1 className="text-4xl tracking-tight font-medium mt-1">Connect everything in one place.</h1>
        <p className="text-sm text-muted-foreground mt-2">Wire up TrueLayer and Twilio in 30 seconds. Test connections before going live.</p>
      </div>

      {/* AI Provider — bring your own key (works for free tier too) */}
      <Card icon={Sparkles} title="AI Provider"
            subtitle={activeAi
              ? `Active: ${activeAi.provider} · ${activeAi.model} (your key)`
              : "Use your own OpenAI / Anthropic / Gemini key for unlimited insights — free tier supported"}
            status={activeAi ? "verified" : "info"} testid="card-ai">
        {aiProviders.length > 0 && (
          <div className="mb-4 space-y-2">
            {aiProviders.map((p) => (
              <div key={p.provider_id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border">
                <div className="w-8 h-8 rounded-lg gradient-emerald grid place-items-center"><Sparkles className="h-4 w-4 text-white"/></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name || p.provider}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.provider} · {p.model}</p>
                </div>
                {p.is_default && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald/10 text-emerald">Default</span>}
                <button onClick={()=>removeAi(p.provider_id)} data-testid={`ai-remove-${p.provider_id}`} className="text-muted-foreground hover:text-ruby"><Trash2 className="h-4 w-4"/></button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={saveAi} className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label-overline">Provider</label>
            <select data-testid="ai-provider" value={aiForm.provider}
                    onChange={(e)=>{ const p = PROVIDERS.find(x=>x.value===e.target.value); setAiForm({...aiForm, provider:e.target.value, model: p?.models[0] || ""}); }}
                    className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none">
              {PROVIDERS.map((p)=><option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label-overline">Model</label>
            <select data-testid="ai-model" value={aiForm.model} onChange={(e)=>setAiForm({...aiForm, model:e.target.value})}
                    className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none">
              {providerMeta.models.map((m)=><option key={m}>{m}</option>)}
            </select>
          </div>
          <Field testid="ai-name" label="Nickname (optional)" placeholder="My Claude key"
                 value={aiForm.name} onChange={(v)=>setAiForm({...aiForm, name:v})} />
          <Field testid="ai-key" type="password" label="API key" placeholder={providerMeta.value === "anthropic" ? "sk-ant-..." : providerMeta.value === "openai" ? "sk-..." : "AIza..."}
                 value={aiForm.api_key} onChange={(v)=>setAiForm({...aiForm, api_key:v})} mono required />
          <div className="sm:col-span-2 flex flex-wrap gap-2 items-center">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={aiForm.is_default} onChange={(e)=>setAiForm({...aiForm, is_default:e.target.checked})}/>
              Set as default for all AI insights
            </label>
            <button data-testid="ai-save" disabled={aiBusy} className="btn-pill gradient-emerald text-white text-sm disabled:opacity-50 ml-auto">
              {aiBusy ? <Loader2 className="h-4 w-4 animate-spin"/> : "Save provider"}
            </button>
            <a href={providerMeta.url} target="_blank" rel="noreferrer" className="text-sm text-emerald hover:underline inline-flex items-center gap-1">
              Get a key <ExternalLink className="h-3 w-3"/>
            </a>
          </div>
        </form>
        <div className="mt-4 p-3 rounded-xl bg-emerald/5 border border-emerald/30 text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">How it works:</span> When you add a key here, FinanceAI will use <span className="font-medium text-foreground">your provider</span> for AI insights — unlimited calls, billed directly to your provider account. Without a key, free users get 5 insights/day on the shared service; Premium users get unlimited.
        </div>
      </Card>

      {/* TrueLayer — available for every user (per-user override, with admin fallback) */}
      <Card icon={Building2} title="TrueLayer"
            subtitle={tl?.source === "admin" ? "UK Open Banking · using admin defaults · override with your own below" : "UK Open Banking · your personal credentials"}
            status={tl?.has_secret ? "configured" : "missing"} testid="card-truelayer">
        <form onSubmit={saveTl} className="grid sm:grid-cols-2 gap-3">
          <Field testid="tl-client-id" label="Client ID" placeholder="sandbox-yourapp-12ab34"
                 value={tlForm.client_id} onChange={(v)=>setTlForm({...tlForm, client_id:v})} mono />
          <Field testid="tl-client-secret" type="password" label={`Client Secret ${tl?.has_secret ? "(set)" : ""}`}
                 placeholder={tl?.has_secret ? "•••••••••• (leave blank to keep)" : "Paste secret"}
                 value={tlForm.client_secret} onChange={(v)=>setTlForm({...tlForm, client_secret:v})} mono />
          <div className="sm:col-span-2 space-y-1">
            <label className="label-overline">Redirect URI</label>
            <div className="flex gap-2">
              <input data-testid="tl-redirect" value={tlForm.redirect_uri} onChange={(e)=>setTlForm({...tlForm, redirect_uri:e.target.value})} className="flex-1 h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none font-mono text-xs" />
              <button type="button" onClick={()=>copy(tlForm.redirect_uri)} data-testid="tl-copy-redirect" className="h-11 w-11 rounded-xl border border-border hover:bg-secondary grid place-items-center"><Copy className="h-4 w-4"/></button>
            </div>
            <p className="text-xs text-muted-foreground">Paste this in TrueLayer Console → App → Redirect URIs.</p>
          </div>
          <div>
            <label className="label-overline">Environment</label>
            <select data-testid="tl-env" value={tlForm.environment} onChange={(e)=>setTlForm({...tlForm, environment:e.target.value})} className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none">
              <option value="sandbox">Sandbox</option>
              <option value="live">Live</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2 items-center">
            <button data-testid="tl-save" disabled={tlBusy} className="btn-pill gradient-emerald text-white text-sm disabled:opacity-50">{tlBusy ? <Loader2 className="h-4 w-4 animate-spin"/> : "Save"}</button>
            <button type="button" onClick={testTl} disabled={tlBusy} data-testid="tl-test" className="btn-pill border border-border text-sm disabled:opacity-50">Test connection</button>
            <a href="https://console.truelayer.com" target="_blank" rel="noreferrer" className="text-sm text-emerald hover:underline inline-flex items-center gap-1">Open TrueLayer Console <ExternalLink className="h-3 w-3"/></a>
            {tl?.source === "user" && <span className="text-xs text-emerald ml-auto">Using your credentials</span>}
            {tl?.source === "admin" && <span className="text-xs text-muted-foreground ml-auto">Using admin defaults</span>}
          </div>
        </form>
        {tlTest && <TestResult ok={tlTest.ok} text={tlTest.ok ? `Auth host reachable · env=${tlTest.environment} · source=${tlTest.source}` : (tlTest.error || "Test failed")} />}
      </Card>

      {/* Twilio (per user) */}
      <Card icon={Phone} title="Twilio (SMS)" subtitle="Your own SMS pipeline · per-user"
            status={tw?.verified ? "verified" : tw?.has_token ? "configured" : "missing"} testid="card-twilio">
        <form onSubmit={saveTw} className="grid sm:grid-cols-2 gap-3">
          <Field testid="tw-sid" label="Account SID" placeholder="ACxxxxxxxxxxxxxxxx"
                 value={twForm.account_sid} onChange={(v)=>setTwForm({...twForm, account_sid:v})} mono />
          <Field testid="tw-token" type="password" label={`Auth Token ${tw?.has_token ? "(set)" : ""}`}
                 placeholder={tw?.has_token ? "•••••••••• (leave blank to keep)" : "Paste auth token"}
                 value={twForm.auth_token} onChange={(v)=>setTwForm({...twForm, auth_token:v})} mono />
          <Field testid="tw-number" label="Twilio phone number" placeholder="+447700900123"
                 value={twForm.phone_number} onChange={(v)=>setTwForm({...twForm, phone_number:v})} mono />
          <div className="space-y-1">
            <label className="label-overline">Webhook URL</label>
            <div className="flex gap-2">
              <input readOnly value={tw?.webhook_url || ""} className="flex-1 h-11 px-4 rounded-xl bg-secondary/30 text-xs font-mono" />
              <button type="button" onClick={()=>copy(tw?.webhook_url)} data-testid="tw-copy-webhook" className="h-11 w-11 rounded-xl border border-border hover:bg-secondary grid place-items-center"><Copy className="h-4 w-4"/></button>
            </div>
            <p className="text-xs text-muted-foreground">Twilio Console → your number → A MESSAGE COMES IN → HTTP POST.</p>
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2 items-center">
            <button data-testid="tw-save" disabled={twBusy} className="btn-pill gradient-emerald text-white text-sm disabled:opacity-50">{twBusy ? <Loader2 className="h-4 w-4 animate-spin"/> : "Save"}</button>
            <button type="button" onClick={testTw} disabled={twBusy} data-testid="tw-test" className="btn-pill border border-border text-sm disabled:opacity-50">Test connection</button>
            <a href="https://www.twilio.com/console" target="_blank" rel="noreferrer" className="text-sm text-emerald hover:underline inline-flex items-center gap-1">Open Twilio Console <ExternalLink className="h-3 w-3"/></a>
          </div>
        </form>
        {twTest && <TestResult ok={twTest.ok} text={twTest.ok ? `Connected · ${twTest.friendly_name || "Twilio account"} · ${twTest.status || ""}` : (twTest.error || "Test failed")} />}
      </Card>

      {/* Tyl by NatWest */}
      <LinkCard icon={CreditCard} title="Tyl by NatWest"
                subtitle="Hosted payment page for Premium subscriptions"
                status={tylConfig?.configured ? "configured" : "not_configured"}
                statusLabel={tylConfig?.configured ? "Live" : "Demo mode"}
                href="/pricing"
                navigate={navigate}>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Store ID: </span><span className="font-mono text-xs">{tylConfig?.store_id || "—"}</span></div>
          <div><span className="text-muted-foreground">Gateway: </span><span className="font-mono text-xs">{tylConfig?.gateway_url ? new URL(tylConfig.gateway_url).hostname : "—"}</span></div>
        </div>
      </LinkCard>

      {/* Hebrew Calendar */}
      <LinkCard icon={Calendar} title="Hebrew Calendar"
                subtitle="Yom Tov budgeting, Zmanim, Maaser calculator"
                status={hebcalStatus?.ok ? "configured" : hebcalStatus === null ? "info" : "missing"}
                statusLabel={hebcalStatus?.ok ? `${hebcalStatus.count} holidays` : hebcalStatus === null ? "Loading…" : "Unavailable"}
                href="/jewish"
                navigate={navigate}>
        <p className="text-sm text-muted-foreground">Automatic holiday budget uplifts, Shabbat/Zmanim lookup, and Maaser (tithe) tracking for Jewish financial planning.</p>
      </LinkCard>

      {/* SMS Finance */}
      <LinkCard icon={MessageSquare} title="SMS Finance"
                subtitle="AI-powered bank SMS parsing"
                status="configured"
                statusLabel="Active"
                href="/sms"
                navigate={navigate}>
        <p className="text-sm text-muted-foreground">Paste bank SMS texts to auto-parse transactions. Configure Twilio webhook for automatic SMS-to-transaction pipeline.</p>
      </LinkCard>

      {/* Stock & Crypto Prices */}
      <LinkCard icon={TrendingUp} title="Market Data"
                subtitle="Live stock & crypto price feeds"
                status="configured"
                statusLabel="Live"
                href="/investments"
                navigate={navigate}>
        <p className="text-sm text-muted-foreground">Real-time prices for 9 stock symbols (VUSA, VWRL, FTSE, S&P 500, NASDAQ) plus crypto via CoinGecko.</p>
      </LinkCard>
    </div>
  );
}

const Card = ({ icon: Icon, title, subtitle, status, testid, children }) => {
  const badge = {
    verified: { label: "Verified", color: "bg-emerald/10 text-emerald", Icon: CheckCircle2 },
    configured: { label: "Configured", color: "bg-topaz/10 text-topaz", Icon: ShieldCheck },
    missing: { label: "Not set up", color: "bg-secondary text-muted-foreground", Icon: AlertCircle },
    info: { label: "Managed", color: "bg-secondary text-muted-foreground", Icon: ShieldCheck },
  }[status] || { label: status, color: "bg-secondary text-muted-foreground", Icon: AlertCircle };
  return (
    <div className="rounded-2xl border border-border bg-card p-6" data-testid={testid}>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-secondary grid place-items-center"><Icon className="h-5 w-5 text-emerald" /></div>
        <div className="flex-1">
          <p className="text-lg tracking-tight font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${badge.color}`}><badge.Icon className="h-3 w-3" /> {badge.label}</span>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
};

const Field = ({ testid, label, value, onChange, type = "text", placeholder, mono, required }) => (
  <div>
    <label className="label-overline">{label}</label>
    <input data-testid={testid} type={type} required={required} value={value} onChange={(e)=>onChange(e.target.value)}
           placeholder={placeholder}
           className={`mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none ${mono ? "font-mono text-sm" : ""}`} />
  </div>
);

const TestResult = ({ ok, text }) => (
  <div className={`mt-4 p-3 rounded-xl text-sm flex items-center gap-2 ${ok ? "bg-emerald/10 text-emerald" : "bg-ruby/10 text-ruby"}`}>
    {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />} {text}
  </div>
);

const LinkCard = ({ icon: Icon, title, subtitle, status, statusLabel, href, navigate, children }) => {
  const badge = {
    configured: { label: statusLabel || "Configured", color: "bg-emerald/10 text-emerald", Icon: CheckCircle2 },
    not_configured: { label: statusLabel || "Not configured", color: "bg-topaz/10 text-topaz", Icon: ShieldCheck },
    missing: { label: statusLabel || "Unavailable", color: "bg-secondary text-muted-foreground", Icon: AlertCircle },
    info: { label: statusLabel || "Loading…", color: "bg-secondary text-muted-foreground", Icon: ShieldCheck },
  }[status] || { label: statusLabel || status, color: "bg-secondary text-muted-foreground", Icon: AlertCircle };
  return (
    <div className="rounded-2xl border border-border bg-card p-6 cursor-pointer hover:border-emerald/50 transition-colors" onClick={() => navigate(href)}>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-secondary grid place-items-center"><Icon className="h-5 w-5 text-emerald" /></div>
        <div className="flex-1">
          <p className="text-lg tracking-tight font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${badge.color}`}><badge.Icon className="h-3 w-3" /> {badge.label}</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
};

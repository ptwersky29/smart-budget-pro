import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Trash2, Plus, Sparkles, Building2, ShieldCheck, Crown, CreditCard, ExternalLink, XCircle } from "lucide-react";

const PROVIDERS = ["openai","anthropic","gemini","custom"];

export default function Settings() {
  const { user, refresh } = useAuth();
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState({ name: "", provider: "openai", model: "gpt-5.1", api_key: "", endpoint: "", is_default: false });
  const [usage, setUsage] = useState({ approx_total_tokens: 0, approx_cost_usd: 0 });
  const [tl, setTl] = useState(null);
  const [tlForm, setTlForm] = useState({ client_id: "", client_secret: "", redirect_uri: "", environment: "sandbox" });
  const [tlBusy, setTlBusy] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  const loadTl = useCallback(async () => {
    if (user?.role !== "admin") return;
    try {
      const { data } = await api.get("/admin/truelayer-config");
      setTl(data);
      setTlForm({
        client_id: data.client_id || "",
        client_secret: "",
        redirect_uri: data.redirect_uri || "",
        environment: data.environment || "sandbox",
      });
    } catch (err) { console.error("tl-config load", err); }
  }, [user?.role]);

  const loadSubscription = useCallback(async () => {
    try {
      const { data } = await api.get("/billing/subscription");
      setSubscription(data);
    } catch { /* not subscribed yet */ }
  }, []);

  const saveTl = async (e) => {
    e.preventDefault();
    setTlBusy(true);
    try {
      const payload = { ...tlForm };
      if (!payload.client_secret) delete payload.client_secret;
      await api.put("/admin/truelayer-config", payload);
      toast.success("TrueLayer credentials saved");
      await loadTl();
    } catch { toast.error("Could not save"); }
    finally { setTlBusy(false); }
  };

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      const { data } = await api.post("/billing/portal");
      window.location.href = data.url;
    } catch (e) {
      toast.error("Could not open billing portal");
    } finally { setPortalBusy(false); }
  };

  const cancelSub = async () => {
    if (!window.confirm("Cancel your subscription? You'll retain Premium access until the end of the billing period.")) return;
    setCancelBusy(true);
    try {
      await api.post("/billing/cancel");
      toast.success("Subscription will cancel at period end");
      await loadSubscription();
    } catch { toast.error("Could not cancel"); }
    finally { setCancelBusy(false); }
  };

  const load = useCallback(async () => {
    try {
      const [p, u] = await Promise.all([api.get("/ai/providers"), api.get("/ai/usage")]);
      setProviders(p.data.providers || []);
      setUsage({ approx_total_tokens: u.data.approx_total_tokens || 0, approx_cost_usd: u.data.approx_cost_usd || 0 });
    } catch { /* not configured yet */ }
  }, []);
  useEffect(() => { load(); refresh(); loadTl(); loadSubscription(); }, [load, refresh, loadTl, loadSubscription]);

  const add = async (e) => {
    e.preventDefault();
    try { await api.post("/ai/providers", form); toast.success("Provider added"); setForm({...form, name:"", api_key:""}); await load(); }
    catch { toast.error("Could not save"); }
  };
  const del = async (id) => { await api.delete(`/ai/providers/${id}`); toast.success("Removed"); await load(); };

  return (
    <div className="space-y-8" data-testid="settings-root">
      <div>
        <p className="label-overline text-emerald">Settings</p>
        <h1 className="text-4xl tracking-tight font-medium mt-1">Account & AI.</h1>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="label-overline">Profile</p>
        <div className="grid sm:grid-cols-3 gap-3 mt-3">
          <Info label="Name" value={user?.name || "\u2014"} />
          <Info label="Email" value={user?.email} />
          <Info label="Tier" value={user?.tier} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="label-overline">Subscription</p>
        {subscription ? (
          <div className="mt-3 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Info label="Plan" value={subscription.is_premium ? "Premium" : "Free"} />
              <Info label="Status" value={subscription.subscription_status || (subscription.on_trial ? "trialing" : "active")} />
            </div>
            {subscription.free_trial_end && !subscription.is_premium && (
              <p className="text-xs text-muted-foreground">Free trial ends: {new Date(subscription.free_trial_end).toLocaleDateString()}</p>
            )}
            {subscription.current_period_end && (
              <p className="text-xs text-muted-foreground">
                Current period ends: {new Date(subscription.current_period_end).toLocaleDateString()}
                {subscription.cancel_at_period_end && " (cancel scheduled)"}
              </p>
            )}
            {subscription.is_premium && !subscription.is_admin && (
              <div className="flex flex-wrap gap-2">
                <button onClick={openPortal} disabled={portalBusy}
                        className="btn-pill border border-emerald text-emerald text-sm disabled:opacity-50 inline-flex items-center gap-1">
                  <CreditCard className="h-4 w-4" /> {portalBusy ? "Loading…" : "Manage billing"}
                  <ExternalLink className="h-3 w-3" />
                </button>
                {!subscription.cancel_at_period_end && (
                  <button onClick={cancelSub} disabled={cancelBusy}
                          className="btn-pill border border-ruby text-ruby text-sm disabled:opacity-50 inline-flex items-center gap-1">
                    <XCircle className="h-4 w-4" /> {cancelBusy ? "…" : "Cancel"}
                  </button>
                )}
              </div>
            )}
            {!subscription.is_premium && !subscription.on_trial && (
              <a href="/pricing" className="btn-pill gradient-emerald text-white text-sm inline-flex items-center gap-1">
                <Crown className="h-4 w-4" /> Upgrade to Premium
              </a>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">Loading subscription info…</p>
          </div>
        )}
      </div>

      {user?.role === "admin" && (
        <div className="rounded-2xl border border-border bg-card p-6" data-testid="truelayer-admin-card">
          <div className="flex items-center gap-2 mb-1"><Building2 className="h-4 w-4 text-emerald" /><p className="label-overline">TrueLayer credentials (admin)</p></div>
          <p className="text-xs text-muted-foreground mb-4">
            Configure your TrueLayer sandbox or live app.
            {tl?.has_secret && <span className="ml-1 text-emerald inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3"/> secret on file</span>}
          </p>
          <form onSubmit={saveTl} className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label-overline">Client ID</label>
              <input data-testid="tl-client-id" required value={tlForm.client_id} onChange={(e)=>setTlForm({...tlForm, client_id:e.target.value})} placeholder="sandbox-yourapp-12ab34" className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none font-mono text-sm" />
            </div>
            <div>
              <label className="label-overline">Client Secret {tl?.has_secret && <span className="ml-1 normal-case tracking-normal text-muted-foreground">(leave blank to keep current)</span>}</label>
              <input data-testid="tl-client-secret" type="password" value={tlForm.client_secret} onChange={(e)=>setTlForm({...tlForm, client_secret:e.target.value})} placeholder={tl?.has_secret ? "•••••••• (unchanged)" : "Paste secret"} className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none font-mono text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="label-overline">Redirect URI</label>
              <input data-testid="tl-redirect" value={tlForm.redirect_uri} onChange={(e)=>setTlForm({...tlForm, redirect_uri:e.target.value})} className="mt-1 w-full h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none font-mono text-xs" />
              <p className="text-xs text-muted-foreground mt-1">Add this exact URL in TrueLayer Console.</p>
            </div>
            <div>
              <label className="label-overline">Environment</label>
              <select data-testid="tl-env" value={tlForm.environment} onChange={(e)=>setTlForm({...tlForm, environment:e.target.value})} className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none">
                <option value="sandbox">Sandbox</option>
                <option value="live">Live</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <button data-testid="tl-save" disabled={tlBusy} className="btn-pill gradient-emerald text-white text-sm disabled:opacity-50">
                {tlBusy ? "Saving\u2026" : "Save credentials"}
              </button>
              <a href="https://console.truelayer.com" target="_blank" rel="noreferrer" className="ml-3 text-sm text-emerald hover:underline">Open TrueLayer Console &nearr;</a>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="label-overline">AI usage</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Info label="Approx tokens used" value={usage.approx_total_tokens.toLocaleString()} />
          <Info label="Approx cost (USD)" value={`$${usage.approx_cost_usd}`} />
        </div>
        <p className="text-xs text-muted-foreground mt-4">Default: Claude Sonnet 4.5 via internal key. Premium gets unlimited AI.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="label-overline">Bring your own AI provider</p>
        <form onSubmit={add} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4 items-end">
          <input data-testid="ai-prov-name" required placeholder="Nickname" value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} className="h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
          <select data-testid="ai-prov-provider" value={form.provider} onChange={(e)=>setForm({...form, provider:e.target.value})} className="h-11 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none">
            {PROVIDERS.map(p=><option key={p}>{p}</option>)}
          </select>
          <input data-testid="ai-prov-model" required placeholder="Model" value={form.model} onChange={(e)=>setForm({...form, model:e.target.value})} className="h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
          <input data-testid="ai-prov-key" placeholder="API key" type="password" value={form.api_key} onChange={(e)=>setForm({...form, api_key:e.target.value})} className="h-11 px-4 rounded-xl bg-secondary/50 border border-transparent focus:border-emerald focus:outline-none" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_default} onChange={(e)=>setForm({...form, is_default:e.target.checked})} /> Default</label>
          <button data-testid="ai-prov-add" className="btn-pill gradient-emerald text-white text-sm h-11 col-span-1"><Plus className="h-4 w-4 mr-1" /> Save</button>
        </form>
        <div className="mt-4 space-y-2">
          {providers.length === 0 ? <p className="text-xs text-muted-foreground">Using internal Claude Sonnet 4.5.</p> :
            providers.map(p => (
              <div key={p.provider_id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/40">
                <div className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-emerald" />
                  <div><p className="text-sm font-medium">{p.name} {p.is_default && <span className="text-xs text-emerald"> &middot; default</span>}</p>
                  <p className="text-xs text-muted-foreground">{p.provider} &middot; {p.model}</p></div>
                </div>
                <button onClick={()=>del(p.provider_id)} data-testid={`del-prov-${p.provider_id}`} className="text-muted-foreground hover:text-ruby"><Trash2 className="h-4 w-4"/></button>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

const Info = ({label, value}) => (<div><p className="label-overline">{label}</p><p className="text-sm font-medium mt-1 capitalize">{value}</p></div>);

import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import {
  Trash2, Plus, Sparkles, Building2, ShieldCheck, Crown, CreditCard,
  ExternalLink, XCircle, User, Receipt, Bot, Lock, Plug, MessageSquare,
} from "lucide-react";
import { PageHeader, SectionCard } from "../components/ui/layout";
import ConfirmModal from "../components/ui/ConfirmModal";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import IntegrationsPage from "./Integrations";
import SMSPage from "./SMS";

const PROVIDERS = ["openai", "anthropic", "gemini", "custom"];

const TABS = [
  { key: "account",      label: "Account",         icon: User },
  { key: "subscription", label: "Subscription",    icon: Receipt },
  { key: "integrations", label: "Integrations",    icon: Plug },
  { key: "sms",          label: "SMS Finance",     icon: MessageSquare },
  { key: "ai",           label: "AI Providers",    icon: Bot },
  { key: "admin",        label: "Admin",            icon: Lock, adminOnly: true },
];

export default function Settings() {
  useEffect(() => { document.title = "Settings | FinanceAI"; }, []);
  const { user, refresh } = useAuth();
  const [activeTab, setActiveTab] = useState("account");

  // ── AI ──
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState({ name: "", provider: "openai", model: "gpt-4o", api_key: "", endpoint: "", is_default: false });
  const [usage, setUsage] = useState({ approx_total_tokens: 0, approx_cost_usd: 0 });

  // ── Admin / TrueLayer ──
  const [tl, setTl] = useState(null);
  const [tlForm, setTlForm] = useState({ client_id: "", client_secret: "", redirect_uri: "", environment: "sandbox" });
  const [tlBusy, setTlBusy] = useState(false);

  // ── Subscription ──
  const [subscription, setSubscription] = useState(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
    } catch { toast.error("Could not load TrueLayer config"); }
  }, [user?.role]);

  const loadSubscription = useCallback(async () => {
    try {
      const { data } = await api.get("/billing/subscription");
      setSubscription(data);
    } catch { setSubscription(null); }
  }, []);

  const loadAI = useCallback(async () => {
    try {
      const [p, u] = await Promise.all([api.get("/ai/providers"), api.get("/ai/usage")]);
      setProviders(p.data.providers || []);
      setUsage({ approx_total_tokens: u.data.approx_total_tokens || 0, approx_cost_usd: u.data.approx_cost_usd || 0 });
    } catch { /* not configured */ }
  }, []);

  useEffect(() => {
    refresh();
    loadAI();
    loadSubscription();
    loadTl();
  }, [loadAI, refresh, loadTl, loadSubscription]);

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
    } catch { toast.error("Could not open billing portal"); }
    finally { setPortalBusy(false); }
  };

  const doCancelSub = async () => {
    setConfirmOpen(false);
    setCancelBusy(true);
    try {
      await api.post("/billing/cancel");
      toast.success("Subscription will cancel at period end");
      await loadSubscription();
    } catch { toast.error("Could not cancel"); }
    finally { setCancelBusy(false); }
  };

  const addProvider = async (e) => {
    e.preventDefault();
    try {
      await api.post("/ai/providers", form);
      toast.success("Provider added");
      setForm({ ...form, name: "", api_key: "" });
      await loadAI();
    } catch { toast.error("Could not save"); }
  };

  const delProvider = async (id) => {
    await api.delete(`/ai/providers/${id}`);
    toast.success("Removed");
    await loadAI();
  };

  const visibleTabs = TABS.filter(t => !t.adminOnly || user?.role === "admin");

  return (
    <div className="space-y-6" data-testid="settings-root">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Manage your account, subscription, AI providers, integrations, SMS settings, and admin config."
      />

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap border-b border-border pb-0">
        {visibleTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`inline-flex items-center gap-2 text-sm px-4 py-3 border-b-2 transition-colors font-medium ${
              activeTab === key
                ? "border-emerald text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── ACCOUNT TAB ── */}
      {activeTab === "account" && (
        <div className="space-y-4 animate-[fadeUp_0.2s_ease-out]">
          <SectionCard eyebrow="Profile" title="Your account details">
            <div className="grid sm:grid-cols-3 gap-4">
              <Info label="Name" value={user?.name || "—"} />
              <Info label="Email" value={user?.email} />
              <Info label="Plan" value={
                <span className={`capitalize font-semibold ${user?.tier === "premium" ? "text-emerald" : "text-muted-foreground"}`}>
                  {user?.tier || "free"}
                </span>
              } />
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── SUBSCRIPTION TAB ── */}
      {activeTab === "subscription" && (
        <div className="space-y-4 animate-[fadeUp_0.2s_ease-out]">
          <SectionCard eyebrow="Subscription" title="Plan & billing">
            {!subscription ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="space-y-5">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Info label="Plan" value={subscription.is_premium ? "Premium" : "Free"} />
                  <Info label="Status" value={
                    <span className="capitalize">{subscription.subscription_status || (subscription.on_trial ? "trialing" : "active")}</span>
                  } />
                  {subscription.current_period_end && (
                    <Info
                      label={subscription.cancel_at_period_end ? "Cancels on" : "Next billing date"}
                      value={new Date(subscription.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                    />
                  )}
                </div>

                {subscription.free_trial_end && !subscription.is_premium && (
                  <div className="rounded-xl border border-topaz/30 bg-topaz/5 px-4 py-3 text-sm text-topaz">
                    Your free trial ends on {new Date(subscription.free_trial_end).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.
                  </div>
                )}

                {subscription.cancel_at_period_end && (
                  <div className="rounded-xl border border-ruby/30 bg-ruby/5 px-4 py-3 text-sm text-ruby">
                    Cancellation scheduled — you keep Premium until the end of the billing period.
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-1">
                  {subscription.is_premium && !subscription.is_admin && (
                    <Button
                      variant="outlinePill"
                      size="pill"
                      onClick={openPortal}
                      disabled={portalBusy}
                    >
                      <CreditCard className="h-4 w-4" />
                      {portalBusy ? "Opening…" : "Manage billing"}
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                  {subscription.is_premium && !subscription.cancel_at_period_end && !subscription.is_admin && (
                    <Button
                      variant="danger"
                      size="pill"
                      onClick={() => setConfirmOpen(true)}
                      disabled={cancelBusy}
                    >
                      <XCircle className="h-4 w-4" />
                      {cancelBusy ? "…" : "Cancel subscription"}
                    </Button>
                  )}
                  {!subscription.is_premium && !subscription.on_trial && (
                    <Button asChild variant="primary" size="pill">
                      <a href="/pricing">
                        <Crown className="h-4 w-4" /> Upgrade to Premium — £5/mo
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ── INTEGRATIONS TAB ── */}
      {activeTab === "integrations" && (
        <div className="animate-[fadeUp_0.2s_ease-out]">
          <IntegrationsPage embedded />
        </div>
      )}

      {/* ── SMS TAB ── */}
      {activeTab === "sms" && (
        <div className="animate-[fadeUp_0.2s_ease-out]">
          <SMSPage embedded />
        </div>
      )}

      {/* ── AI & INTEGRATIONS TAB ── */}
      {activeTab === "ai" && (
        <div className="space-y-4 animate-[fadeUp_0.2s_ease-out]">
          <SectionCard eyebrow="Usage" title="AI consumption this month">
            <div className="grid sm:grid-cols-2 gap-4">
              <Info label="Approx tokens used" value={usage.approx_total_tokens.toLocaleString()} />
              <Info label="Approx cost (USD)" value={`$${usage.approx_cost_usd}`} />
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Default model: Claude Sonnet 4.5 via built-in key. Premium unlocks unlimited AI usage.
            </p>
          </SectionCard>

          <SectionCard
            eyebrow="Custom AI providers"
            title="Bring your own API key"
            description="Connect your own OpenAI, Anthropic, or Gemini key to use instead of the built-in model."
          >
            <form onSubmit={addProvider} className="space-y-3">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="label-overline">Nickname *</label>
                  <Input
                    data-testid="ai-prov-name"
                    required
                    placeholder="My OpenAI key"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="label-overline">Provider *</label>
                  <select
                    data-testid="ai-prov-provider"
                    value={form.provider}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}
                    className="mt-1 w-full h-11 rounded-xl bg-secondary/50 border border-transparent px-4 text-sm transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none"
                  >
                    {PROVIDERS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-overline">Model *</label>
                  <Input
                    data-testid="ai-prov-model"
                    required
                    placeholder="gpt-4o"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="label-overline">API Key</label>
                  <Input
                    data-testid="ai-prov-key"
                    placeholder="sk-…"
                    type="password"
                    value={form.api_key}
                    onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                    className="mt-1 w-full"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_default}
                      onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                      className="rounded border-border accent-emerald"
                    />
                    Set as default
                  </label>
                </div>
              </div>
              <div>
                <Button data-testid="ai-prov-add" variant="primary" size="pill">
                  <Plus className="h-4 w-4" /> Save provider
                </Button>
              </div>
            </form>

            {providers.length > 0 && (
              <div className="mt-5 space-y-2 border-t border-border pt-4">
                {providers.map((p) => (
                  <div key={p.provider_id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/40">
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-4 w-4 text-emerald" />
                      <div>
                        <p className="text-sm font-medium">
                          {p.name}
                          {p.is_default && <span className="ml-2 text-xs text-emerald">· default</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{p.provider} · {p.model}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => delProvider(p.provider_id)}
                      data-testid={`del-prov-${p.provider_id}`}
                      className="p-2 text-muted-foreground hover:text-ruby"
                      aria-label={`Remove ${p.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {providers.length === 0 && (
              <p className="mt-4 text-xs text-muted-foreground">No custom providers — using built-in Claude Sonnet 4.5.</p>
            )}
          </SectionCard>
        </div>
      )}

      {/* ── ADMIN TAB ── */}
      {activeTab === "admin" && user?.role === "admin" && (
        <div className="space-y-4 animate-[fadeUp_0.2s_ease-out]">
          <div className="rounded-xl border border-topaz/30 bg-topaz/5 px-4 py-3 text-sm text-topaz flex items-start gap-2">
            <Lock className="h-4 w-4 mt-0.5 shrink-0" />
            <span>This section configures global system settings that affect all users. Handle with care.</span>
          </div>

          <SectionCard eyebrow="TrueLayer credentials" title="Bank connection configuration" data-testid="truelayer-admin-card">
            <p className="text-sm text-muted-foreground mb-5">
              Configure your TrueLayer sandbox or live app credentials.
              {tl?.has_secret && (
                <span className="ml-2 text-emerald inline-flex items-center gap-1 text-xs">
                  <ShieldCheck className="h-3 w-3" /> Secret on file
                </span>
              )}
            </p>
            <form onSubmit={saveTl} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label-overline">Client ID</label>
                  <Input
                    data-testid="tl-client-id"
                    required
                    value={tlForm.client_id}
                    onChange={(e) => setTlForm({ ...tlForm, client_id: e.target.value })}
                    placeholder="sandbox-yourapp-12ab34"
                    className="mt-1 w-full font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="label-overline">
                    Client Secret
                    {tl?.has_secret && <span className="ml-1 normal-case tracking-normal text-muted-foreground font-normal">(leave blank to keep current)</span>}
                  </label>
                  <Input
                    data-testid="tl-client-secret"
                    type="password"
                    value={tlForm.client_secret}
                    onChange={(e) => setTlForm({ ...tlForm, client_secret: e.target.value })}
                    placeholder={tl?.has_secret ? "•••••••• (unchanged)" : "Paste secret"}
                    className="mt-1 w-full font-mono text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label-overline">Redirect URI</label>
                  <Input
                    data-testid="tl-redirect"
                    value={tlForm.redirect_uri}
                    onChange={(e) => setTlForm({ ...tlForm, redirect_uri: e.target.value })}
                    className="mt-1 w-full font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Add this exact URL in TrueLayer Console → Allowed redirect URIs.</p>
                </div>
                <div>
                  <label className="label-overline">Environment</label>
                  <select
                    data-testid="tl-env"
                    value={tlForm.environment}
                    onChange={(e) => setTlForm({ ...tlForm, environment: e.target.value })}
                    className="mt-1 w-full h-11 rounded-xl bg-secondary/50 border border-transparent px-4 text-sm transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none"
                  >
                    <option value="sandbox">Sandbox</option>
                    <option value="live">Live</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-4 pt-1">
                <Button data-testid="tl-save" variant="primary" size="pill" disabled={tlBusy}>
                  {tlBusy ? "Saving…" : "Save credentials"}
                </Button>
                <a href="https://console.truelayer.com" target="_blank" rel="noreferrer" className="text-sm text-emerald hover:underline inline-flex items-center gap-1">
                  Open TrueLayer Console <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </form>
          </SectionCard>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Cancel subscription?"
        message="You'll keep Premium access until the end of the current billing period. This cannot be undone."
        confirmLabel="Yes, cancel subscription"
        onConfirm={doCancelSub}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="label-overline">{label}</p>
      <p className="text-sm font-medium mt-1">{value}</p>
    </div>
  );
}

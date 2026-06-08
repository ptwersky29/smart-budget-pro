import React, { useCallback, useEffect, useState } from "react";
import { Bot, Sparkles, Trash2, Plus } from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { SectionCard } from "../ui/layout";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useSettings } from "../../contexts/SettingsContext";

const PROVIDERS = ["openai", "anthropic", "gemini", "custom"];

export default React.memo(function AutomationSettings() {
  const { settings, updateSettings } = useSettings();
  const prefs = settings.preferences;
  const automation = prefs?.automation || {};

  const [providers, setProviders] = useState([]);
  const [usage, setUsage] = useState({ approx_total_tokens: 0, approx_cost_usd: 0 });
  const [form, setForm] = useState({ name: "", provider: "openai", model: "gpt-4o", api_key: "", endpoint: "", is_default: false });

  const loadAI = useCallback(async () => {
    try {
      const [p, u] = await Promise.all([api.get("/ai/providers"), api.get("/ai/usage")]);
      setProviders(p.data.providers || []);
      setUsage({ approx_total_tokens: u.data.approx_total_tokens || 0, approx_cost_usd: u.data.approx_cost_usd || 0 });
    } catch { /* not configured */ }
  }, []);

  useEffect(() => { loadAI(); }, [loadAI]);

  const addProvider = async (e) => {
    e.preventDefault();
    try {
      await api.post("/ai/providers", form);
      toast.success("Provider added");
      setForm({ ...form, name: "", api_key: "" });
      await loadAI();
    } catch { toast.error("Could not save provider"); }
  };

  const delProvider = async (id) => {
    await api.delete(`/ai/providers/${id}`);
    toast.success("Removed");
    await loadAI();
  };

  const setAutomation = useCallback((key, value) => {
    updateSettings({ preferences: { automation: { [key]: value } } });
  }, [updateSettings]);

  return (
    <>
      <SectionCard
        eyebrow="Automation"
        title="AI Features"
        description="Control how AI helps manage your finances."
      >
        <div className="space-y-3">
          {[
            { key: "ai_enabled", label: "Enable AI", desc: "Turn on AI-powered features across the app" },
            { key: "auto_categorize", label: "Auto-categorize transactions", desc: "AI suggests categories when you add transactions" },
            { key: "predict_budget", label: "Budget predictions", desc: "AI forecasts your monthly spending patterns" },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-xl border border-border">
              <div>
                <Label htmlFor={`auto-${key}`} className="text-sm font-medium cursor-pointer">{label}</Label>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch
                id={`auto-${key}`}
                checked={automation[key]}
                onCheckedChange={(v) => setAutomation(key, v)}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Automation"
        title="AI Usage"
        description="Monthly consumption for built-in AI."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="label-overline">Tokens used</p>
            <p className="text-sm font-medium mt-1">{usage.approx_total_tokens.toLocaleString()}</p>
          </div>
          <div>
            <p className="label-overline">Estimated cost (USD)</p>
            <p className="text-sm font-medium mt-1">${usage.approx_cost_usd}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Default model: Claude Sonnet 4.5 via built-in key. Premium unlocks unlimited AI usage.
        </p>
      </SectionCard>

      <SectionCard
        eyebrow="Automation"
        title="Custom AI Providers"
        description="Bring your own API key for OpenAI, Anthropic, or Gemini."
      >
        <form onSubmit={addProvider} className="space-y-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="label-overline">Nickname *</label>
              <Input required placeholder="My OpenAI key" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full" />
            </div>
            <div>
              <label className="label-overline">Provider *</label>
              <select value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                className="mt-1 w-full h-11 rounded-xl bg-secondary/50 border border-transparent px-4 text-sm focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none"
              >
                {PROVIDERS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label-overline">Model *</label>
              <Input required placeholder="gpt-4o" value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })} className="mt-1 w-full" />
            </div>
            <div>
              <label className="label-overline">API Key</label>
              <Input placeholder="sk-…" type="password" value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })} className="mt-1 w-full" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_default}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  className="rounded border-border accent-emerald" />
                Set as default
              </label>
            </div>
          </div>
          <Button variant="primary" size="pill">
            <Plus className="h-4 w-4" /> Save provider
          </Button>
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
                <button onClick={() => delProvider(p.provider_id)} className="p-2 text-muted-foreground hover:text-ruby" aria-label={`Remove ${p.name}`}>
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
    </>
  );
});

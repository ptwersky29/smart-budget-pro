import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { useTheme } from "next-themes";

const SettingsContext = createContext(null);

const DEFAULTS = {
  appearance: { density: "comfortable", font_size: "medium" },
  dashboard: {
    layout: "default",
    widgets: ["overview", "recent_transactions", "budget_summary", "ai_insights", "spending_chart", "upcoming_events"],
  },
  automation: { ai_enabled: true, auto_categorize: true, predict_budget: true },
  notifications: {
    email_alerts: true, push_alerts: true, sms_alerts: false,
    budget_reminders: true, weekly_report: true, spending_alerts: true,
  },
  accessibility: { high_contrast: false, font_scaling: 100, keyboard_navigation: true, reduce_motion: false },
};

function applyToDOM(preferences) {
  const root = document.documentElement;
  const a = preferences?.appearance || {};
  const acc = preferences?.accessibility || {};

  root.dataset.density = a.density || "comfortable";
  root.dataset.fontSize = a.font_size || "medium";
  root.style.setProperty("--fs-multiplier", String((acc.font_scaling ?? 100) / 100));
  root.dataset.highContrast = acc.high_contrast ? "true" : "false";
  root.dataset.reduceMotion = acc.reduce_motion ? "true" : "false";
}

export function SettingsProvider({ children }) {
  const { setTheme } = useTheme();
  const [settings, setSettings] = useState({
    language: "en", theme: "system", currency: "GBP",
    onboarding_completed: false, preferences: DEFAULTS,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Apply defaults to DOM immediately on mount so settings take effect even before API loads
  useEffect(() => {
    applyToDOM(DEFAULTS);
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/settings/app");
      setSettings(data);
      if (data.theme) setTheme(data.theme);
      applyToDOM(data.preferences || DEFAULTS);
    } catch {
      // offline-safe - defaults already applied above
    } finally {
      setLoaded(true);
    }
  }, [setTheme]);

  useEffect(() => { load(); }, [load]);

  const updateSettings = useCallback(async (patch) => {
    setSaving(true);
    try {
      const { data } = await api.put("/settings/app", patch);
      setSettings(data);
      if (patch.theme) setTheme(patch.theme);
      applyToDOM(data.preferences);
      return data;
    } catch (err) {
      toast.error("Failed to save settings");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [setTheme]);

  const value = useMemo(() => ({
    settings, loaded, saving, updateSettings, reload: load,
  }), [settings, loaded, saving, updateSettings, load]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

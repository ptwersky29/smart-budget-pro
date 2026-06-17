import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { useTheme } from "next-themes";

const LS_KEY = "financeai_settings";

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveToStorage(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
}

const SettingsContext = createContext(null);

const DEFAULTS = {
  appearance: { density: "comfortable", font_size: "medium" },
  dashboard: {
    layout: "default",
    widgets: ["net_worth", "income", "spending", "health_score", "cash_flow", "budgets_overview", "quick_actions", "ai_insights", "maaser_balance", "recent_transactions"],
    widget_order: ["net_worth", "income", "spending", "health_score", "cash_flow", "budgets_overview", "quick_actions", "ai_insights", "maaser_balance", "recent_transactions"],
    animations: true,
    chart_style: "smooth",
  },
  finance: { currency: "GBP", default_time_range: "6m" },
  automation: { ai_enabled: true, auto_categorize: true, predict_budget: true },
  notifications: {
    email_alerts: true, push_alerts: true, sms_alerts: false,
    budget_reminders: true, weekly_report: true, spending_alerts: true,
  },
  accessibility: { high_contrast: false, font_scaling: 100, keyboard_navigation: true, reduce_motion: false, enhanced_focus: false },
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
  root.dataset.enhancedFocus = acc.enhanced_focus ? "true" : "false";

  if (acc.high_contrast) {
    root.classList.add("high-contrast-mode");
  } else {
    root.classList.remove("high-contrast-mode");
  }

  if (acc.enhanced_focus) {
    root.classList.add("enhanced-focus");
  } else {
    root.classList.remove("enhanced-focus");
  }
}

export function SettingsProvider({ children }) {
  const { setTheme } = useTheme();
  const cached = useMemo(() => loadFromStorage(), []);
  const [settings, setSettings] = useState(cached || {
    language: "en", theme: "system", currency: "GBP",
    onboarding_completed: false, preferences: DEFAULTS,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const debounceTimer = useRef(null);

  useEffect(() => {
    applyToDOM(DEFAULTS);
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/settings/app");
      setSettings(data);
      saveToStorage(data);
      if (data.theme) setTheme(data.theme);
      applyToDOM(data.preferences || DEFAULTS);
    } catch {
      // offline-safe — localStorage or defaults already applied
    } finally {
      setLoaded(true);
    }
  }, [setTheme]);

  useEffect(() => { load(); }, [load]);

  const updateSettings = useCallback(async (patch) => {
    const prev = settingsRef.current;
    const merged = { ...prev, ...patch, preferences: { ...prev.preferences, ...patch.preferences } };
    setSettings(merged);
    if (patch.theme) setTheme(patch.theme);
    applyToDOM(merged.preferences || DEFAULTS);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    return new Promise((resolve, reject) => {
      debounceTimer.current = setTimeout(async () => {
        setSaving(true);
        try {
          const { data } = await api.put("/settings/app", patch);
          setSettings(data);
          saveToStorage(data);
          resolve(data);
        } catch (err) {
          setSettings(prev);
          saveToStorage(prev);
          if (prev.theme) setTheme(prev.theme);
          applyToDOM(prev.preferences || DEFAULTS);
          toast.error("Failed to save settings");
          reject(err);
        } finally {
          setSaving(false);
        }
      }, 300);
    });
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

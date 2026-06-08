import React, { useCallback } from "react";
import { Layout, Columns, Rows, Grid3x3 } from "lucide-react";
import { SectionCard } from "../ui/layout";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { useSettings } from "../../contexts/SettingsContext";

const LAYOUTS = [
  { value: "default", label: "Default", icon: Layout, desc: "Standard widget arrangement" },
  { value: "compact", label: "Compact", icon: Columns, desc: "Tighter widget grid" },
  { value: "detailed", label: "Detailed", icon: Grid3x3, desc: "More widgets, more info" },
];

const WIDGETS = [
  { key: "overview", label: "Overview Summary", desc: "Total balance, income, expenses" },
  { key: "recent_transactions", label: "Recent Transactions", desc: "Latest 5 transactions" },
  { key: "budget_summary", label: "Budget Summary", desc: "Budget progress bars" },
  { key: "ai_insights", label: "AI Insights", desc: "Smart spending suggestions" },
  { key: "spending_chart", label: "Spending Chart", desc: "Visual spending breakdown" },
  { key: "upcoming_events", label: "Upcoming Events", desc: "Planned bills and events" },
];

export default React.memo(function DashboardSettings() {
  const { settings, updateSettings, saving } = useSettings();
  const prefs = settings.preferences;
  const dashboard = prefs?.dashboard || {};

  const setDashboard = useCallback((key, value) => {
    updateSettings({ preferences: { dashboard: { [key]: value } } });
  }, [updateSettings]);

  const toggleWidget = useCallback((widgetKey) => {
    const current = dashboard.widgets || [];
    const next = current.includes(widgetKey)
      ? current.filter((k) => k !== widgetKey)
      : [...current, widgetKey];
    setDashboard("widgets", next);
  }, [dashboard.widgets, setDashboard]);

  return (
    <>
      <SectionCard
        eyebrow="Dashboard"
        title="Layout"
        description="Choose how your dashboard is arranged."
      >
        <div className="flex flex-wrap gap-3">
          {LAYOUTS.map(({ value, label, icon: Icon, desc }) => (
            <button
              key={value}
              onClick={() => setDashboard("layout", value)}
              disabled={saving}
              className={`flex-1 min-w-[140px] text-left p-4 rounded-xl border text-sm transition-all ${
                dashboard.layout === value
                  ? "border-emerald bg-emerald/5 text-emerald ring-1 ring-emerald/20"
                  : "border-border bg-card/50 text-muted-foreground hover:border-muted-foreground/30"
              }`}
            >
              <Icon className="h-5 w-5 mb-2" />
              <p className="font-medium text-foreground mb-0.5">{label}</p>
              <p className="text-xs opacity-70">{desc}</p>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Dashboard"
        title="Widget Visibility"
        description="Show or hide dashboard widgets."
      >
        <div className="space-y-2">
          {WIDGETS.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-xl border border-border">
              <div>
                <Label htmlFor={`widget-${key}`} className="text-sm font-medium cursor-pointer">{label}</Label>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch
                id={`widget-${key}`}
                checked={(dashboard.widgets || []).includes(key)}
                onCheckedChange={() => toggleWidget(key)}
              />
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
});

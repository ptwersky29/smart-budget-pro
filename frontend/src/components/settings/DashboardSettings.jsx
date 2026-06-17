import React, { useCallback } from "react";
import { Layout, Columns, Grid3x3, Sparkles, Activity, ArrowUpDown } from "lucide-react";
import { SectionCard } from "../ui/layout";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { useSettings } from "../../contexts/SettingsContext";

const LAYOUTS = [
  { value: "default", label: "Default", icon: Layout, desc: "Standard widget arrangement" },
  { value: "compact", label: "Compact", icon: Columns, desc: "Tighter widget grid" },
  { value: "detailed", label: "Detailed", icon: Grid3x3, desc: "More widgets, more info" },
];

const WIDGETS = [
  { key: "net_worth", label: "Net Worth", desc: "Total balance with 6mo trend" },
  { key: "income", label: "Income", desc: "Monthly income figure" },
  { key: "spending", label: "Spending", desc: "Monthly spending figure" },
  { key: "health_score", label: "Health Score", desc: "Financial health indicator" },
  { key: "cash_flow", label: "Cash Flow Chart", desc: "Income vs spending over time" },
  { key: "budgets_overview", label: "Budgets Overview", desc: "Budget progress bars" },
  { key: "quick_actions", label: "Quick Actions", desc: "Shortcut action buttons" },
  { key: "ai_insights", label: "AI Insights", desc: "Smart spending suggestions" },
  { key: "maaser_balance", label: "Maaser Balance", desc: "Monthly Maaser obligation and balance" },
  { key: "recent_transactions", label: "Recent Transactions", desc: "Latest 5 transactions" },
];

const CHART_STYLES = [
  { value: "smooth", label: "Smooth", desc: "Curved line transitions" },
  { value: "sharp", label: "Sharp", desc: "Straight line segments" },
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

  const moveWidget = useCallback((widgetKey, direction) => {
    const order = [...(dashboard.widget_order || []).filter(k => k !== widgetKey)];
    const idx = (dashboard.widget_order || []).indexOf(widgetKey);
    const insertAt = direction === "up" ? Math.max(0, idx - 1) : Math.min(order.length, idx);
    order.splice(insertAt, 0, widgetKey);
    setDashboard("widget_order", order);
  }, [dashboard.widget_order, setDashboard]);

  const visibleWidgets = (dashboard.widget_order || dashboard.widgets || []).filter(k => dashboard.widgets?.includes(k));

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

      <SectionCard
        eyebrow="Dashboard"
        title="Widget Order"
        description="Arrange the order widgets appear on your dashboard."
      >
        <div className="space-y-2">
          {visibleWidgets.map((key, i) => {
            const w = WIDGETS.find(w => w.key === key);
            return (
              <div key={key} className="flex items-center justify-between p-3 rounded-xl border border-border">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium">{w?.label || key}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="outlinePill" size="pillSm" disabled={i === 0} onClick={() => moveWidget(key, "up")}>▲</Button>
                  <Button variant="outlinePill" size="pillSm" disabled={i === visibleWidgets.length - 1} onClick={() => moveWidget(key, "down")}>▼</Button>
                </div>
              </div>
            );
          })}
          {visibleWidgets.length === 0 && (
            <p className="text-sm text-muted-foreground">Enable widgets above to reorder them.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Dashboard"
        title="Chart Style"
        description="Choose how line charts are rendered."
      >
        <div className="flex flex-wrap gap-3">
          {CHART_STYLES.map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => setDashboard("chart_style", value)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all ${
                (dashboard.chart_style || "smooth") === value
                  ? "border-emerald bg-emerald/5 text-emerald ring-1 ring-emerald/20"
                  : "border-border bg-card/50 text-muted-foreground hover:border-muted-foreground/30"
              }`}
            >
              <Activity className="h-5 w-5" />
              <div className="text-left">
                <p className="font-medium text-foreground">{label}</p>
                <p className="text-xs opacity-70">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Dashboard"
        title="Animations"
        description="Toggle page transitions and motion effects."
      >
        <div className="flex items-center justify-between p-3 rounded-xl border border-border">
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label htmlFor="dashboard-animations" className="text-sm font-medium cursor-pointer">Enable Animations</Label>
              <p className="text-xs text-muted-foreground">Page transitions, loading effects, and hover animations</p>
            </div>
          </div>
          <Switch
            id="dashboard-animations"
            checked={dashboard.animations !== false}
            onCheckedChange={(v) => setDashboard("animations", v)}
          />
        </div>
      </SectionCard>
    </>
  );
});

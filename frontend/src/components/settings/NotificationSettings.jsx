import React, { useCallback } from "react";
import { Bell, Mail, Smartphone, MessageSquare, Calendar, TrendingUp } from "lucide-react";
import { SectionCard } from "../ui/layout";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { useSettings } from "../../contexts/SettingsContext";

export default React.memo(function NotificationSettings() {
  const { settings, updateSettings } = useSettings();
  const prefs = settings.preferences;
  const notif = prefs?.notifications || {};

  const setNotif = useCallback((key, value) => {
    updateSettings({ preferences: { notifications: { [key]: value } } });
  }, [updateSettings]);

  const channels = [
    { key: "email_alerts", label: "Email Notifications", icon: Mail, desc: "Receive alerts via email" },
    { key: "push_alerts", label: "Push Notifications", icon: Bell, desc: "Browser and mobile push alerts" },
    { key: "sms_alerts", label: "SMS Alerts", icon: MessageSquare, desc: "Text message alerts (requires SMS setup)" },
  ];

  const alerts = [
    { key: "budget_reminders", label: "Budget Reminders", icon: Calendar, desc: "Remind when approaching budget limits" },
    { key: "weekly_report", label: "Weekly Report", icon: TrendingUp, desc: "Weekly spending summary via email" },
    { key: "spending_alerts", label: "Spending Alerts", icon: Smartphone, desc: "Real-time alerts on large transactions" },
  ];

  return (
    <>
      <SectionCard
        eyebrow="Notifications"
        title="Delivery Channels"
        description="How you want to receive notifications."
      >
        <div className="space-y-2">
          {channels.map(({ key, label, icon: Icon, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-xl border border-border">
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor={`notif-${key}`} className="text-sm font-medium cursor-pointer">{label}</Label>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
              <Switch id={`notif-${key}`} checked={notif[key]} onCheckedChange={(v) => setNotif(key, v)} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Notifications"
        title="Alert Types"
        description="Choose which events trigger notifications."
      >
        <div className="space-y-2">
          {alerts.map(({ key, label, icon: Icon, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-xl border border-border">
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor={`notif-${key}`} className="text-sm font-medium cursor-pointer">{label}</Label>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
              <Switch id={`notif-${key}`} checked={notif[key]} onCheckedChange={(v) => setNotif(key, v)} />
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
});

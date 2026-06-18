import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/ui/layout";
import SettingsLayout from "../components/SettingsLayout";
import AppearanceSettings from "../components/settings/AppearanceSettings";
import DashboardSettings from "../components/settings/DashboardSettings";
import FinanceSettings from "../components/settings/FinanceSettings";
import AutomationSettings from "../components/settings/AutomationSettings";
import NotificationSettings from "../components/settings/NotificationSettings";
import AccessibilitySettings from "../components/settings/AccessibilitySettings";
import AccountSettings from "../components/settings/AccountSettings";
import CategoryManager from "./CategoryManager";

export default function Settings() {
  useEffect(() => { document.title = "Settings | FinanceAI"; }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionFromUrl = searchParams.get("section") || "appearance";
  const [activeSection, setActiveSection] = useState(sectionFromUrl);

  const setSection = (key) => {
    setActiveSection(key);
    setSearchParams({ section: key }, { replace: true });
  };

  return (
    <div className="space-y-6" data-testid="settings-root">
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Customize your experience — appearance, automation, notifications, and account."
      />

      <SettingsLayout active={activeSection} onChange={setSection}>
        {activeSection === "appearance" && <AppearanceSettings />}
        {activeSection === "dashboard" && <DashboardSettings />}
        {activeSection === "finance" && <FinanceSettings />}
        {activeSection === "automation" && <AutomationSettings />}
        {activeSection === "notifications" && <NotificationSettings />}
        {activeSection === "accessibility" && <AccessibilitySettings />}
        {activeSection === "account" && <AccountSettings />}
        {activeSection === "categories" && <CategoryManager />}
      </SettingsLayout>
    </div>
  );
}

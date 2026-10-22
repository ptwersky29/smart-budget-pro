import React, { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SettingsLayout from "../components/SettingsLayout";
import AppearanceSettings from "../components/settings/AppearanceSettings";
import DashboardSettings from "../components/settings/DashboardSettings";
import FinanceSettings from "../components/settings/FinanceSettings";
import AutomationSettings from "../components/settings/AutomationSettings";
import NotificationSettings from "../components/settings/NotificationSettings";
import AccessibilitySettings from "../components/settings/AccessibilitySettings";
import AccountSettings from "../components/settings/AccountSettings";
import { PageHeader } from "../components/ui/page";

const CategoryManager = lazy(() => import("./CategoryManager"));

export default function Settings() {
  useEffect(() => { document.title = "Settings | Penni"; }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionFromUrl = searchParams.get("section") || "appearance";
  const [activeSection, setActiveSection] = useState(sectionFromUrl);

  const setSection = (key) => {
    setActiveSection(key);
    setSearchParams({ section: key }, { replace: true });
  };

  return (
    <div className="page-stack pb-4" data-testid="settings-root">
      <PageHeader eyebrow="Preferences" title="Settings" description="Shape Penni around how you like to work, spend and plan." />
      <SettingsLayout active={activeSection} onChange={setSection}>
        {activeSection === "appearance" && <AppearanceSettings />}
        {activeSection === "dashboard" && <DashboardSettings />}
        {activeSection === "finance" && <FinanceSettings />}
        {activeSection === "automation" && <AutomationSettings />}
        {activeSection === "notifications" && <NotificationSettings />}
        {activeSection === "accessibility" && <AccessibilitySettings />}
        {activeSection === "account" && <AccountSettings />}
        {activeSection === "categories" && <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading…</div>}><CategoryManager /></Suspense>}
      </SettingsLayout>
    </div>
  );
}

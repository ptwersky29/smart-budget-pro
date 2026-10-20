import React from "react";
import {
  Palette, Layout, Bot, Bell, Accessibility, User, Receipt, Shield, List, Coins,
} from "lucide-react";

const SECTIONS = [
  { key: "appearance",    label: "Appearance",    icon: Palette },
  { key: "dashboard",     label: "Dashboard",     icon: Layout },
  { key: "finance",       label: "Finance",       icon: Coins },
  { key: "automation",    label: "Automation",    icon: Bot },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "accessibility", label: "Accessibility", icon: Accessibility },
  { key: "categories",    label: "Categories",    icon: List },
  { key: "account",       label: "Account",       icon: User },
];

export default React.memo(function SettingsLayout({ active, onChange, children }) {
  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      {/* Sidebar */}
      <nav className="shrink-0 grid grid-cols-2 gap-1.5 lg:flex lg:flex-col lg:gap-1 lg:w-56">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`inline-flex min-w-0 items-center gap-2 text-xs sm:text-sm lg:w-full px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl transition-colors ${
              active === key
                ? "bg-emerald/10 text-emerald font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-6 animate-[fadeUp_0.2s_ease-out]">
        {children}
      </div>
    </div>
  );
});

export { SECTIONS };

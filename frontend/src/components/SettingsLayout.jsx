import React from "react";
import {
  Palette, Layout, Bot, Bell, Accessibility, User, Receipt, Shield, List,
} from "lucide-react";

const SECTIONS = [
  { key: "appearance",    label: "Appearance",    icon: Palette },
  { key: "dashboard",     label: "Dashboard",     icon: Layout },
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
      <nav className="lg:w-56 shrink-0 flex lg:flex-col gap-1 overflow-x-auto no-scrollbar -mx-4 sm:mx-0 px-4 sm:px-0 lg:p-0">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`inline-flex items-center gap-2.5 text-sm whitespace-nowrap lg:w-full px-3 py-2.5 rounded-xl transition-colors shrink-0 ${
              active === key
                ? "bg-emerald/10 text-emerald font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
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

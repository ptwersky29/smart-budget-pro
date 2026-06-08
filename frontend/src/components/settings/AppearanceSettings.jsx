import React, { useCallback } from "react";
import { Palette, Sun, Moon, Monitor, LayoutIcon, Type } from "lucide-react";
import { SectionCard } from "../ui/layout";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { useSettings } from "../../contexts/SettingsContext";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];
const DENSITIES = [
  { value: "compact", label: "Compact", desc: "Tighter spacing, more on screen" },
  { value: "comfortable", label: "Comfortable", desc: "Balanced spacing" },
  { value: "spacious", label: "Spacious", desc: "Extra breathing room" },
];
const FONT_SIZES = [
  { value: "small", label: "Small", desc: "Smaller text for dense data" },
  { value: "medium", label: "Medium", desc: "Default text size" },
  { value: "large", label: "Large", desc: "Larger text for readability" },
];

export default React.memo(function AppearanceSettings() {
  const { settings, updateSettings, saving } = useSettings();
  const prefs = settings.preferences;
  const appearance = prefs?.appearance || {};

  const setAppearance = useCallback((key, value) => {
    updateSettings({ preferences: { appearance: { [key]: value } } });
  }, [updateSettings]);

  return (
    <>
      <SectionCard
        eyebrow="Appearance"
        title="Theme"
        description="Choose how the app looks — light, dark, or follow your system."
      >
        <div className="flex flex-wrap gap-3">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => updateSettings({ theme: value })}
              disabled={saving}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm transition-all ${
                settings.theme === value
                  ? "border-emerald bg-emerald/5 text-emerald ring-1 ring-emerald/20"
                  : "border-border bg-card/50 text-muted-foreground hover:border-muted-foreground/30"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Appearance"
        title="Density"
        description="Controls spacing and layout compactness."
      >
        <RadioGroup
          value={appearance.density || "comfortable"}
          onValueChange={(v) => setAppearance("density", v)}
          className="space-y-2"
        >
          {DENSITIES.map(({ value, label, desc }) => (
            <div key={value} className="flex items-start gap-3 p-3 rounded-xl border border-border has-[:checked]:border-emerald/30 has-[:checked]:bg-emerald/5 transition-colors">
              <RadioGroupItem value={value} id={`density-${value}`} className="mt-0.5" />
              <Label htmlFor={`density-${value}`} className="flex flex-col cursor-pointer">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </SectionCard>

      <SectionCard
        eyebrow="Appearance"
        title="Font Size"
        description="Adjust text size across the application."
      >
        <RadioGroup
          value={appearance.font_size || "medium"}
          onValueChange={(v) => setAppearance("font_size", v)}
          className="space-y-2"
        >
          {FONT_SIZES.map(({ value, label, desc }) => (
            <div key={value} className="flex items-start gap-3 p-3 rounded-xl border border-border has-[:checked]:border-emerald/30 has-[:checked]:bg-emerald/5 transition-colors">
              <RadioGroupItem value={value} id={`font-${value}`} className="mt-0.5" />
              <Label htmlFor={`font-${value}`} className="flex flex-col cursor-pointer">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </SectionCard>
    </>
  );
});

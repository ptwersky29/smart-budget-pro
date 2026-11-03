import React, { useCallback } from "react";
import { Palette, Sun, Moon, Monitor, LayoutIcon, Type } from "lucide-react";
import { SectionCard } from "../ui/layout";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { useSettings } from "../../contexts/SettingsContext";

const ACCENTS = [
  {value:"indigo", label:"Indigo", color:"#5b5cf0"},
  {value:"emerald", label:"Emerald", color:"#0ea371"},
  {value:"copper", label:"Copper", color:"#d9772f"},
  {value:"rose", label:"Rose", color:"#e23d68"},
  {value:"sky", label:"Sky", color:"#0d93e8"},
  {value:"violet", label:"Violet", color:"#8b5cf6"},
];
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
        title="Accent colour"
        description="Choose the colour used throughout the application."
      >
        <div className="flex flex-wrap gap-3" role="group" aria-label="Accent colour">
          {ACCENTS.map(({value,label,color}) => (
            <button key={value} type="button" onClick={() => setAppearance("accent",value)}
              disabled={saving} aria-pressed={(appearance.accent||"indigo")===value}
              className={"flex min-w-[94px] flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-xs font-medium transition-colors " + ((appearance.accent||"indigo")===value ? "border-foreground/35 ring-1 ring-foreground/10" : "border-border hover:border-foreground/30")}>
              <span className="grid h-8 w-8 place-items-center rounded-full text-white" style={{background:color}}>{(appearance.accent||"indigo")===value ? "✓" : ""}</span>
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

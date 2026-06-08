import React, { useCallback, useEffect } from "react";
import { Eye, Contrast, Text, MousePointer2, Wind, Focus } from "lucide-react";
import { SectionCard } from "../ui/layout";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { useSettings } from "../../contexts/SettingsContext";

export default React.memo(function AccessibilitySettings() {
  const { settings, updateSettings } = useSettings();
  const prefs = settings.preferences;
  const a11y = prefs?.accessibility || {};

  const setA11y = useCallback((key, value) => {
    updateSettings({ preferences: { accessibility: { [key]: value } } });
  }, [updateSettings]);

  // Apply settings to DOM whenever they change
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.highContrast = a11y.high_contrast ? "true" : "false";
    root.dataset.reduceMotion = a11y.reduce_motion ? "true" : "false";
    root.dataset.enhancedFocus = a11y.enhanced_focus ? "true" : "false";
    root.style.setProperty("--fs-multiplier", String((a11y.font_scaling ?? 100) / 100));
    
    // Apply high contrast CSS class
    if (a11y.high_contrast) {
      root.classList.add("high-contrast-mode");
    } else {
      root.classList.remove("high-contrast-mode");
    }
    
    // Apply enhanced focus CSS class
    if (a11y.enhanced_focus) {
      root.classList.add("enhanced-focus");
    } else {
      root.classList.remove("enhanced-focus");
    }
  }, [a11y]);

  return (
    <>
      <SectionCard
        eyebrow="Accessibility"
        title="Visual"
        description="Adjust visual settings for better readability."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl border border-border">
            <div className="flex items-center gap-3">
              <Contrast className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="high-contrast" className="text-sm font-medium cursor-pointer">High Contrast Mode</Label>
                <p className="text-xs text-muted-foreground">Increases contrast for better readability</p>
              </div>
            </div>
            <Switch id="high-contrast" checked={a11y.high_contrast} onCheckedChange={(v) => setA11y("high_contrast", v)} />
          </div>

          <div className="p-3 rounded-xl border border-border space-y-3">
            <div className="flex items-center gap-3">
              <Text className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium">Font Scaling</Label>
                <p className="text-xs text-muted-foreground">Adjust text size: {a11y.font_scaling}%</p>
              </div>
            </div>
            <Slider
              value={[a11y.font_scaling ?? 100]}
              onValueChange={([v]) => setA11y("font_scaling", v)}
              min={80}
              max={150}
              step={5}
              className="w-full max-w-xs"
              aria-label="Font scaling slider"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>80%</span>
              <span>100%</span>
              <span>150%</span>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Accessibility"
        title="Interaction"
        description="Customize how you interact with the app."
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-xl border border-border">
            <div className="flex items-center gap-3">
              <Focus className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="enhanced-focus" className="text-sm font-medium cursor-pointer">Enhanced Focus Indicators</Label>
                <p className="text-xs text-muted-foreground">More visible focus rings for keyboard navigation</p>
              </div>
            </div>
            <Switch id="enhanced-focus" checked={a11y.enhanced_focus} onCheckedChange={(v) => setA11y("enhanced_focus", v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-border">
            <div className="flex items-center gap-3">
              <MousePointer2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="keyboard-nav" className="text-sm font-medium cursor-pointer">Keyboard Navigation</Label>
                <p className="text-xs text-muted-foreground">Show keyboard shortcut hints and enable full keyboard navigation</p>
              </div>
            </div>
            <Switch id="keyboard-nav" checked={a11y.keyboard_navigation} onCheckedChange={(v) => setA11y("keyboard_navigation", v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-border">
            <div className="flex items-center gap-3">
              <Wind className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="reduce-motion" className="text-sm font-medium cursor-pointer">Reduce Motion</Label>
                <p className="text-xs text-muted-foreground">Minimize animations and transitions throughout the app</p>
              </div>
            </div>
            <Switch id="reduce-motion" checked={a11y.reduce_motion} onCheckedChange={(v) => setA11y("reduce_motion", v)} />
          </div>
        </div>
      </SectionCard>

      {/* CSS for accessibility modes */}
      <style>{`
        html.high-contrast-mode {
          --foreground: #000;
          --background: #fff;
          --muted-foreground: #333;
          --border: #000;
          --emerald: #006b3f;
          --ruby: #a70800;
          --topaz: #cc6600;
        }

        html.high-contrast-mode * {
          border-width: 1px !important;
          border-color: currentColor !important;
        }

        html.enhanced-focus :focus-visible {
          outline: 3px solid #0066cc !important;
          outline-offset: 2px !important;
        }

        html.enhanced-focus button:focus-visible,
        html.enhanced-focus input:focus-visible,
        html.enhanced-focus select:focus-visible,
        html.enhanced-focus textarea:focus-visible,
        html.enhanced-focus a:focus-visible {
          box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.25) !important;
        }

        html[data-reduce-motion="true"] * {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      `}</style>
    </>
  );
});

import React, { useState } from "react";
import { Volume2, Eye, Type, X } from "lucide-react";

/**
 * Accessibility Overlay Component
 * Provides WCAG 2.1 AA compliance features:
 * - Text size adjustment
 * - Color contrast enhancement
 * - Screen reader announcements
 */
export default function AccessibilityOverlay() {
  const [open, setOpen] = useState(false);
  const [textSize, setTextSize] = useState("normal"); // small, normal, large, x-large
  const [highContrast, setHighContrast] = useState(false);
  const [focusIndicators, setFocusIndicators] = useState(false);

  const applySettings = () => {
    // Apply text size
    const sizes = {
      small: "0.875rem",
      normal: "1rem",
      large: "1.125rem",
      "x-large": "1.25rem",
    };
    document.documentElement.style.fontSize = sizes[textSize];

    // Apply high contrast mode
    if (highContrast) {
      document.documentElement.classList.add("high-contrast-mode");
    } else {
      document.documentElement.classList.remove("high-contrast-mode");
    }

    // Enhanced focus indicators
    if (focusIndicators) {
      document.documentElement.classList.add("enhanced-focus");
    } else {
      document.documentElement.classList.remove("enhanced-focus");
    }

    // Announce changes to screen readers
    const announcement = `Accessibility settings updated: text size ${textSize}, ${
      highContrast ? "high contrast enabled" : "normal contrast"
    }, ${focusIndicators ? "enhanced focus indicators" : "standard focus"}`;
    announceToScreenReader(announcement);
  };

  const announcementTarget = React.useRef(null);

  const announceToScreenReader = (message) => {
    if (announcementTarget.current) {
      announcementTarget.current.textContent = message;
      // Clear after announcement
      setTimeout(() => {
        if (announcementTarget.current) {
          announcementTarget.current.textContent = "";
        }
      }, 1000);
    }
  };

  React.useEffect(() => {
    applySettings();
  }, [textSize, highContrast, focusIndicators]);

  return (
    <>
      {/* Screen reader announcement region */}
      <div
        ref={announcementTarget}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* Accessibility Settings Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full bg-sky border-2 border-sky/40 text-white grid place-items-center hover:bg-sky/90 transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky"
        aria-label="Open accessibility settings"
        aria-expanded={open}
        aria-controls="a11y-menu"
      >
        <Eye className="h-5 w-5" />
      </button>

      {/* Accessibility Menu */}
      {open && (
        <div
          id="a11y-menu"
          className="fixed bottom-16 right-4 z-50 rounded-2xl border-2 border-sky/30 bg-card shadow-xl p-5 w-72"
          role="dialog"
          aria-labelledby="a11y-title"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 id="a11y-title" className="font-semibold text-lg">
              Accessibility
            </h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close accessibility menu"
              className="p-1 hover:bg-secondary rounded transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Text Size */}
            <div>
              <label className="label-overline text-sky flex items-center gap-2">
                <Type className="h-4 w-4" />
                Text Size
              </label>
              <select
                value={textSize}
                onChange={(e) => setTextSize(e.target.value)}
                className="mt-2 w-full control-shell text-sm"
                aria-label="Adjust text size"
              >
                <option value="small">Small (87.5%)</option>
                <option value="normal">Normal (100%)</option>
                <option value="large">Large (112.5%)</option>
                <option value="x-large">X-Large (125%)</option>
              </select>
            </div>

            {/* High Contrast Mode */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/20">
              <label htmlFor="contrast-toggle" className="text-sm font-medium cursor-pointer">
                High Contrast
              </label>
              <input
                id="contrast-toggle"
                type="checkbox"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
                className="cursor-pointer"
                aria-describedby="contrast-desc"
              />
              <p id="contrast-desc" className="sr-only">
                Enables enhanced color contrast for better readability
              </p>
            </div>

            {/* Enhanced Focus Indicators */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/20">
              <label htmlFor="focus-toggle" className="text-sm font-medium cursor-pointer">
                Focus Indicators
              </label>
              <input
                id="focus-toggle"
                type="checkbox"
                checked={focusIndicators}
                onChange={(e) => setFocusIndicators(e.target.checked)}
                className="cursor-pointer"
                aria-describedby="focus-desc"
              />
              <p id="focus-desc" className="sr-only">
                Highlights interactive elements with enhanced focus rings for keyboard navigation
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Settings are saved locally in your browser.
            </p>
          </div>
        </div>
      )}

      {/* CSS for High Contrast Mode */}
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
      `}</style>
    </>
  );
}

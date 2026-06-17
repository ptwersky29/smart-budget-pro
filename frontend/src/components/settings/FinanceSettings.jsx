import React, { useCallback } from "react";
import { Coins, CalendarRange } from "lucide-react";
import { SectionCard } from "../ui/layout";
import { Label } from "../ui/label";
import { useSettings } from "../../contexts/SettingsContext";

const CURRENCIES = [
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "ILS", symbol: "₪", name: "Israeli Shekel" },
];

const TIME_RANGES = [
  { value: "1m", label: "1 Month", desc: "Last 30 days" },
  { value: "3m", label: "3 Months", desc: "Quarterly view" },
  { value: "6m", label: "6 Months", desc: "Half-year view" },
];

export default React.memo(function FinanceSettings() {
  const { settings, updateSettings } = useSettings();
  const prefs = settings.preferences;
  const finance = prefs?.finance || {};

  const setFinance = useCallback((key, value) => {
    updateSettings({ preferences: { finance: { [key]: value } } });
  }, [updateSettings]);

  return (
    <>
      <SectionCard
        eyebrow="Finance"
        title="Default Currency"
        description="Choose your primary currency for all financial data."
      >
        <div className="flex flex-wrap gap-3">
          {CURRENCIES.map(({ code, symbol, name }) => (
            <button
              key={code}
              onClick={() => { updateSettings({ currency: code }); setFinance("currency", code); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all ${
                (finance.currency || settings.currency) === code
                  ? "border-emerald bg-emerald/5 text-emerald ring-1 ring-emerald/20"
                  : "border-border bg-card/50 text-muted-foreground hover:border-muted-foreground/30"
              }`}
            >
              <span className="text-lg font-semibold">{symbol}</span>
              <div className="text-left">
                <p className="font-medium text-foreground">{code}</p>
                <p className="text-xs opacity-70">{name}</p>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Finance"
        title="Default Time Range"
        description="Default period shown on dashboard charts and reports."
      >
        <div className="flex flex-wrap gap-3">
          {TIME_RANGES.map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => setFinance("default_time_range", value)}
              className={`flex-1 min-w-[120px] text-left p-4 rounded-xl border text-sm transition-all ${
                (finance.default_time_range || "6m") === value
                  ? "border-emerald bg-emerald/5 text-emerald ring-1 ring-emerald/20"
                  : "border-border bg-card/50 text-muted-foreground hover:border-muted-foreground/30"
              }`}
            >
              <CalendarRange className="h-5 w-5 mb-2" />
              <p className="font-medium text-foreground mb-0.5">{label}</p>
              <p className="text-xs opacity-70">{desc}</p>
            </button>
          ))}
        </div>
      </SectionCard>
    </>
  );
});

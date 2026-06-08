import React from "react";
import { AlertTriangle, Info, X } from "lucide-react";

export default React.memo(function BudgetAlertBar({ alerts, onDismiss }) {
  if (!alerts?.length) return null;

  const visible = alerts.slice(0, 3);

  return (
    <div className="space-y-2">
      {visible.map((alert, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 rounded-xl border p-3 sm:p-4 text-sm ${
            alert.severity === "warning"
              ? "border-ruby/30 bg-ruby/5 text-ruby"
              : "border-topaz/30 bg-topaz/5 text-topaz"
          }`}
        >
          {alert.severity === "warning" ? (
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <span className="flex-1">{alert.message}</span>
          {onDismiss && (
            <button onClick={() => onDismiss(i)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {alerts.length > 3 && (
        <p className="text-xs text-muted-foreground text-center">+{alerts.length - 3} more alerts</p>
      )}
    </div>
  );
});

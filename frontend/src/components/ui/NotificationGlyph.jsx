import React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, LoaderCircle } from "lucide-react";

// Shared visual language for transient toasts, saved notifications and status notices.
const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  loading: LoaderCircle,
};

export default function NotificationGlyph({ type = "info", className = "" }) {
  const kind = Object.prototype.hasOwnProperty.call(icons, type) ? type : "info";
  const Icon = icons[kind];
  return (
    <span className={`penni-notification-glyph ${className}`} data-kind={kind} aria-hidden="true">
      <Icon className={`h-[18px] w-[18px] ${kind === "loading" ? "animate-spin" : ""}`} strokeWidth={2} />
    </span>
  );
}

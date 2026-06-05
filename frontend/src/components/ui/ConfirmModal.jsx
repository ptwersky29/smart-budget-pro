import React from "react";
import { Button } from "./button";
import { X, AlertTriangle } from "lucide-react";

export default function ConfirmModal({ open, title, message, confirmLabel = "Delete", cancelLabel = "Cancel", variant = "danger", onConfirm, onCancel }) {
  if (!open) return null;

  const btnVariant = variant === "danger"
    ? "bg-ruby text-white hover:opacity-90"
    : "gradient-emerald text-white";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onCancel}>
      <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-modal p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-ruby" />
            <h3 id="confirm-title" className="text-xl tracking-tight font-medium">{title}</h3>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground" aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="outlinePill" size="pill" onClick={onCancel}>{cancelLabel}</Button>
          <Button onClick={onConfirm} className={btnVariant} size="pill">{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

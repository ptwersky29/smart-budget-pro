import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";
import NativePopup from "./NativePopup";

export default function ConfirmModal({ open, title, message, confirmLabel = "Delete", cancelLabel = "Cancel",
  variant = "danger", onConfirm, onCancel }) {
  return (
    <NativePopup open={open} onClose={onCancel} title={title || "Confirm action"}
      showHeader size="sm"
      footer={<div className="flex w-full flex-wrap justify-end gap-2">
        <Button type="button" variant="outlinePill" onClick={onCancel}>{cancelLabel}</Button>
        <Button type="button" variant={variant === "danger" ? "danger" : "primary"} onClick={onConfirm}
          className={variant === "danger" ? "bg-ruby text-white" : ""}>{confirmLabel}</Button>
      </div>}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-ruby/10 text-ruby">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <p className="pt-1 text-sm leading-relaxed text-muted-foreground">{message}</p>
      </div>
    </NativePopup>
  );
}

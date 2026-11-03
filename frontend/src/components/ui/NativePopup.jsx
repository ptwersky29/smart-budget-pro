import React, { useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

/* Penny ZIP's desktop modal + mobile sheet, with Radix focus/escape support. */
export default function NativePopup({ open, onClose, title = "Penni", description,
  children, footer, size = "md", className, bodyClassName, showHeader = false }) {
  const swipeStart = useRef(null);
  const closeButton = useRef(null);
  return (
    <Dialog.Root open={Boolean(open)} onOpenChange={next => { if (!next) onClose?.(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="penni-native-backdrop" />
        <Dialog.Content className={cn("penni-v2 penni-native-popup", className)} data-size={size}
          data-testid="penni-native-popup" aria-describedby={description ? undefined : undefined}>
          <div aria-hidden="true" className="penni-native-handle-zone"
            onTouchStart={e => { swipeStart.current = e.touches[0]?.clientY ?? null; }}
            onTouchEnd={e => {
              const end = e.changedTouches[0]?.clientY;
              if (swipeStart.current != null && end != null && end - swipeStart.current > 110) closeButton.current?.click();
              swipeStart.current = null;
            }}>
            <div className="penni-native-handle" />
          </div>
          {showHeader ? (
            <div className="penni-native-header">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="penni-native-title">{title}</Dialog.Title>
                {description ? <Dialog.Description className="penni-native-description">{description}</Dialog.Description> : null}
              </div>
              <Dialog.Close asChild>
                <button type="button" ref={closeButton} className="penni-native-close" aria-label="Close dialog"><X className="h-5 w-5" /></button>
              </Dialog.Close>
            </div>
          ) : <><Dialog.Title className="sr-only">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{description || "Complete the form and save or cancel."}</Dialog.Description></>}
          {!showHeader && <Dialog.Close asChild><button type="button" ref={closeButton} className="sr-only" aria-label="Close dialog">Close</button></Dialog.Close>}
          <div className={cn("penni-native-body", bodyClassName)}>{children}</div>
          {footer && <div className="penni-native-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import React, { useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * The canonical Penni modal. It intentionally supports the existing public
 * props: forms, confirmations and transaction workflows use the same shell,
 * while their state and submit behaviour stay in the owning component.
 *
 * Desktop: centred dialog. Mobile: bottom sheet. Only the body scrolls;
 * header and actions remain visible above the virtual keyboard.
 */
export default function NativePopup({
  open, onClose, title = "Penni", description, children, footer,
  size = "md", className, bodyClassName, showHeader = false, icon,
  closeDisabled = false,
}) {
  const swipeStart = useRef(null);
  const closeButton = useRef(null);
  const close = () => { if (!closeDisabled) onClose?.(); };

  return (
    <Dialog.Root open={Boolean(open)} onOpenChange={next => { if (!next) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="penni-native-backdrop penni-shared-backdrop" />
        <Dialog.Content
          className={cn("penni-v2 penni-native-popup penni-popup-surface", className)}
          data-size={size}
          data-penni-kind="modal"
          data-testid="penni-native-popup"
          onPointerDownOutside={event => { if (closeDisabled) event.preventDefault(); }}
          onEscapeKeyDown={event => { if (closeDisabled) event.preventDefault(); }}
        >
          <div aria-hidden="true" className="penni-native-handle-zone"
            onTouchStart={event => { swipeStart.current = event.touches[0]?.clientY ?? null; }}
            onTouchEnd={event => {
              const end = event.changedTouches[0]?.clientY;
              if (!closeDisabled && swipeStart.current != null && end != null &&
                  end - swipeStart.current > 110) closeButton.current?.click();
              swipeStart.current = null;
            }}>
            <div className="penni-native-handle" />
          </div>
          {showHeader ? (
            <div className="penni-native-header">
              {icon ? <div aria-hidden="true" className="penni-popup-heading-icon">{icon}</div> : null}
              <div className="min-w-0 flex-1">
                <Dialog.Title className="penni-native-title">{title}</Dialog.Title>
                {description
                  ? <Dialog.Description className="penni-native-description">{description}</Dialog.Description>
                  : <Dialog.Description className="sr-only">Review details and confirm or cancel.</Dialog.Description>}
              </div>
              <Dialog.Close asChild>
                <button type="button" ref={closeButton} disabled={closeDisabled}
                  className="penni-native-close" aria-label="Close dialog">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          ) : (
            <>
              <Dialog.Title className="sr-only">{title}</Dialog.Title>
              <Dialog.Description className="sr-only">{description || "Complete the action or cancel."}</Dialog.Description>
              <Dialog.Close asChild>
                <button type="button" ref={closeButton} disabled={closeDisabled}
                  className="sr-only" aria-label="Close dialog">Close</button>
              </Dialog.Close>
            </>
          )}
          <div className={cn("penni-native-body", bodyClassName)}>{children}</div>
          {footer ? <div className="penni-native-footer">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

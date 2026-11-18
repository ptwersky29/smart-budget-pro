import React from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import NotificationGlyph from "./NotificationGlyph";

// All transient notifications use one themed, accessible Penni toast surface.
// Call sites continue using Sonner's toast.success/error/info/warning/loading API.
export function Toaster(props) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      className="penni-toaster"
      position="top-right"
      offset={20}
      mobileOffset={12}
      visibleToasts={4}
      duration={4500}
      closeButton
      richColors={false}
      icons={{
        success: <NotificationGlyph type="success" />,
        error: <NotificationGlyph type="error" />,
        warning: <NotificationGlyph type="warning" />,
        info: <NotificationGlyph type="info" />,
        loading: <NotificationGlyph type="loading" />,
      }}
      toastOptions={{
        classNames: {
          toast: "penni-notification-toast",
          content: "penni-notification-content",
          title: "penni-notification-title",
          description: "penni-notification-description",
          actionButton: "penni-notification-action",
          cancelButton: "penni-notification-cancel",
        },
      }}
      {...props}
    />
  );
}

export { toast };

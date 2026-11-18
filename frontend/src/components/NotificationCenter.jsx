import React, { useEffect, useRef, useState } from "react";
import { formatDateTime } from "../lib/format";
import { Bell, Trash2 } from "lucide-react";
import NotificationGlyph from "./ui/NotificationGlyph";
import { api } from "../lib/api";

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get("/notifications");
      if (Array.isArray(data)) {
        setNotifications(data);
        setUnread(data.filter(n => !n.read).length);
      }
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    }
  };

  // Fetch notifications on mount and periodically
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const markAsRead = async (notificationId) => {
    try {
      await api.put(`/notifications/${notificationId}`, { read: true });
      fetchNotifications();
    } catch (error) {
      console.error("Failed to mark notification as read", error);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await api.delete(`/notifications/${notificationId}`);
      fetchNotifications();
    } catch (error) {
      console.error("Failed to delete notification", error);
    }
  };

  const clearAll = async () => {
    try {
      await api.post("/notifications/clear");
      fetchNotifications();
    } catch (error) {
      console.error("Failed to clear notifications", error);
    }
  };

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="penni-notification-panel"
        onClick={() => setOpen(!open)}
        className="penni-notification-trigger relative grid h-11 w-11 place-items-center rounded-full border border-border bg-card/80 transition-colors hover:bg-secondary"
        aria-label={`Notifications ${unread > 0 ? `(${unread} unread)` : ""}`}
        data-testid="notifications-bell"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown Notification Center */}
      {open && (
        <div id="penni-notification-panel" role="region" aria-label="Notifications" className="penni-notification-panel absolute right-0 top-full z-50 mt-2 flex max-h-[min(80dvh,450px)] w-[min(92vw,388px)] flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 p-4 border-b border-border/50">
            <h3 className="font-semibold">Notifications</h3>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-muted-foreground hover:text-foreground"
                aria-label="Clear all notifications"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="overflow-y-auto flex-1 no-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Bell className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50" role="list">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    role="listitem"
                    className={`penni-notification-row group cursor-pointer p-3.5 transition-colors ${!n.read ? "is-unread" : ""}`}
                    onClick={() => !n.read && markAsRead(n.id)}
                  >
                    <div className="flex items-start gap-3">
                      <NotificationGlyph type={n.type} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{n.title}</p>
                          {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                        <p className="text-xs text-muted-foreground/50 mt-1">
                          {formatDateTime(n.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(n.id);
                        }}
                        className="rounded-md p-1 opacity-100 transition-opacity hover:bg-secondary sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                        aria-label="Delete notification"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Close on outside click */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}

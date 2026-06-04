import React, { useEffect, useState } from "react";
import { Bell, AlertTriangle, CheckCircle, Info, AlertCircle, Trash2 } from "lucide-react";
import { api } from "../lib/api";

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch notifications on mount and periodically
  useEffect(() => {
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

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (notificationId) => {
    try {
      await api.put(`/notifications/${notificationId}`, { read: true });
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, read: true } : n
        )
      );
      setUnread(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark notification as read", error);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await api.delete(`/notifications/${notificationId}`);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error("Failed to delete notification", error);
    }
  };

  const clearAll = async () => {
    try {
      await api.post("/notifications/clear");
      setNotifications([]);
      setUnread(0);
    } catch (error) {
      console.error("Failed to clear notifications", error);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-emerald" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-ruby" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-topaz" />;
      default:
        return <Info className="h-4 w-4 text-sky" />;
    }
  };

  const getBackgroundColor = (type) => {
    switch (type) {
      case "success":
        return "bg-emerald/5 border-emerald/20";
      case "error":
        return "bg-ruby/5 border-ruby/20";
      case "warning":
        return "bg-topaz/5 border-topaz/20";
      default:
        return "bg-sky/5 border-sky/20";
    }
  };

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative h-11 w-11 grid place-items-center rounded-full border border-border bg-card/80 hover:bg-secondary transition-colors"
        aria-label={`Notifications ${unread > 0 ? `(${unread} unread)` : ""}`}
        data-testid="notifications-bell"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-ruby grid place-items-center text-xs font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown Notification Center */}
      {open && (
        <div className="absolute top-full right-0 mt-2 w-96 max-h-96 rounded-2xl border border-border bg-card shadow-lg z-50 flex flex-col overflow-hidden">
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
              <div className="divide-y divide-border/50">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 border-l-4 ${getBackgroundColor(n.type)} ${
                      !n.read ? "bg-opacity-100" : "opacity-70"
                    } group cursor-pointer hover:bg-opacity-75 transition-all`}
                    onClick={() => !n.read && markAsRead(n.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{getIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                        <p className="text-xs text-muted-foreground/50 mt-1">
                          {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(n.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 transition-opacity"
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

import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatDateTime } from "../lib/format";
import { Bell, Trash2 } from "lucide-react";
import NotificationGlyph from "./ui/NotificationGlyph";
import { api } from "../lib/api";

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      if (Array.isArray(data)) {
        setNotifications(data);
        setUnread(data.filter(n => !n.read).length);
      }
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    }
  }, []);

  // Refresh on meaningful user activity, never on an idle timer.
  useEffect(() => {
    fetchNotifications();
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", ha¶»§q«^
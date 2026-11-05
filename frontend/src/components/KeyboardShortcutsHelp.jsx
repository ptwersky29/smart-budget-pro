import React from "react";
import { Button } from "./ui/button";
import NativePopup from "./ui/NativePopup";
import { Keyboard } from "lucide-react";

const SHORTCUTS = [
  { keys: "g then d", desc: "Go to Dashboard" },
  { keys: "g then t", desc: "Go to Transactions" },
  { keys: "g then b", desc: "Go to Budgets" },
  { keys: "g then s", desc: "Go to Subscriptions" },
  { keys: "g then r", desc: "Go to Reports" },
  { keys: "g then g", desc: "Go to Settings" },
  { keys: "?", desc: "Toggle this help" },
  { keys: "Escape", desc: "Close modals / deselect" },
  { keys: "n", desc: "New transaction" },
  { keys: "/", desc: "Focus search" },
  { keys: "r", desc: "Refresh data" },
  { keys: "j / k", desc: "Navigate list up/down" },
  { keys: "b", desc: "Toggle bulk select" },
  { keys: "⌘⌫", desc: "Delete selected" },
  { keys: "[ / ]", desc: "Previous / next page" },
  { keys: "⌘K", desc: "Command palette" },
];

export default function KeyboardShortcutsHelp({ open, onClose }) {
  if (!open) return null;
  return (
    <NativePopup open={open} onClose={onClose} title="Keyboard shortcuts"
      description="Move around Penni more quickly with these shortcuts."
      icon={<Keyboard />} showHeader size="sm"
      footer={<Button variant="primary" className="w-full" onClick={onClose}>Done</Button>}>
      <div className="penni-native-form">
        <div className="space-y-1 divide-y divide-border/50">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between gap-3 py-2.5 text-xs">
              <span className="text-muted-foreground">{shortcut.desc}</span>
              <kbd className="shrink-0 rounded-lg border border-border bg-secondary/40 px-2.5 py-1 font-mono text-[11px] text-foreground">
                {shortcut.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </NativePopup>
  );
}

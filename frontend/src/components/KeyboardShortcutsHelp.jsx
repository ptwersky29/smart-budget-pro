import React from "react";
import { Button } from "./ui/button";

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
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative rounded-2xl border border-border bg-card p-6 shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold mb-1">Keyboard shortcuts</p>
        <p className="text-xs text-muted-foreground mb-4">Press <kbd className="px-1.5 py-0.5 rounded bg-secondary text-xs font-mono">?</kbd> to toggle this panel</p>
        <div className="space-y-2 max-h-80 overflow-y-auto no-scrollbar">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between text-sm gap-3">
              <span className="text-muted-foreground">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded-md bg-secondary text-xs font-mono shrink-0 whitespace-nowrap">{s.keys}</kbd>
            </div>
          ))}
        </div>
        <Button variant="warning" className="w-full mt-5" onClick={onClose}>Got it</Button>
      </div>
    </div>
  );
}

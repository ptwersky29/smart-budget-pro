import React from "react";

const SHORTCUTS = [
  { keys: "g then d", desc: "Go to Dashboard" },
  { keys: "g then t", desc: "Go to Transactions" },
  { keys: "g then b", desc: "Go to Budgets" },
  { keys: "g then s", desc: "Go to Subscriptions" },
  { keys: "g then r", desc: "Go to Reports" },
  { keys: "g then g", desc: "Go to Settings" },
  { keys: "?", desc: "Toggle this help" },
  { keys: "Escape", desc: "Close modals" },
];

export default function KeyboardShortcutsHelp({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative rounded-2xl border border-border bg-card p-6 shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold mb-4">Keyboard shortcuts</p>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded-md bg-secondary text-xs font-mono">{s.keys}</kbd>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="mt-5 w-full btn-pill gradient-topaz text-white text-sm">Got it</button>
      </div>
    </div>
  );
}

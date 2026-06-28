"use client";

/**
 * KeyboardShortcuts — a modal overlay showing all available keyboard shortcuts.
 * Triggered by pressing ? or clicking the "shortcuts" link in the footer.
 */

import { useEffect } from "react";
import { Keyboard, X } from "lucide-react";

interface KeyboardShortcutsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS = [
  { keys: ["⌘", "K"], description: "Open command palette (quick navigation + templates)", context: "Global" },
  { keys: ["?"], description: "Toggle this shortcuts overlay", context: "Global" },
  { keys: ["S"], description: "Open / close Settings panel", context: "Global" },
  { keys: ["⌘", "↵"], description: "Submit prompt (when composer focused)", context: "Composer" },
  { keys: ["Esc"], description: "Close any open drawer / modal", context: "Global" },
  { keys: ["Tab"], description: "Navigate between interactive elements", context: "Global" },
];

export function KeyboardShortcuts({ open, onOpenChange }: KeyboardShortcutsProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  const grouped = SHORTCUTS.reduce((acc, s) => {
    if (!acc[s.context]) acc[s.context] = [];
    acc[s.context].push(s);
    return acc;
  }, {} as Record<string, typeof SHORTCUTS>);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] bg-black/80 backdrop-blur-sm fade-in"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="terminal-card w-full max-w-md p-0 border-gray-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-ritual-green" aria-hidden="true" />
            <h2 className="font-display text-sm tracking-wider text-gray-100 uppercase">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            aria-label="Close shortcuts"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="px-5 py-4 space-y-4">
          {Object.entries(grouped).map(([context, items]) => (
            <div key={context}>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ritual-green mb-2">
                {context}
              </div>
              <div className="space-y-1.5">
                {items.map((s) => (
                  <div key={s.description} className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[11px] text-gray-400">{s.description}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {s.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="px-1.5 py-0.5 rounded border border-gray-700 bg-ritual-surface font-mono text-[10px] text-gray-300 min-w-[24px] text-center"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800 bg-ritual-elevated/30">
          <p className="font-mono text-[10px] text-gray-500 text-center">
            Press <kbd className="px-1 py-0.5 rounded border border-gray-700 text-gray-400">Esc</kbd> or click outside to close
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * CommandPalette — a Cmd+K / Ctrl+K command palette for quick navigation and actions.
 *
 * Features:
 *   - Fuzzy search across commands
 *   - Keyboard navigation (arrow keys + enter)
 *   - Categorized commands: navigation, actions, settings
 *   - Executes real actions (open settings, fill prompt templates, etc.)
 *
 * Triggered by Cmd+K (Mac) or Ctrl+K (Linux/Windows).
 */

import { useEffect, useState, useMemo, useRef } from "react";
import { Search, ArrowRight, CornerDownLeft, ArrowUp, ArrowDown, X } from "lucide-react";

interface Command {
  id: string;
  label: string;
  category: "Navigation" | "Actions" | "Templates" | "Settings";
  hint?: string;
  shortcut?: string;
  action: () => void;
  icon?: React.ReactNode;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onFillPrompt: (prompt: string, mode: "llm" | "image") => void;
}

const PROMPT_TEMPLATES = [
  { label: "Explain a concept", prompt: "Explain how zero-knowledge proofs work, using a simple analogy a 12-year-old would understand.", mode: "llm" as const },
  { label: "Solidity audit", prompt: "Review this Solidity function for security vulnerabilities and gas optimization:\n\nfunction withdraw(uint256 amount) external {\n    require(balances[msg.sender] >= amount);\n    (bool ok,) = msg.sender.call{value: amount}(\"\");\n    require(ok);\n    balances[msg.sender] -= amount;\n}", mode: "llm" as const },
  { label: "Compare approaches", prompt: "Compare ECIES encryption vs. FHE for on-chain private AI inference. List trade-offs in a table.", mode: "llm" as const },
  { label: "Generate abstract art", prompt: "A surreal landscape where blockchain blocks float like islands in a neon-green sky, with glowing data streams connecting them. Cyberpunk aesthetic, high detail.", mode: "image" as const },
];

export function CommandPalette({
  open,
  onOpenChange,
  onOpenSettings,
  onOpenShortcuts,
  onFillPrompt,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: Command[] = useMemo(() => {
    const close = () => onOpenChange(false);
    return [
      // Navigation
      { id: "nav-shortcuts", label: "View keyboard shortcuts", category: "Navigation", shortcut: "?", action: () => { onOpenShortcuts(); close(); }, icon: <ArrowRight className="w-3.5 h-3.5" /> },
      // Actions
      { id: "act-settings", label: "Open Settings", category: "Actions", shortcut: "S", action: () => { onOpenSettings(); close(); }, icon: <ArrowRight className="w-3.5 h-3.5" /> },
      { id: "act-scroll-top", label: "Scroll to top", category: "Actions", action: () => { window.scrollTo({ top: 0, behavior: "smooth" }); close(); }, icon: <ArrowRight className="w-3.5 h-3.5" /> },
      { id: "act-scroll-composer", label: "Focus the prompt composer", category: "Actions", action: () => { const el = document.querySelector('[aria-label="Composer"]') as HTMLElement; el?.scrollIntoView({ behavior: "smooth", block: "center" }); el?.focus?.(); close(); }, icon: <ArrowRight className="w-3.5 h-3.5" /> },
      // Templates
      ...PROMPT_TEMPLATES.map((t, i) => ({
        id: `tpl-${i}`,
        label: `Template: ${t.label}`,
        category: "Templates" as const,
        hint: t.mode === "llm" ? "0x0802" : "0x0818",
        action: () => { onFillPrompt(t.prompt, t.mode); close(); },
        icon: <ArrowRight className="w-3.5 h-3.5" />,
      })),
      // Settings
      { id: "set-provider", label: "Switch LLM provider (Ritual → ChatGPT)", category: "Settings", action: () => { onOpenSettings(); close(); }, icon: <ArrowRight className="w-3.5 h-3.5" /> },
    ];
  }, [onOpenChange, onOpenShortcuts, onOpenSettings, onFillPrompt]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
  }, [query, commands]);

  const grouped = useMemo(() => {
    const g: Record<string, Command[]> = {};
    filtered.forEach((c) => {
      if (!g[c.category]) g[c.category] = [];
      g[c.category].push(c);
    });
    return g;
  }, [filtered]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        filtered[selectedIndex]?.action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selectedIndex, onOpenChange]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  let flatIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh] bg-black/80 backdrop-blur-sm fade-in"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="terminal-card w-full max-w-xl p-0 border-gray-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <Search className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent border-0 outline-none font-mono text-sm text-gray-200 placeholder:text-gray-600"
            aria-label="Search commands"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            aria-label="Close command palette"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto scrollbar-thin py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="font-mono text-[11px] text-gray-500">No commands match &quot;{query}&quot;</p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="mb-1">
                <div className="px-4 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-gray-600">
                  {category}
                </div>
                {items.map((cmd) => {
                  flatIdx++;
                  const isSelected = flatIdx === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      data-idx={flatIdx}
                      type="button"
                      onClick={cmd.action}
                      onMouseEnter={() => setSelectedIndex(flatIdx)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                        isSelected
                          ? "bg-ritual-green/10 border-l-2 border-ritual-green"
                          : "border-l-2 border-transparent"
                      }`}
                    >
                      <span className={isSelected ? "text-ritual-green" : "text-gray-500"} aria-hidden="true">
                        {cmd.icon}
                      </span>
                      <span className={`flex-1 min-w-0 font-mono text-[12px] truncate ${isSelected ? "text-gray-100" : "text-gray-400"}`}>
                        {cmd.label}
                      </span>
                      {cmd.hint && (
                        <span className="font-mono text-[9px] uppercase text-gray-600 px-1.5 py-0.5 rounded border border-gray-700">
                          {cmd.hint}
                        </span>
                      )}
                      {cmd.shortcut && (
                        <kbd className="px-1.5 py-0.5 rounded border border-gray-700 font-mono text-[9px] text-gray-500">
                          {cmd.shortcut}
                        </kbd>
                      )}
                      {isSelected && (
                        <CornerDownLeft className="w-3 h-3 text-ritual-green flex-shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-800 bg-ritual-elevated/30 flex items-center justify-between text-[9px] font-mono text-gray-600">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <ArrowUp className="w-2.5 h-2.5" />
              <ArrowDown className="w-2.5 h-2.5" />
              navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="w-2.5 h-2.5" />
              select
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-gray-700">esc</kbd>
              close
            </span>
          </div>
          <span>{filtered.length} commands</span>
        </div>
      </div>
    </div>
  );
}

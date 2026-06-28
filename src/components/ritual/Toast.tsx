"use client";

/**
 * Toast system — real-time feedback notifications for user actions.
 *
 * Shows non-intrusive toasts for: wallet events, transaction submissions,
 * confirmations, errors, and privacy state changes. Uses a Zustand store
 * so any component can dispatch a toast.
 *
 * Positions: bottom-right on desktop, bottom-center on mobile.
 * Auto-dismiss after configurable duration (default 5s).
 * Manual dismiss via close button.
 */

import { create } from "zustand";
import { useEffect } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X, Loader2 } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info" | "loading";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = persistent
  txHash?: string;
  dedupeKey?: string; // if set, replaces existing toast with same key
}

interface ToastStore {
  toasts: Toast[];
  add: (toast: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
  update: (id: string, partial: Partial<Toast>) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => {
      // Dedupe: if dedupeKey is set, replace existing toast with same key
      if (toast.dedupeKey) {
        const existing = s.toasts.find((t) => t.dedupeKey === toast.dedupeKey);
        if (existing) {
          return {
            toasts: s.toasts.map((t) =>
              t.dedupeKey === toast.dedupeKey ? { ...toast, id: existing.id } : t
            ),
          };
        }
      }
      return { toasts: [...s.toasts, { ...toast, id }] };
    });
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  update: (id, partial) =>
    set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...partial } : t)) })),
}));

// Convenience helpers (can be imported anywhere)
// Supports optional dedupeKey as third argument to prevent duplicate toasts.
export const toast = {
  success: (title: string, message?: string, dedupeKey?: string) =>
    useToastStore.getState().add({ type: "success", title, message, duration: 5000, dedupeKey }),
  error: (title: string, message?: string, dedupeKey?: string) =>
    useToastStore.getState().add({ type: "error", title, message, duration: 7000, dedupeKey }),
  warning: (title: string, message?: string, dedupeKey?: string) =>
    useToastStore.getState().add({ type: "warning", title, message, duration: 6000, dedupeKey }),
  info: (title: string, message?: string, dedupeKey?: string) =>
    useToastStore.getState().add({ type: "info", title, message, duration: 5000, dedupeKey }),
  loading: (title: string, message?: string, dedupeKey?: string) =>
    useToastStore.getState().add({ type: "loading", title, message, duration: 0, dedupeKey }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
  update: (id: string, partial: Partial<Toast>) => useToastStore.getState().update(id, partial),
};

const TYPE_META: Record<ToastType, { icon: React.ReactNode; color: string; border: string; bg: string }> = {
  success: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: "text-ritual-green",
    border: "border-ritual-green/40",
    bg: "bg-ritual-green/5",
  },
  error: {
    icon: <XCircle className="w-4 h-4" />,
    color: "text-ritual-red",
    border: "border-ritual-red/40",
    bg: "bg-ritual-red/5",
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    color: "text-ritual-gold",
    border: "border-ritual-gold/40",
    bg: "bg-ritual-gold/5",
  },
  info: {
    icon: <Info className="w-4 h-4" />,
    color: "text-gray-300",
    border: "border-gray-600",
    bg: "bg-gray-800/30",
  },
  loading: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    color: "text-ritual-green",
    border: "border-ritual-green/40",
    bg: "bg-ritual-green/5",
  },
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-auto pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const meta = TYPE_META[toast.type];

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(onDismiss, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, onDismiss]);

  return (
    <div
      className={`terminal-card-elevated pointer-events-auto p-3 border ${meta.border} ${meta.bg} fade-in flex items-start gap-3 shadow-2xl`}
      role={toast.type === "error" ? "alert" : "status"}
      aria-label={toast.title}
    >
      <span className={`${meta.color} flex-shrink-0 mt-0.5`} aria-hidden="true">
        {meta.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className={`font-mono text-[11px] uppercase tracking-wider font-semibold ${meta.color}`}>
          {toast.title}
        </div>
        {toast.message && (
          <div className="font-mono text-[10px] text-gray-400 mt-0.5 break-words">
            {toast.message}
          </div>
        )}
        {toast.txHash && (
          <div className="font-mono text-[9px] text-gray-600 mt-1 truncate">
            tx: {toast.txHash.slice(0, 10)}…{toast.txHash.slice(-4)}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

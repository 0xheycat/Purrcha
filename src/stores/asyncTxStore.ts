/**
 * Zustand store for Purrcha async transactions. Persisted to localStorage so in-flight
 * jobs survive page refresh. Follows the pattern from ritual-dapp-frontend/SKILL.md.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AsyncTxState, AsyncTxStatus, TrackedTransaction, PrecompileKind } from "@/types/asyncTx";
import { isTerminal, canTransition } from "@/types/asyncTx";

interface AsyncTxStore {
  transactions: Record<string, TrackedTransaction>;
  addTransaction: (id: string, kind: PrecompileKind, label?: string, promptPreview?: string) => void;
  updateState: (id: string, partial: Partial<AsyncTxState>) => void;
  setStatus: (id: string, status: AsyncTxStatus) => void;
  getTransaction: (id: string) => TrackedTransaction | undefined;
  getActiveTransactions: () => TrackedTransaction[];
  getRecentTransactions: (limit?: number) => TrackedTransaction[];
  clearSettled: () => void;
  clearAll: () => void;
}

export const useAsyncTxStore = create<AsyncTxStore>()(
  persist(
    (set, get) => ({
      transactions: {},
      addTransaction: (id, kind, label, promptPreview) =>
        set((s) => ({
          transactions: {
            ...s.transactions,
            [id]: {
              id,
              kind,
              state: { status: "idle" },
              createdAt: Date.now(),
              updatedAt: Date.now(),
              label,
              promptPreview,
            },
          },
        })),
      updateState: (id, partial) =>
        set((s) => {
          const existing = s.transactions[id];
          if (!existing) return s;
          const newState: AsyncTxState = { ...existing.state, ...partial };
          // Enforce transition validity for the status field.
          if (partial.status && partial.status !== existing.state.status) {
            if (!canTransition(existing.state.status, partial.status)) {
              // Allow forced terminal transitions (failed/timeout) from any state for safety.
              if (!isTerminal(partial.status) && !isTerminal(existing.state.status)) {
                return s;
              }
            }
          }
          return {
            transactions: {
              ...s.transactions,
              [id]: { ...existing, state: newState, updatedAt: Date.now() },
            },
          };
        }),
      setStatus: (id, status) =>
        set((s) => {
          const existing = s.transactions[id];
          if (!existing) return s;
          return {
            transactions: {
              ...s.transactions,
              [id]: { ...existing, state: { ...existing.state, status }, updatedAt: Date.now() },
            },
          };
        }),
      getTransaction: (id) => get().transactions[id],
      getActiveTransactions: () =>
        Object.values(get().transactions)
          .filter((tx) => !isTerminal(tx.state.status))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      getRecentTransactions: (limit = 50) =>
        Object.values(get().transactions)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, limit),
      clearSettled: () =>
        set((s) => ({
          transactions: Object.fromEntries(
            Object.entries(s.transactions).filter(([, tx]) => !isTerminal(tx.state.status)),
          ),
        })),
      clearAll: () => set({ transactions: {} }),
    }),
    { name: "purrcha.async-tx" },
  ),
);

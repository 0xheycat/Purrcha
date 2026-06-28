/**
 * Shared balance store — single source of truth for RitualWallet balance state.
 *
 * Avoids duplicate wagmi reads when multiple hooks need balance data.
 * useBalanceManager populates this store; other hooks consume it.
 */

import { create } from "zustand";

export type BalanceHealth = "healthy" | "low" | "critical" | "unknown";

export interface BalanceState {
  nativeBalance: string | null;
  escrowBalance: string | null;
  lockUntilBlock: bigint | null;
  currentBlock: bigint | null;
  health: BalanceHealth;
  needsRefill: boolean;
  canRefill: boolean;
  refillAmount: string;
  lastRefill: number | null;
  totalRefills: number;
  error: string | null;
}

interface BalanceStore extends BalanceState {
  setBalance: (partial: Partial<BalanceState>) => void;
  reset: () => void;
}

const initialState: BalanceState = {
  nativeBalance: null,
  escrowBalance: null,
  lockUntilBlock: null,
  currentBlock: null,
  health: "unknown",
  needsRefill: false,
  canRefill: false,
  refillAmount: "0.5",
  lastRefill: null,
  totalRefills: 0,
  error: null,
};

export const useBalanceStore = create<BalanceStore>((set) => ({
  ...initialState,
  setBalance: (partial) => set((s) => ({ ...s, ...partial })),
  reset: () => set(initialState),
}));

/** Get the current balance state without subscribing to updates (for one-off reads). */
export function getBalanceState(): BalanceState {
  return useBalanceStore.getState();
}

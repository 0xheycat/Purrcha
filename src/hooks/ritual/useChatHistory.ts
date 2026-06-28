"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useEncryption } from "./useEncryption";

/**
 * useChatHistory — fetches + decrypts the on-chain conversation history for the connected
 * wallet.
 *
 * Flow:
 *   1. GET /api/history?address=0x... (the backend indexes real ChatResultSettled +
 *      ImageResultDelivered logs from PurrchaChat; returns ECIES ciphertext only).
 *   2. For each message, decrypt encryptedPromptCiphertext + encryptedResponseCiphertext
 *      with the wallet-derived ECIES private key (from useEncryption).
 *   3. Messages that fail decryption (wrong wallet / locked) are surfaced as
 *      `{ encrypted: true }` — the UI shows "encrypted — unlock to read". Honest, no fake
 *      fallback. Never invents content.
 *
 * Polls every 15s for new messages. Re-fetches on wallet change + on ECIES unlock.
 */

export interface DecodedMessage {
  requestId: Hex;
  kind: "llm" | "image";
  txHash?: Hex;
  blockNumber: string;
  hasError: boolean;
  errorMessage?: string;
  encryptedPromptCiphertext: Hex;
  encryptedResponseCiphertext: Hex;
  outputUri?: string;
  outputContentHash?: Hex;
  precompileId?: number;
  executor?: Address;
  settledBlock?: string | null;
  verified?: boolean;

  // Client-side decrypted fields (null = locked / decryption failed)
  promptText: string | null;
  responseText: string | null;
  isEncrypted: boolean;
}

interface HistoryApiResponse {
  address: string;
  contractAddress?: string;
  count: number;
  messages: Array<{
    requestId: Hex;
    kind: "llm" | "image";
    txHash?: Hex;
    blockNumber: string;
    hasError: boolean;
    errorMessage?: string;
    encryptedPromptCiphertext: Hex;
    encryptedResponseCiphertext: Hex;
    outputUri?: string;
    outputContentHash?: Hex;
    precompileId?: number;
    executor?: Address;
    settledBlock?: string | null;
    verified?: boolean;
  }>;
}

export interface UseChatHistoryResult {
  messages: DecodedMessage[];
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  refetch: () => void;
}

export function useChatHistory(address?: Address): UseChatHistoryResult {
  const { decrypt, isUnlocked } = useEncryption();
  const enabled = Boolean(address);

  const { data, isLoading, isFetching, error, refetch } = useQuery<HistoryApiResponse>({
    queryKey: ["purrcha", "history", address?.toLowerCase()],
    queryFn: async () => {
      const res = await fetch(`/api/history?address=${address}&limit=100`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as Partial<HistoryApiResponse> & {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(body?.message ?? body?.error ?? `History fetch failed (${res.status})`);
      }
      return body as HistoryApiResponse;
    },
    enabled,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Decrypt each message client-side. Re-runs whenever the ECIES key changes (unlock/lock).
  // Explicitly depend on isUnlocked so the memo recomputes when the user unlocks.
  const messages = React.useMemo<DecodedMessage[]>(() => {
    if (!data?.messages) return [];
    return data.messages.map((m) => {
      const promptText = isUnlocked ? decrypt(m.encryptedPromptCiphertext) : null;
      const responseText = m.hasError
        ? m.errorMessage ?? "(executor error)"
        : (isUnlocked ? decrypt(m.encryptedResponseCiphertext) : null);
      const isEncrypted = promptText === null;
      return {
        ...m,
        promptText,
        responseText,
        isEncrypted,
      };
    });
  }, [data, decrypt, isUnlocked]);

  // If the wallet just unlocked, force a refetch isn't needed — decryption runs locally.
  // But we depend on `isUnlocked` so the memo recomputes when the key becomes available.
  React.useEffect(() => {
    void isUnlocked;
  }, [isUnlocked]);

  return {
    messages,
    isLoading: enabled && isLoading,
    isFetching,
    error: error ? (error as Error).message : null,
    refetch: () => refetch(),
  };
}

"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

/**
 * useChainStatus — polls /api/chain for the current Ritual Chain block + the deployer's
 * RitualWallet balance. Used by the StatusBar + PrecompileStatusBar.
 *
 * Note: the wallet-derived reads (balance, lock) happen via usePurrchaWallet on the client
 * (wagmi's public client). This hook reads the same data via the server route so it works
 * even before the wallet connects, and so the PrecompileStatusBar can show the chain head
 * regardless of wallet state.
 */

export interface ChainStatus {
  chainId: number;
  blockNumber: string;
  blockTimestamp: number;
  ritualWallet?: {
    address?: string;
    balance?: string;
    lockUntilBlock?: string;
    isLocked?: boolean;
    error?: string;
  };
  contractDeployed: boolean;
  contractAddress: string | null;
  latencyMs?: number;
  error?: string;
}

interface ChainApiResponse {
  chainId?: number;
  blockNumber?: string;
  blockTimestamp?: number;
  ritualWallet?: {
    address?: string;
    balance?: string;
    lockUntilBlock?: string;
    isLocked?: boolean;
    error?: string;
  };
  contractDeployed?: boolean;
  contractAddress?: string | null;
  error?: string;
  message?: string;
}

export interface UseChainStatusResult {
  data: ChainStatus | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useChainStatus(address?: string): UseChainStatusResult {
  const { data, isLoading, error, refetch } = useQuery<ChainStatus>({
    queryKey: ["purrcha", "chain", address?.toLowerCase()],
    queryFn: async () => {
      const url = address ? `/api/chain?address=${address}` : "/api/chain";
      const started = Date.now();
      const res = await fetch(url, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as ChainApiResponse;
      if (!res.ok) {
        throw new Error(body?.message ?? body?.error ?? `Chain query failed (${res.status})`);
      }
      return {
        chainId: body.chainId ?? 0,
        blockNumber: body.blockNumber ?? "0",
        blockTimestamp: body.blockTimestamp ?? 0,
        ritualWallet: body.ritualWallet,
        contractDeployed: body.contractDeployed ?? false,
        contractAddress: body.contractAddress ?? null,
        latencyMs: Date.now() - started,
      } as ChainStatus;
    },
    refetchInterval: 12_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    data: data ?? null,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch: () => refetch(),
  };
}

/**
 * useCopyToClipboard — tiny hook for the "copy" buttons on hex values.
 * Returns { copied, copy } where `copied` resets after 1.5s.
 */
export function useCopyToClipboard(): {
  copied: boolean;
  copy: (text: string) => void;
} {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = React.useCallback((text: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), 1_500);
      },
      () => {
        /* ignore — clipboard may be blocked */
      },
    );
  }, []);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { copied, copy };
}

/** Truncate a hex string (address / tx hash) to 0x1234…5678 form. */
export function truncateHex(hex: string, head = 6, tail = 4): string {
  if (!hex) return "";
  if (hex.length <= head + tail + 2) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

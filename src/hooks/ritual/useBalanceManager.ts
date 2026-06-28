"use client";

/**
 * useBalanceManager — professional RitualWallet balance management.
 *
 * Writes to the shared useBalanceStore so other hooks (useAutoRefill, useAlwaysOnAgent)
 * can consume the state without duplicate wagmi reads.
 *
 * Strategy:
 *   1. Monitor native RITUAL + RitualWallet escrow balance every 30s.
 *   2. If escrow < 0.2 R → needsRefill = true
 *   3. If native > 0.55 R → canRefill = true
 *   4. Health: healthy / low / critical based on both balances
 */

import { useEffect, useRef } from "react";
import { useAccount, useReadContract, useBalance } from "wagmi";
import { formatEther } from "viem";
import { WALLET_ADDRESS } from "@/lib/ritual/abi";
import { RITUAL_WALLET_ABI } from "@/lib/ritual/abi";
import { useBalanceStore, type BalanceHealth } from "@/stores/balanceStore";
import { toast } from "@/components/ritual/Toast";

const THRESHOLD_MIN_ESCROW = 0.2;
const NATIVE_WARN_THRESHOLD = 0.5;
const NATIVE_CRITICAL_THRESHOLD = 0.2;
const REFILL_BUFFER = 0.05;

export function useBalanceManager() {
  const { address } = useAccount();
  const setBalance = useBalanceStore((s) => s.setBalance);
  const reset = useBalanceStore((s) => s.reset);
  const prevHealth = useRef<BalanceHealth>("unknown");

  const { data: escrowData, refetch: refetchEscrow } = useReadContract({
    address: WALLET_ADDRESS as `0x${string}`,
    abi: RITUAL_WALLET_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  const { data: lockData, refetch: refetchLock } = useReadContract({
    address: WALLET_ADDRESS as `0x${string}`,
    abi: RITUAL_WALLET_ABI,
    functionName: "lockUntil",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  const { data: nativeData, refetch: refetchNative } = useBalance({
    address,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  useEffect(() => {
    if (!address) {
      reset();
      return;
    }

    const native = nativeData ? formatEther(nativeData.value) : null;
    const escrow = escrowData ? formatEther(escrowData) : null;
    const lock = lockData ?? null;

    if (!native || !escrow) return;

    const nativeNum = parseFloat(native);
    const escrowNum = parseFloat(escrow);
    const refillNum = 0.5;

    const needsRefill = escrowNum < THRESHOLD_MIN_ESCROW;
    const canRefill = nativeNum > refillNum + REFILL_BUFFER;

    let health: BalanceHealth = "healthy";
    if (nativeNum < NATIVE_CRITICAL_THRESHOLD) health = "critical";
    else if (needsRefill && !canRefill) health = "critical";
    else if (needsRefill || nativeNum < NATIVE_WARN_THRESHOLD) health = "low";

    // Health transition toasts
    if (health !== prevHealth.current) {
      if (health === "critical" && prevHealth.current !== "unknown") {
        toast.error("Balance critical", `Native: ${nativeNum.toFixed(3)} R · Escrow: ${escrowNum.toFixed(3)} R`);
      } else if (health === "low" && prevHealth.current === "healthy") {
        toast.warning("Balance low", `Escrow: ${escrowNum.toFixed(3)} R — auto-refill recommended.`);
      } else if (health === "healthy" && (prevHealth.current === "low" || prevHealth.current === "critical")) {
        toast.success("Balance healthy", "Sufficient funds for operations.");
      }
      prevHealth.current = health;
    }

    setBalance({
      nativeBalance: native,
      escrowBalance: escrow,
      lockUntilBlock: lock,
      health,
      needsRefill,
      canRefill,
      error: null,
    });
  }, [address, nativeData, escrowData, lockData, setBalance, reset]);

  return {
    refetch: () => {
      refetchEscrow();
      refetchLock();
      refetchNative();
    },
  };
}

"use client";

/**
 * useAutoRefill — automatically deposits RITUAL into RitualWallet when the escrow
 * balance drops below the threshold.
 *
 * Professional strategy:
 *   1. Watches useBalanceManager for needsRefill=true && canRefill=true
 *   2. When triggered, calls RitualWallet.deposit(REFILL_AMOUNT, 100000 blocks)
 *   3. Only refills once per threshold crossing (won't spam deposits)
 *   4. Shows toast notifications for all deposit states
 *   5. Pauses if a tx is already pending (sender lock)
 *
 * The deposit is a simple value transfer — no precompile involved, so useSendTransaction
 * works directly (no eth_call simulation issue).
 */

import { useEffect, useRef, useCallback } from "react";
import { useSendTransaction, useChainId } from "wagmi";
import { encodeFunctionData, parseEther } from "viem";
import { WALLET_ADDRESS, RITUAL_WALLET_ABI } from "@/lib/ritual/abi";
import { RITUAL_CHAIN } from "@/lib/ritual/constants";
import { useBalanceStore } from "@/stores/balanceStore";
import { toast } from "@/components/ritual/Toast";

const REFILL_AMOUNT = "0.5"; // RITUAL
const LOCK_BLOCKS = 100_000n; // ~9.7 hours
const MIN_REFILL_INTERVAL_MS = 60_000; // Don't refill more than once per minute

export function useAutoRefill() {
  const balance = useBalanceStore();
  const { sendTransactionAsync } = useSendTransaction();
  const activeChainId = useChainId();
  const lastRefillTime = useRef(0);
  const isRefilling = useRef(false);

  const doRefill = useCallback(async () => {
    if (isRefilling.current) return;
    if (Date.now() - lastRefillTime.current < MIN_REFILL_INTERVAL_MS) return;
    if (!balance.needsRefill || !balance.canRefill) return;
    if (activeChainId !== RITUAL_CHAIN.id) return;

    isRefilling.current = true;
    lastRefillTime.current = Date.now();

    toast.info("Auto-refilling RitualWallet", `Depositing ${REFILL_AMOUNT} RITUAL (lock 100K blocks)…`);

    try {
      const data = encodeFunctionData({
        abi: RITUAL_WALLET_ABI,
        functionName: "deposit",
        args: [LOCK_BLOCKS],
      });

      const hash = await sendTransactionAsync({
        to: WALLET_ADDRESS as `0x${string}`,
        data,
        value: parseEther(REFILL_AMOUNT),
        gas: 200_000n,
        type: "legacy",
        gasPrice: 1_000_000_000n, // Force legacy tx (Ritual doesn't support EIP-1559 type 2)
      } as never);

      toast.success("RitualWallet refilled", `Deposited ${REFILL_AMOUNT} RITUAL. TX: ${hash.slice(0, 10)}…`);

      // Balance will auto-refresh via useBalanceManager's 30s polling interval
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("denied")) {
        toast.warning("Refill rejected", "Auto-refill was rejected in wallet. Will retry in 60s.");
      } else {
        toast.error("Refill failed", msg);
      }
    } finally {
      isRefilling.current = false;
    }
  }, [balance.needsRefill, balance.canRefill, activeChainId, sendTransactionAsync, balance]);

  // Auto-trigger when conditions are met
  useEffect(() => {
    if (!balance.needsRefill || !balance.canRefill) return;
    if (balance.health === "critical") return; // Don't auto-refill in critical state

    const timer = setTimeout(() => {
      void doRefill();
    }, 2000); // Small delay to batch rapid changes

    return () => clearTimeout(timer);
  }, [balance.needsRefill, balance.canRefill, balance.health, doRefill]);

  return {
    isRefilling: isRefilling.current,
    doRefill,
    canRefill: balance.canRefill,
    needsRefill: balance.needsRefill,
  };
}

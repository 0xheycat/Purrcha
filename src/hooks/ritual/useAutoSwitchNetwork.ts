"use client";

/**
 * useAutoSwitchNetwork — automatically switches the wallet to Ritual Chain (ID 1979)
 * when the user is connected but on the wrong network.
 *
 * Uses wagmi's useSwitchChain hook (NOT window.ethereum directly) so it works with
 * any connector (MetaMask, Rabby, WalletConnect, etc.) via the active connector's
 * provider.
 *
 * Behavior:
 *   - When isWrongChain becomes true, auto-calls switchChain with the Ritual chain config.
 *   - wagmi's switchChain internally calls wallet_switchEthereumChain (or wallet_addEthereumChain
 *     if the chain isn't added yet — it handles error 4902 automatically).
 *   - Shows toast notifications for all states.
 *   - Retries every 5s if the switch fails or is rejected (until the user is on Ritual).
 *   - The WalletButton "Switch to Ritual" button also uses the same switchChain.
 */

import { useEffect, useRef } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { RITUAL_CHAIN } from "@/lib/ritual/constants";
import { toast } from "@/components/ritual/Toast";

export function useAutoSwitchNetwork() {
  const { isConnected } = useAccount();
  const activeChainId = useChainId();
  const isWrongChain = isConnected && activeChainId !== RITUAL_CHAIN.id;
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const hasShownInfoToast = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isWrongChain) {
      hasShownInfoToast.current = false;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      return;
    }

    // Show info toast once
    if (!hasShownInfoToast.current) {
      hasShownInfoToast.current = true;
      toast.info("Wrong network", "Auto-switching to Ritual Chain (1979)…");
    }

    const doSwitch = async () => {
      try {
        await switchChainAsync({
          chainId: RITUAL_CHAIN.id,
        });
        toast.success("Network switched", "Now on Ritual Chain (1979).");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // User rejected — retry after 5s (they might have clicked "wrong network" by accident)
        if (msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("denied")) {
          toast.warning("Switch rejected", "Click 'Switch to Ritual' to manually switch.");
          hasShownInfoToast.current = false; // allow info toast on retry
        } else {
          toast.error("Switch failed", msg);
        }
        // Schedule a retry in 5s
        retryTimer.current = setTimeout(() => void doSwitch(), 5000);
      }
    };

    // Small delay to let the connection settle before switching
    const initialTimer = setTimeout(() => void doSwitch(), 300);

    return () => {
      clearTimeout(initialTimer);
    };
  }, [isWrongChain, switchChainAsync]);

  return { isSwitching, isWrongChain };
}

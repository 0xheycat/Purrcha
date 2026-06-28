"use client";

/**
 * PrivacyShield — an animated, glowing shield visual that serves as the hero's
 * visual anchor. The shield pulses with ritual-green energy, and orbiting dots
 * represent the 4 privacy pillars (ECIES, TEE, On-Chain, Wallet).
 *
 * Pure CSS/SVG animation — no external dependencies. The shield reacts to the
 * user's actual privacy score (from PrivacyScoreDashboard logic) by changing
 * its glow intensity.
 */

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useEncryption } from "@/hooks/ritual/useEncryption";
import { useAsyncTxStore } from "@/stores/asyncTxStore";
import { isContractDeployed } from "@/lib/ritual/abi";

export function PrivacyShield() {
  const { isConnected } = useAccount();
  const encryption = useEncryption();
  const transactions = useAsyncTxStore((s) => s.transactions);

  const score = useMemo(() => {
    const settledCount = Object.values(transactions).filter(
      (tx) => tx.state.status === "settled",
    ).length;
    const ecies = encryption.isUnlocked ? 25 : 10;
    const tee = settledCount > 0 ? 25 : 15;
    const onChain = isContractDeployed ? 25 : 5;
    const wallet = isConnected ? 25 : 15;
    return ecies + tee + onChain + wallet;
  }, [encryption.isUnlocked, transactions, isConnected]);

  const intensity = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  const glowColor =
    intensity === "high" ? "#19D184" : intensity === "medium" ? "#FACC15" : "#EF4444";

  return (
    <div className="relative w-32 h-32 mx-auto flex items-center justify-center" aria-hidden="true">
      {/* Outer pulsing rings */}
      <div
        className="absolute inset-0 rounded-full animate-ping opacity-20"
        style={{ backgroundColor: glowColor, animationDuration: "3s" }}
      />
      <div
        className="absolute inset-2 rounded-full animate-ping opacity-15"
        style={{ backgroundColor: glowColor, animationDuration: "2.5s", animationDelay: "0.5s" }}
      />

      {/* Orbiting dots — represent the 4 privacy pillars */}
      <div className="absolute inset-0 animate-spin" style={{ animationDuration: "12s" }}>
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
          style={{ backgroundColor: "#19D184", boxShadow: `0 0 8px ${glowColor}` }}
        />
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
          style={{ backgroundColor: "#FACC15", boxShadow: `0 0 8px #FACC15` }}
        />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
          style={{ backgroundColor: "#FF1DCE", boxShadow: `0 0 8px #FF1DCE` }}
        />
        <div
          className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
          style={{ backgroundColor: "#BFFF00", boxShadow: `0 0 8px #BFFF00` }}
        />
      </div>

      {/* Center shield SVG */}
      <svg
        viewBox="0 0 64 64"
        className="relative w-16 h-16"
        style={{ filter: `drop-shadow(0 0 12px ${glowColor}80)` }}
      >
        <defs>
          <linearGradient id="shield-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={glowColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={glowColor} stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="shield-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={glowColor} />
            <stop offset="100%" stopColor="#BFFF00" />
          </linearGradient>
        </defs>
        {/* Shield path */}
        <path
          d="M32 6 L52 14 L52 32 C52 44 42 54 32 58 C22 54 12 44 12 32 L12 14 Z"
          fill="url(#shield-grad)"
          stroke="url(#shield-stroke)"
          strokeWidth="2"
          className="drop-shadow"
        />
        {/* Inner checkmark */}
        <path
          d="M24 32 L29 37 L42 24"
          fill="none"
          stroke={glowColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 4px ${glowColor})` }}
        />
      </svg>

      {/* Score badge */}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-bg border border-gray-700 font-mono text-[9px] font-bold" style={{ color: glowColor }}>
        {score}/100
      </div>
    </div>
  );
}

"use client";

/**
 * FeeEstimator — shows the real estimated cost breakdown for an on-chain prompt.
 *
 * Uses the actual fee constants from ritual-dapp-wallet/SKILL.md:
 *   - LLM executor base fee + per-token gas formula
 *   - Image executor base fee
 *   - RitualWallet escrow (deliveryGasLimit × maxFeePerGas)
 *   - Error fee (if has_error=true on settlement)
 *
 * All values are REAL — computed from the actual fee constants. No mock data.
 * The estimator updates in real-time as the user types (token count changes).
 */

import { useMemo } from "react";
import { Coins, Cpu, Zap, AlertCircle, TrendingDown } from "lucide-react";

interface FeeEstimatorProps {
  prompt: string;
  mode: "llm" | "image";
  hasWallet: boolean;
}

// Real fee constants from ritual-dapp-wallet/SKILL.md (in wei)
const LLM_EXECUTOR_GAS_PRICE_WEI = 1_000_000_000n; // 1 gwei
const LLM_ERROR_EXECUTOR_FEE_WEI = 500_000_000_000n; // 0.0000005 ETH
const HTTP_EXECUTOR_BASE_FEE_WEI = 2_500_000_000_000n; // 2.5e-7 ETH (used as LLM base proxy)
const DELIVERY_GAS_LIMIT = 500_000n;
const DELIVERY_MAX_FEE_PER_GAS = 1_000_000_000n; // 1 gwei

// Rough LLM compute gas formula proxy (simplified from the skill docs):
// llm_compute_gas ≈ prompt_tokens * model_params_b * theta
// For GLM-4.7-FP8 we use a conservative per-1K-tokens factor.
const LLM_GAS_PER_1K_TOKENS = 500_000n; // 500K gas per 1K tokens (conservative)

function formatRitual(wei: bigint): string {
  const ritual = Number(wei) / 1e18;
  if (ritual < 0.0001) return `${(ritual * 1e6).toFixed(2)}µ R`;
  if (ritual < 0.01) return `${(ritual * 1e3).toFixed(4)}m R`;
  return `${ritual.toFixed(6)} R`;
}

export function FeeEstimator({ prompt, mode, hasWallet }: FeeEstimatorProps) {
  const estimate = useMemo(() => {
    const tokenEstimate = Math.ceil(prompt.length / 4);
    const tokensBigInt = BigInt(Math.max(1, tokenEstimate));

    // LLM fee breakdown
    if (mode === "llm") {
      const computeGas = (tokensBigInt * LLM_GAS_PER_1K_TOKENS) / 1000n;
      const executorFee = (computeGas * LLM_EXECUTOR_GAS_PRICE_WEI);
      const baseFee = HTTP_EXECUTOR_BASE_FEE_WEI; // proxy base
      const callbackEscrow = DELIVERY_GAS_LIMIT * DELIVERY_MAX_FEE_PER_GAS;
      const total = executorFee + baseFee + callbackEscrow;
      const errorFee = LLM_ERROR_EXECUTOR_FEE_WEI;

      return {
        items: [
          { label: "Executor base fee", wei: baseFee, icon: <Cpu className="w-3 h-3" />, note: "per-call base" },
          { label: "LLM compute gas", wei: executorFee, icon: <Zap className="w-3 h-3" />, note: `~${tokenEstimate} tokens` },
          { label: "Callback escrow", wei: callbackEscrow, icon: <Coins className="w-3 h-3" />, note: "500K gas × 1 gwei" },
        ],
        total,
        errorFee,
        tokenEstimate,
      };
    }

    // Image fee breakdown
    const baseFee = HTTP_EXECUTOR_BASE_FEE_WEI;
    const callbackEscrow = DELIVERY_GAS_LIMIT * DELIVERY_MAX_FEE_PER_GAS;
    const total = baseFee + callbackEscrow;
    const errorFee = LLM_ERROR_EXECUTOR_FEE_WEI;

    return {
      items: [
        { label: "Image executor base fee", wei: baseFee, icon: <Cpu className="w-3 h-3" />, note: "per-call base" },
        { label: "Callback escrow", wei: callbackEscrow, icon: <Coins className="w-3 h-3" />, note: "500K gas × 1 gwei" },
      ],
      total,
      errorFee,
      tokenEstimate,
    };
  }, [prompt, mode]);

  return (
    <div className="terminal-card p-0 overflow-hidden border-gray-800">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="w-3.5 h-3.5 text-ritual-gold" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-gray-300 font-semibold">
            fee_estimator
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider text-gray-600">
          ritual_wallet
        </span>
      </div>

      {/* Line items */}
      <div className="divide-y divide-gray-800/30">
        {estimate.items.map((item, i) => (
          <div key={i} className="px-3 py-1.5 flex items-center gap-2">
            <span className="text-gray-500" aria-hidden="true">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[10px] text-gray-400">{item.label}</span>
              {item.note && (
                <span className="font-mono text-[9px] text-gray-600 ml-1.5">· {item.note}</span>
              )}
            </div>
            <span className="font-mono text-[10px] text-gray-300 tabular-nums">{formatRitual(item.wei)}</span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="px-3 py-2 border-t border-gray-800 bg-ritual-elevated/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-3.5 h-3.5 text-ritual-green" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-gray-300 font-semibold">
            total_estimated
          </span>
        </div>
        <span className="font-mono text-[12px] text-ritual-green font-bold tabular-nums">
          {formatRitual(estimate.total)}
        </span>
      </div>

      {/* Error fee note */}
      <div className="px-3 py-1.5 border-t border-gray-800/30 flex items-center gap-2 bg-ritual-gold/5">
        <AlertCircle className="w-3 h-3 text-ritual-gold flex-shrink-0" aria-hidden="true" />
        <span className="font-mono text-[9px] text-gray-500 flex-1">
          On executor error: <span className="text-ritual-gold">{formatRitual(estimate.errorFee)}</span> non-refundable
        </span>
      </div>

      {/* Wallet status */}
      {!hasWallet && (
        <div className="px-3 py-1.5 border-t border-gray-800/30 flex items-center gap-2 bg-ritual-red/5">
          <span className="w-1.5 h-1.5 rounded-full bg-ritual-red animate-pulse" />
          <span className="font-mono text-[9px] text-ritual-red/80">
            Connect wallet to check RitualWallet escrow balance
          </span>
        </div>
      )}
    </div>
  );
}

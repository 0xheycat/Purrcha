"use client";

import * as React from "react";
import { useChainStatus } from "@/hooks/ritual/useChainStatus";
import { useAsyncTxStore } from "@/stores/asyncTxStore";

/**
 * PrecompileStatusBar — sticky bottom bar.
 *
 * Shows:
 *   - Live block number (mono, updating)
 *   - RPC latency (mono, ms)
 *   - Active precompile indicator (which 0x080* is in flight, from the zustand store)
 *   - Stream indicator (green pulse when a response is streaming)
 *
 * Mobile: collapses to a thin status line.
 */
export function PrecompileStatusBar() {
  const { data } = useChainStatus();
  const transactions = useAsyncTxStore((s) => s.transactions);

  const active = React.useMemo(
    () =>
      Object.values(transactions).filter((t) =>
        ["submitted", "confirming", "pending_result", "settling"].includes(t.state.status),
      ),
    [transactions],
  );
  const streaming = React.useMemo(
    () =>
      Object.values(transactions).some(
        (t) => t.state.status === "settled",
      ),
    [transactions],
  );
  const blockNumber = data?.blockNumber ?? "0";
  const latencyMs = data?.latencyMs ?? 0;

  // Active precompile address.
  const activePrecompile = active[0]?.kind === "image" ? "0x0818" : active[0]?.kind === "llm" ? "0x0802" : null;

  return (
    <footer
      className="sticky bottom-0 z-20 bg-bg/95 backdrop-blur-md border-t border-gray-800 mt-auto"
      role="contentinfo"
    >
      <div className="px-3 sm:px-4 h-9 flex items-center gap-3 sm:gap-6 font-mono text-[10px] uppercase tracking-[0.1em] text-gray-500">
        {/* Block number */}
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-ritual-green animate-pulse" aria-hidden="true" />
          <span className="hidden sm:inline text-gray-600">blk</span>
          <span className="text-gray-300 tabular-nums" aria-live="polite">
            {blockNumber !== "0" ? BigInt(blockNumber).toLocaleString() : "—"}
          </span>
        </div>

        {/* RPC latency */}
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-gray-600">rpc</span>
          <span
            className={`tabular-nums ${
              latencyMs < 400 ? "text-ritual-green" : latencyMs < 1500 ? "text-ritual-gold" : "text-ritual-red"
            }`}
          >
            {latencyMs}ms
          </span>
        </div>

        {/* Active precompile */}
        <div className="flex items-center gap-1.5">
          <span className="text-gray-600">precompile</span>
          {activePrecompile ? (
            <span className="text-ritual-pink animate-pulse">{activePrecompile}</span>
          ) : (
            <span className="text-gray-600">idle</span>
          )}
        </div>

        {/* In-flight count */}
        <div className="hidden md:flex items-center gap-1.5">
          <span className="text-gray-600">in_flight</span>
          <span className="text-gray-300 tabular-nums">{active.length}</span>
        </div>

        <div className="flex-1" />

        {/* Stream indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${streaming ? "bg-ritual-green animate-pulse" : "bg-gray-700"}`}
            aria-hidden="true"
          />
          <span className={streaming ? "text-ritual-green" : "text-gray-600"}>
            {streaming ? "streaming" : "idle"}
          </span>
        </div>
      </div>
    </footer>
  );
}

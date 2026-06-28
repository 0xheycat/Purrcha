"use client";

import * as React from "react";
import { useAsyncTxStore } from "@/stores/asyncTxStore";
import {
  LIFECYCLE_ORDER,
  STATE_META,
  isTerminal,
  type AsyncTxStatus,
} from "@/types/asyncTx";
import { truncateHex, useCopyToClipboard } from "@/hooks/ritual/useChainStatus";
import { RITUAL_CHAIN } from "@/lib/ritual/constants";

/**
 * LifecycleRail — right panel. The 9-state execution console.
 *
 * Shows the current active transaction(s) from the zustand store. For each: a vertical timeline
 * of all 9 states with the current one highlighted (green pulse), completed ones checkmarked,
 * future ones dimmed. Shows: txHash, jobId, executor, block progress, gasUsed on settle.
 *
 * If no active tx: "EXECUTION RAIL IDLE" terminal prompt.
 */
export function LifecycleRail() {
  const transactions = useAsyncTxStore((s) => s.transactions);
  const clearSettled = useAsyncTxStore((s) => s.clearSettled);
  const clearAll = useAsyncTxStore((s) => s.clearAll);

  const all = React.useMemo(
    () => Object.values(transactions).sort((a, b) => b.updatedAt - a.updatedAt),
    [transactions],
  );
  const activeCount = all.filter((t) => !isTerminal(t.state.status)).length;

  return (
    <aside className="terminal-card flex flex-col h-full min-h-0" aria-label="Lifecycle rail">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">
            execution_rail
          </div>
          <div className="font-display text-sm text-gray-200 mt-0.5">
            {activeCount > 0 ? `${activeCount} in flight` : "Idle"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={clearSettled}
            className="font-mono text-[10px] uppercase tracking-wider text-gray-500 hover:text-ritual-green px-1.5 py-1 rounded border border-gray-700 hover:border-ritual-green/40"
            aria-label="Clear settled transactions"
            title="Clear settled/failed"
          >
            ⌫
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="font-mono text-[10px] uppercase tracking-wider text-gray-500 hover:text-ritual-red px-1.5 py-1 rounded border border-gray-700 hover:border-ritual-red/40"
            aria-label="Clear all transactions"
            title="Clear all"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-3 space-y-3 max-h-[calc(100vh-220px)] lg:max-h-[calc(100vh-180px)]">
        {all.length === 0 && (
          <div className="font-mono text-[12px] text-gray-500 leading-relaxed">
            <div className="text-ritual-green mb-2">$ execution_rail</div>
            <div className="text-gray-600">
              <span className="text-ritual-green">▸</span> No tracked transactions.
              <br />
              <span className="text-ritual-green">▸</span> Submit a prompt to begin.
              <br />
              <span className="text-ritual-green">▸</span> The full 9-state lifecycle
              <br />
              &nbsp;&nbsp;&nbsp;will display here.
            </div>
            <div className="mt-4 blink-cursor" />
          </div>
        )}

        {all.map((tx) => (
          <TxLifecycleCard key={tx.id} tx={tx} />
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-800 font-mono text-[10px] text-gray-600 uppercase tracking-wider">
        9-state machine · ritual chain 1979
      </div>
    </aside>
  );
}

// ───────────────────────── Per-Transaction Card ─────────────────────────

function TxLifecycleCard({
  tx,
}: {
  tx: {
    id: string;
    kind: "llm" | "image";
    state: {
      status: AsyncTxStatus;
      txHash?: `0x${string}`;
      jobId?: `0x${string}`;
      requestId?: `0x${string}`;
      executor?: `0x${string}`;
      submittedAt?: number;
      committedBlock?: number;
      settledBlock?: number;
      error?: string;
      errorCategory?: "wallet" | "contract" | "async" | "network";
      result?: unknown;
    };
    createdAt: number;
    updatedAt: number;
    label?: string;
    promptPreview?: string;
  };
}) {
  const { copied, copy } = useCopyToClipboard();
  const [expanded, setExpanded] = React.useState(false);

  const currentStatus = tx.state.status;
  const currentIndex = LIFECYCLE_ORDER.indexOf(currentStatus);
  const isTerm = isTerminal(currentStatus);

  // Map state.meta color string → bg/border classes.
  const dotClass = (status: AsyncTxStatus, isActive: boolean, isDone: boolean): string => {
    if (status === currentStatus && (status === "failed" || status === "rejected")) {
      return "lifecycle-dot failed";
    }
    if (status === currentStatus && status === "timeout") {
      return "lifecycle-dot warn";
    }
    if (isActive && !isTerm) return "lifecycle-dot active";
    if (isDone) return "lifecycle-dot done";
    return "lifecycle-dot";
  };

  const explorerUrl = tx.state.txHash
    ? `${RITUAL_CHAIN.blockExplorers.default.url}/tx/${tx.state.txHash}`
    : null;

  return (
    <article className="rounded-md border border-gray-800 bg-elevated">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2 flex-wrap">
        <span
          className={`precompile-badge ${tx.kind === "llm" ? "precompile-badge-llm" : "precompile-badge-image"}`}
        >
          {tx.kind === "llm" ? "◇ LLM" : "◆ IMG"}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
          {tx.label ?? "Chat"}
        </span>
        <span className="ml-auto font-mono text-[10px] text-gray-600 uppercase tracking-wider tabular-nums">
          {timeAgo(tx.updatedAt)}
        </span>
      </div>

      {/* Vertical lifecycle */}
      <div className="px-3 py-3">
        <ol className="space-y-1.5">
          {LIFECYCLE_ORDER.map((status, idx) => {
            const meta = STATE_META[status];
            const isDone = idx < currentIndex;
            const isActive = idx === currentIndex;
            const isFuture = idx > currentIndex;
            const isFailState =
              status === "failed" || status === "rejected" || status === "timeout";

            // Skip the failure branches when not relevant (cleaner UI).
            if (isFailState && status !== currentStatus && !isTerm) {
              return null;
            }

            return (
              <li key={status} className="flex items-center gap-2">
                <span className={dotClass(status, isActive, isDone)} aria-hidden="true">
                  {isDone ? "✓" : meta.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-mono text-[11px] ${
                      isActive
                        ? status === "failed" || status === "rejected"
                          ? "text-ritual-red"
                          : status === "timeout"
                            ? "text-ritual-gold"
                            : "text-ritual-green"
                        : isDone
                          ? "text-gray-400"
                          : "text-gray-600"
                    }`}
                  >
                    {meta.label}
                  </div>
                  {isActive && (
                    <div className="font-mono text-[10px] text-gray-500 truncate">
                      {meta.description}
                    </div>
                  )}
                </div>
                {isFuture && (
                  <span className="font-mono text-[9px] text-gray-700 uppercase tracking-wider">
                    pending
                  </span>
                )}
              </li>
            );
          })}
          {/* Terminal failure states (only show if current) */}
          {isTerm &&
            !LIFECYCLE_ORDER.includes(currentStatus) &&
            (() => {
              const meta = STATE_META[currentStatus];
              return (
                <li className="flex items-center gap-2">
                  <span className="lifecycle-dot failed" aria-hidden="true">
                    {meta.icon}
                  </span>
                  <div className="flex-1">
                    <div className="font-mono text-[11px] text-ritual-red">{meta.label}</div>
                    <div className="font-mono text-[10px] text-gray-500">{meta.description}</div>
                  </div>
                </li>
              );
            })()}
        </ol>

        {/* Error message */}
        {tx.state.error && (
          <div className="mt-3 font-mono text-[10px] text-ritual-red border-l-2 border-ritual-red/40 pl-2 break-words">
            {tx.state.error}
          </div>
        )}

        {/* Expandable details */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 hover:text-ritual-green transition-colors"
          aria-expanded={expanded}
        >
          {expanded ? "▾ hide details" : "▸ view details"}
        </button>
        {expanded && (
          <div className="mt-2 space-y-1.5 fade-in">
            <DetailRow
              label="tx_hash"
              value={tx.state.txHash ?? "—"}
              copyable={Boolean(tx.state.txHash)}
              copied={copied}
              onCopy={() => tx.state.txHash && copy(tx.state.txHash)}
              explorerUrl={explorerUrl ?? undefined}
            />
            <DetailRow label="job_id" value={tx.state.jobId ?? "—"} copyable={Boolean(tx.state.jobId)} />
            <DetailRow label="request_id" value={tx.state.requestId ?? "—"} copyable={Boolean(tx.state.requestId)} />
            <DetailRow label="executor" value={tx.state.executor ?? "—"} />
            {tx.state.committedBlock !== undefined && (
              <DetailRow label="commit_blk" value={tx.state.committedBlock.toLocaleString()} />
            )}
            {tx.state.settledBlock !== undefined && (
              <DetailRow label="settled_blk" value={tx.state.settledBlock.toLocaleString()} />
            )}
            {tx.state.submittedAt && (
              <DetailRow label="submitted" value={new Date(tx.state.submittedAt).toISOString().slice(11, 19)} />
            )}
            {tx.state.errorCategory && (
              <DetailRow label="err_category" value={tx.state.errorCategory} />
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ───────────────────────── Helpers ─────────────────────────

function DetailRow({
  label,
  value,
  copyable,
  copied,
  onCopy,
  explorerUrl,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  copied?: boolean;
  onCopy?: () => void;
  explorerUrl?: string;
}) {
  return (
    <div className="flex items-start gap-2 font-mono text-[10px]">
      <span className="text-gray-600 uppercase tracking-wider w-20 flex-shrink-0">{label}</span>
      <span className="text-gray-400 break-all flex-1" title={value}>
        {truncateHex(value, 16, 8)}
      </span>
      {copyable && (
        <button
          type="button"
          onClick={onCopy}
          className="text-gray-600 hover:text-ritual-green transition-colors flex-shrink-0"
          aria-label={`Copy ${label}`}
        >
          {copied ? "✓" : "⧉"}
        </button>
      )}
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="text-gray-600 hover:text-ritual-green transition-colors flex-shrink-0"
          aria-label="View on explorer"
        >
          ↗
        </a>
      )}
    </div>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1000) return "now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

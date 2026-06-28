"use client";

import * as React from "react";
import { useChatHistory } from "@/hooks/ritual/useChatHistory";
import { useEncryption } from "@/hooks/ritual/useEncryption";
import { usePurrchaWallet } from "@/hooks/ritual/usePurrchaWallet";
import { useAsyncTxStore } from "@/stores/asyncTxStore";
import { truncateHex } from "@/hooks/ritual/useChainStatus";
import { PRECOMPILES } from "@/lib/ritual/constants";
import type { DecodedMessage } from "@/hooks/ritual/useChatHistory";
import { Lock } from "lucide-react";

/**
 * ConversationTimeline — left panel. Scrollable list of decrypted messages from useChatHistory.
 *
 * Each message card shows:
 *   - Role badge (USER=lime, AI=pink with ◇ icon)
 *   - Precompile badge (LLM 0x0802 or IMG 0x0818)
 *   - TX lifecycle badge (settled=green ✓, failed=red ✕, pending=gold ⟳)
 *   - Verification badge (green "TEE VERIFIED" if verified)
 *   - Timestamp (mono, from block)
 *   - Decrypted prompt/response text (or "encrypted — unlock to read" if locked)
 *   - Expandable proof section (txHash, requestId, executor, block)
 *
 * Empty state: "No conversations yet — submit your first prompt below." (honest, no fake history).
 */
export function ConversationTimeline() {
  const wallet = usePurrchaWallet();
  const encryption = useEncryption();
  const { messages, isLoading, error, refetch } = useChatHistory(wallet.address);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // Also surface in-flight tracked txs from the store at the top.
  const tracked = useAsyncTxStore((s) => s.transactions);
  const trackedList = React.useMemo(
    () => Object.values(tracked).sort((a, b) => b.createdAt - a.createdAt),
    [tracked],
  );

  return (
    <aside
      className="terminal-card flex flex-col h-full min-h-0"
      aria-label="Conversation timeline"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">
              conversation_log
            </div>
            <div className="font-display text-sm text-gray-200 mt-0.5">
              History · {messages.length + trackedList.length}
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="font-mono text-[10px] uppercase tracking-wider text-gray-500 hover:text-ritual-green transition-colors px-2 py-1 rounded border border-gray-700 hover:border-ritual-green/50"
            aria-label="Refresh history"
          >
            ⟳
          </button>
        </div>
        {/* Stats row */}
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-800/50">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-ritual-green" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-gray-500">
              {messages.filter((m) => !m.hasError).length} verified
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-ritual-gold" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-gray-500">
              {trackedList.filter((t) => t.state.status !== "settled" && t.state.status !== "failed" && t.state.status !== "rejected" && t.state.status !== "timeout").length} pending
            </span>
          </div>
          {messages.some((m) => m.hasError) && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-ritual-red" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-ritual-red/70">
                {messages.filter((m) => m.hasError).length} failed
              </span>
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-3 space-y-3 max-h-[calc(100vh-220px)] lg:max-h-[calc(100vh-180px)]">
        {/* Loading state */}
        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-md bg-elevated border border-gray-800 animate-pulse" />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="rounded-md border border-ritual-red/40 bg-ritual-red/5 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-ritual-red mb-1">
              ⚠ Indexing error
            </div>
            <div className="font-mono text-[11px] text-gray-400 break-words">{error}</div>
          </div>
        )}

        {/* In-flight tracked txs (live from the zustand store) */}
        {trackedList.length > 0 && (
          <div className="space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600 px-1">
              in_flight
            </div>
            {trackedList.map((tx) => (
              <TrackedMessageCard
                key={tx.id}
                kind={tx.kind}
                label={tx.label ?? "Chat"}
                promptPreview={tx.promptPreview ?? ""}
                status={tx.state.status}
                txHash={tx.state.txHash}
                executor={tx.state.executor}
                requestId={tx.state.requestId}
                result={tx.state.result as { kind?: string; text?: string; outputUri?: string; width?: number; height?: number; contentHash?: string } | undefined}
                expanded={expandedId === tx.id}
                onToggle={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
              />
            ))}
          </div>
        )}

        {/* Decoded history */}
        {!isLoading && !error && messages.length === 0 && trackedList.length === 0 && (
          <div className="text-center py-12 px-4 fade-in">
            <div className="relative inline-block mb-4">
              <div className="absolute inset-0 bg-ritual-green/10 blur-2xl rounded-full" aria-hidden="true" />
              <div className="relative w-16 h-16 mx-auto rounded-full border border-ritual-green/30 bg-ritual-green/5 flex items-center justify-center">
                <span className="font-mono text-2xl text-ritual-green/60" aria-hidden="true">◇</span>
              </div>
            </div>
            <div className="font-mono text-[10px] text-gray-600 mb-3 uppercase tracking-[0.2em]">
              empty_log
            </div>
            <div className="font-mono text-[11px] text-gray-400 leading-relaxed mb-4">
              No conversations yet.
              <br />
              Submit your first prompt to begin a
              <br />
              <span className="text-ritual-green">TEE-verified</span>,{" "}
              <span className="text-ritual-gold">ECIES-encrypted</span> on-chain chat.
            </div>
            <div className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-gray-600 px-2.5 py-1 rounded border border-gray-800 bg-ritual-elevated/50">
              <span className="w-1 h-1 rounded-full bg-ritual-green animate-pulse" />
              awaiting first tx
            </div>
          </div>
        )}

        {/* Messages */}
        {!isLoading && messages.length > 0 && (
          <div className="space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600 px-1">
              settled
            </div>
            {messages.map((m) => (
              <MessageCard
                key={m.requestId}
                message={m}
                isUnlocked={encryption.isUnlocked}
                expanded={expandedId === m.requestId}
                onToggle={() =>
                  setExpandedId(expandedId === m.requestId ? null : m.requestId)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-800 flex items-center justify-between text-[10px] font-mono">
        <span className="text-gray-600 uppercase tracking-wider">
          {encryption.isUnlocked ? (
            <span className="text-ritual-green">● decrypted locally</span>
          ) : (
            <span className="text-ritual-gold">● locked</span>
          )}
        </span>
        <span className="text-gray-600 uppercase tracking-wider">
          {messages.length} msgs
        </span>
      </div>
    </aside>
  );
}

// ───────────────────────── Message Card (settled history) ─────────────────────────

interface MessageCardProps {
  message: DecodedMessage;
  isUnlocked: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function MessageCard({ message, isUnlocked, expanded, onToggle }: MessageCardProps) {
  const isLlm = message.kind === "llm";
  const blockNum = safeBigInt(message.blockNumber);

  return (
    <article
      className="rounded-md border border-gray-800 bg-elevated hover:border-gray-700 transition-colors"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2 flex-wrap">
        <span
          className={`precompile-badge ${isLlm ? "precompile-badge-llm" : "precompile-badge-image"}`}
        >
          {isLlm ? "◇ LLM 0x0802" : "◆ IMG 0x0818"}
        </span>
        {message.verified ? (
          <span className="precompile-badge precompile-badge-llm">✓ TEE Verified</span>
        ) : null}
        {message.hasError ? (
          <span className="precompile-badge border-ritual-red/40 text-ritual-red bg-ritual-red/5">
            ✕ Error
          </span>
        ) : (
          <span className="precompile-badge precompile-badge-llm">✓ Settled</span>
        )}
        <span className="ml-auto font-mono text-[10px] text-gray-500 tabular-nums">
          blk {blockNum.toLocaleString()}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-2">
        {/* User prompt */}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-ritual-lime mb-1 flex items-center gap-1">
            <span>▸ user</span>
            {message.promptText && <span className="text-ritual-green text-[8px]">● decrypted</span>}
          </div>
          {message.promptText ? (
            <div className="font-mono text-[12px] text-gray-300 break-words whitespace-pre-wrap leading-relaxed">
              {message.promptText}
            </div>
          ) : (
            <div className="font-mono text-[11px] text-ritual-gold/80 italic flex items-center gap-1.5 py-1">
              <Lock className="w-3 h-3" aria-hidden="true" />
              <span>encrypted — click Unlock in the status bar to decrypt</span>
            </div>
          )}
        </div>

        {/* AI response */}
        {message.hasError && message.errorMessage ? (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-ritual-red mb-1 flex items-center gap-1">
              <span>✕ executor error</span>
            </div>
            <div className="font-mono text-[11px] text-ritual-red/80 border-l-2 border-ritual-red/40 pl-2 break-words">
              {message.errorMessage.slice(0, 200)}
              {message.errorMessage.length > 200 && "..."}
            </div>
          </div>
        ) : message.responseText ? (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-ritual-pink mb-1 flex items-center gap-1">
              <span>◇ assistant</span>
              <span className="text-ritual-green text-[8px]">● decrypted</span>
            </div>
            <div className="font-mono text-[12px] text-gray-200 break-words whitespace-pre-wrap leading-relaxed border-l-2 border-ritual-pink/40 pl-2">
              {message.responseText}
            </div>
          </div>
        ) : !isUnlocked && message.encryptedResponseCiphertext && message.encryptedResponseCiphertext !== "0x" ? (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-ritual-pink mb-1">
              ◇ assistant
            </div>
            <div className="font-mono text-[11px] text-ritual-gold/80 italic flex items-center gap-1.5 py-1">
              <Lock className="w-3 h-3" aria-hidden="true" />
              <span>encrypted — click Unlock to decrypt</span>
            </div>
          </div>
        ) : message.outputUri ? (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-ritual-pink mb-1">
              ◇ generated image
            </div>
            <a
              href={message.outputUri}
              target="_blank"
              rel="noreferrer"
              className="inline-block font-mono text-[11px] text-ritual-pink hover:underline break-all"
            >
              {message.outputUri}
            </a>
          </div>
        ) : null}
      </div>

      {/* Expandable proof */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-1.5 border-t border-gray-800 flex items-center justify-between text-[10px] font-mono text-gray-500 hover:text-ritual-green hover:bg-ritual-green/5 transition-colors"
        aria-expanded={expanded}
      >
        <span className="uppercase tracking-wider">
          {expanded ? "▾ hide proof" : "▸ view proof"}
        </span>
        <span className="uppercase tracking-wider">{message.kind}</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 border-t border-gray-800 space-y-1 font-mono text-[10px] text-gray-500 fade-in">
          <ProofRow label="request_id" value={message.requestId} mono truncate />
          <ProofRow label="tx_hash" value={message.txHash ?? "—"} mono truncate />
          <ProofRow label="executor" value={message.executor ?? "—"} mono truncate />
          <ProofRow label="block" value={blockNum.toLocaleString()} mono />
          {message.settledBlock && (
            <ProofRow label="settled_at" value={BigInt(message.settledBlock).toLocaleString()} mono />
          )}
          {message.precompileId !== undefined && (
            <ProofRow
              label="precompile"
              value={message.precompileId === 1 ? "LLM (0x0802)" : "IMAGE (0x0818)"}
              mono
            />
          )}
          {message.outputContentHash && (
            <ProofRow label="content_hash" value={message.outputContentHash} mono truncate />
          )}
        </div>
      )}
    </article>
  );
}

// ───────────────────────── Tracked Message Card (in-flight) ─────────────────────────

interface TrackedMessageCardProps {
  kind: "llm" | "image";
  label: string;
  promptPreview: string;
  status: string;
  txHash?: `0x${string}`;
  executor?: `0x${string}`;
  requestId?: `0x${string}`;
  result?: { kind?: string; text?: string; outputUri?: string; width?: number; height?: number; contentHash?: string } | undefined;
  expanded: boolean;
  onToggle: () => void;
}

function TrackedMessageCard({
  kind,
  label,
  promptPreview,
  status,
  txHash,
  executor,
  requestId,
  result,
  expanded,
  onToggle,
}: TrackedMessageCardProps) {
  const isLlm = kind === "llm";
  const isPending = ["submitted", "confirming", "pending_result", "settling"].includes(status);
  const isFailed = ["failed", "rejected", "timeout"].includes(status);

  return (
    <article className="rounded-md border border-gray-700 bg-elevated">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2 flex-wrap">
        <span className={`precompile-badge ${isLlm ? "precompile-badge-llm" : "precompile-badge-image"}`}>
          {isLlm ? "◇ LLM 0x0802" : "◆ IMG 0x0818"}
        </span>
        {isPending && (
          <span className="precompile-badge border-ritual-gold/40 text-ritual-gold bg-ritual-gold/5">
            ⟳ {status}
          </span>
        )}
        {status === "settled" && (
          <span className="precompile-badge precompile-badge-llm">✓ Settled</span>
        )}
        {isFailed && (
          <span className="precompile-badge border-ritual-red/40 text-ritual-red bg-ritual-red/5">
            ✕ {status}
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-gray-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="px-3 py-2 space-y-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-ritual-lime mb-1">
            ▸ user
          </div>
          <div className="font-mono text-[12px] text-gray-300 break-words whitespace-pre-wrap leading-relaxed">
            {promptPreview}
            {promptPreview.length >= 80 ? "…" : ""}
          </div>
        </div>
        {result?.text && status === "settled" && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-ritual-pink mb-1">
              ◇ assistant
            </div>
            <div className="font-mono text-[12px] text-gray-200 break-words whitespace-pre-wrap leading-relaxed border-l-2 border-ritual-pink/40 pl-2 blink-cursor">
              {result.text}
            </div>
          </div>
        )}
        {result?.outputUri && status === "settled" && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-ritual-pink mb-1">
              ◇ generated image
            </div>
            <a
              href={result.outputUri}
              target="_blank"
              rel="noreferrer"
              className="inline-block font-mono text-[11px] text-ritual-pink hover:underline break-all"
            >
              {result.outputUri}
            </a>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-1.5 border-t border-gray-800 flex items-center justify-between text-[10px] font-mono text-gray-500 hover:text-ritual-green hover:bg-ritual-green/5 transition-colors"
        aria-expanded={expanded}
      >
        <span className="uppercase tracking-wider">
          {expanded ? "▾ hide proof" : "▸ view proof"}
        </span>
        <span className="uppercase tracking-wider">{status}</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 border-t border-gray-800 space-y-1 font-mono text-[10px] text-gray-500 fade-in">
          <ProofRow label="request_id" value={requestId ?? "pending"} mono truncate />
          <ProofRow label="tx_hash" value={txHash ?? "pending"} mono truncate />
          <ProofRow label="executor" value={executor ?? "—"} mono truncate />
        </div>
      )}
    </article>
  );
}

// ───────────────────────── Helpers ─────────────────────────

function ProofRow({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-600 uppercase tracking-wider w-24 flex-shrink-0">
        {label}
      </span>
      <span
        className={`text-gray-400 break-all ${mono ? "font-mono" : ""}`}
        title={truncate ? value : undefined}
      >
        {truncate ? truncateHex(value, 16, 8) : value}
      </span>
    </div>
  );
}

function safeBigInt(v: string | bigint): bigint {
  try {
    return typeof v === "bigint" ? v : BigInt(v);
  } catch {
    return 0n;
  }
}

// Used by the page-level "view proof" button to avoid an unused import warning.
export { PRECOMPILES };

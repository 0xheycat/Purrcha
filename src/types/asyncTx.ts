/**
 * Purrcha async transaction state machine — the full 9-state lifecycle from
 * ritual-dapp-frontend/SKILL.md. Every precompile-touching tx moves through these states.
 *
 * State map:
 *   IDLE → SUBMITTED → CONFIRMING → PENDING_RESULT → SETTLING → SETTLED
 *   Any non-terminal → FAILED (revert / rejection / executor error)
 *   PENDING_RESULT → TIMEOUT (TTL expired, no executor)
 */

export type AsyncTxStatus =
  | "idle"
  | "submitted"
  | "confirming"
  | "pending_result"
  | "settling"
  | "settled"
  | "failed"
  | "rejected"
  | "timeout";

export type PrecompileKind = "llm" | "image";

export interface AsyncTxState {
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
}

export interface TrackedTransaction {
  id: string;
  kind: PrecompileKind;
  state: AsyncTxState;
  createdAt: number;
  updatedAt: number;
  label?: string;
  promptPreview?: string;
}

/** The canonical state ordering for the lifecycle rail UI. */
export const LIFECYCLE_ORDER: AsyncTxStatus[] = [
  "idle",
  "submitted",
  "confirming",
  "pending_result",
  "settling",
  "settled",
];

export const TERMINAL_STATES: AsyncTxStatus[] = ["settled", "failed", "rejected", "timeout"];

export function isTerminal(status: AsyncTxStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

export function canTransition(from: AsyncTxStatus, to: AsyncTxStatus): boolean {
  const valid: Record<AsyncTxStatus, AsyncTxStatus[]> = {
    idle: ["submitted", "failed"],
    submitted: ["confirming", "failed", "rejected"],
    confirming: ["pending_result", "failed", "timeout"],
    pending_result: ["settling", "settled", "failed", "timeout"],
    settling: ["settled", "failed"],
    settled: [],
    failed: [],
    rejected: [],
    timeout: [],
  };
  return valid[from]?.includes(to) ?? false;
}

export const STATE_META: Record<AsyncTxStatus, { label: string; icon: string; color: string; description: string }> = {
  idle: { label: "Idle", icon: "·", color: "gray", description: "Awaiting user input" },
  submitted: { label: "Submitted", icon: "↑", color: "gray", description: "Tx sent to mempool" },
  confirming: { label: "Confirming", icon: "◉", color: "gold", description: "Block inclusion pending" },
  pending_result: { label: "Pending Result", icon: "⟳", color: "gold", description: "Executor processing in TEE" },
  settling: { label: "Settling", icon: "◎", color: "gold", description: "Result delivery in flight" },
  settled: { label: "Settled", icon: "✓", color: "green", description: "Result verified on-chain" },
  failed: { label: "Failed", icon: "✕", color: "red", description: "Execution reverted or errored" },
  rejected: { label: "Rejected", icon: "⊘", color: "red", description: "Wallet rejected the tx" },
  timeout: { label: "Timeout", icon: "⏱", color: "gray", description: "TTL expired, no executor" },
};

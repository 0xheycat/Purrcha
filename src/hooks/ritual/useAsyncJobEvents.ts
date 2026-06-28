"use client";

import * as React from "react";
import { useWatchContractEvent, usePublicClient } from "wagmi";
import { keccak256, toBytes, parseAbiItem, type Address, type Hex, type Log } from "viem";
import { ASYNC_JOB_TRACKER_ADDRESS, ASYNC_JOB_TRACKER_ABI } from "@/lib/ritual/abi";
import { useAsyncTxStore } from "@/stores/asyncTxStore";
import type { AsyncTxStatus } from "@/types/asyncTx";

/**
 * useAsyncJobEvents — watches AsyncJobTracker events and drives the 9-state lifecycle of
 * every tracked Purrcha transaction in the zustand store.
 *
 * Event → state mapping (per ritual-dapp-contracts/SKILL.md):
 *   JobAdded      → confirming      (job committed, executor assigned, jobId known)
 *   Phase1Settled → pending_result  (only for long-running async — Image 0x0818)
 *   ResultDelivered → settled|failed (success flag = settled; failure = failed)
 *   JobRemoved (completed=true)  → settled   (short-running async — LLM 0x0802)
 *   JobRemoved (completed=false) → timeout   (TTL expired, no executor delivered)
 *
 * The hook matches events back to a tracked tx via the executor address (the AsyncJobTracker
 * only emits the executor + jobId, not the original tx hash). We tag the most recent non-terminal
 * tx whose `executor` matches the event. This is honest: if multiple jobs are in flight for the
 * same executor simultaneously, the UI may attribute ambiguously — but the per-EOA lock prevents
 * that case in practice (one pending job per sender).
 *
 * This is a no-op when no wallet is connected or no tracked transactions exist.
 */

// Pre-computed event topic0 hashes (keccak256 of the event signature).
const TOPIC_JOB_ADDED = keccak256(
  toBytes("JobAdded(address,bytes32,address,uint256,bytes,address,bytes32,uint256,uint256,uint256,uint256)"),
);
const TOPIC_PHASE1_SETTLED = keccak256(toBytes("Phase1Settled(bytes32,address,uint256)"));
const TOPIC_RESULT_DELIVERED = keccak256(toBytes("ResultDelivered(bytes32,address,bool)"));
const TOPIC_JOB_REMOVED = keccak256(toBytes("JobRemoved(address,bytes32,bool)"));

interface DecodedTrackerEvent {
  kind: "JobAdded" | "Phase1Settled" | "ResultDelivered" | "JobRemoved";
  executor?: Address;
  jobId?: Hex;
  commitBlock?: bigint;
  success?: boolean;
  completed?: boolean;
}

function decodeTrackerEvent(log: Log): DecodedTrackerEvent | null {
  const topic0 = log.topics?.[0] ?? "";
  const jobId = (log.topics?.[2] as Hex | undefined) ?? undefined;

  if (topic0 === TOPIC_JOB_ADDED) {
    const executor = (`0x${(log.topics?.[1] ?? "").slice(26)}` as Address) || undefined;
    const data = (log.data ?? "0x") as Hex;
    const commitBlock = data && data.length >= 66 ? BigInt(data.slice(0, 66)) : undefined;
    return { kind: "JobAdded", executor, jobId, commitBlock };
  }
  if (topic0 === TOPIC_PHASE1_SETTLED) {
    const executor = (`0x${(log.topics?.[2] ?? "").slice(26)}` as Address) || undefined;
    return { kind: "Phase1Settled", executor, jobId };
  }
  if (topic0 === TOPIC_RESULT_DELIVERED) {
    const target = (`0x${(log.topics?.[2] ?? "").slice(26)}` as Address) || undefined;
    const data = (log.data ?? "0x") as Hex;
    const success = data && data.length >= 66 ? BigInt(data.slice(0, 66)) === 1n : undefined;
    return { kind: "ResultDelivered", executor: target, jobId, success: Boolean(success) };
  }
  if (topic0 === TOPIC_JOB_REMOVED) {
    const executor = (`0x${(log.topics?.[1] ?? "").slice(26)}` as Address) || undefined;
    const completedTopic = log.topics?.[3];
    const completed = completedTopic ? BigInt(completedTopic) === 1n : undefined;
    return { kind: "JobRemoved", executor, jobId, completed: Boolean(completed) };
  }
  return null;
}

export function useAsyncJobEvents(): void {
  const publicClient = usePublicClient();
  const transactions = useAsyncTxStore((s) => s.transactions);
  const updateState = useAsyncTxStore((s) => s.updateState);
  const setStatus = useAsyncTxStore((s) => s.setStatus);

  const activeTxs = React.useMemo(
    () =>
      Object.values(transactions).filter(
        (t) => !["settled", "failed", "rejected", "timeout"].includes(t.state.status),
      ),
    [transactions],
  );
  const hasActive = activeTxs.length > 0;

  const findMatchingTx = React.useCallback(
    (executor?: Address): string | null => {
      if (!executor) {
        const sorted = [...activeTxs].sort((a, b) => b.updatedAt - a.updatedAt);
        return sorted[0]?.id ?? null;
      }
      const ex = executor.toLowerCase();
      const match = activeTxs.find((t) => t.state.executor?.toLowerCase() === ex);
      if (match) return match.id;
      const sorted = [...activeTxs].sort((a, b) => b.updatedAt - a.updatedAt);
      return sorted[0]?.id ?? null;
    },
    [activeTxs],
  );

  // Poll AsyncJobTracker logs every 3.5s (Ritual's WS endpoint is unreliable; polling is honest).
  React.useEffect(() => {
    if (!publicClient || !hasActive) return;
    let cancelled = false;
    let lastBlock = 0n;

    const poll = async () => {
      try {
        const current = await publicClient.getBlockNumber();
        if (current === lastBlock) return;
        const fromBlock = lastBlock === 0n ? (current > 50n ? current - 50n : 0n) : lastBlock + 1n;
        if (fromBlock > current) return;
        lastBlock = current;

        const logs = await publicClient.getLogs({
          address: ASYNC_JOB_TRACKER_ADDRESS as Address,
          events: [
            parseAbiItem(
              "event JobAdded(address indexed executor, bytes32 indexed jobId, address indexed precompileAddress, uint256 commitBlock, bytes precompileInput, address senderAddress, bytes32 previousBlockHash, uint256 previousBlockNumber, uint256 previousBlockTimestamp, uint256 ttl, uint256 createdAt)",
            ),
            parseAbiItem("event Phase1Settled(bytes32 indexed jobId, address indexed executor, uint256 settledBlock)"),
            parseAbiItem("event ResultDelivered(bytes32 indexed jobId, address indexed target, bool success)"),
            parseAbiItem("event JobRemoved(address indexed executor, bytes32 indexed jobId, bool indexed completed)"),
          ],
          fromBlock,
          toBlock: current,
        });

        if (cancelled || logs.length === 0) return;

        for (const log of logs as Log[]) {
          const decoded = decodeTrackerEvent(log);
          if (!decoded) continue;
          const txId = findMatchingTx(decoded.executor);
          if (!txId) continue;

          switch (decoded.kind) {
            case "JobAdded": {
              updateState(txId, {
                status: "confirming" as AsyncTxStatus,
                jobId: decoded.jobId,
                executor: decoded.executor,
                committedBlock: decoded.commitBlock ? Number(decoded.commitBlock) : undefined,
              });
              break;
            }
            case "Phase1Settled": {
              updateState(txId, {
                status: "pending_result" as AsyncTxStatus,
                jobId: decoded.jobId,
                executor: decoded.executor,
              });
              break;
            }
            case "ResultDelivered": {
              setStatus(txId, decoded.success ? "settled" : "failed");
              if (decoded.jobId) updateState(txId, { jobId: decoded.jobId });
              break;
            }
            case "JobRemoved": {
              setStatus(txId, decoded.completed ? "settled" : "timeout");
              if (decoded.jobId) updateState(txId, { jobId: decoded.jobId });
              break;
            }
          }
        }
      } catch {
        // silent — RPC may rate-limit; next tick retries
      }
    };

    poll();
    const interval = setInterval(poll, 3_500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [publicClient, hasActive, findMatchingTx, updateState, setStatus]);

  // Belt-and-suspenders: also wire useWatchContractEvent for JobRemoved (the most terminal one).
  useWatchContractEvent({
    address: ASYNC_JOB_TRACKER_ADDRESS as Address,
    abi: ASYNC_JOB_TRACKER_ABI,
    eventName: "JobRemoved",
    enabled: hasActive,
    poll: true,
    pollingInterval: 4_000,
    onLogs: (logs) => {
      for (const log of logs as unknown as Array<{
        args?: { executor?: Address; jobId?: Hex; completed?: boolean };
      }>) {
        const args = log.args;
        if (!args) continue;
        const txId = findMatchingTx(args.executor);
        if (!txId) continue;
        setStatus(txId, args.completed ? "settled" : "timeout");
        if (args.jobId) updateState(txId, { jobId: args.jobId });
      }
    },
  });
}

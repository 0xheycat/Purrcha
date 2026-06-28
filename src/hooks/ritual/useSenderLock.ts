"use client";

import * as React from "react";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { ASYNC_JOB_TRACKER_ADDRESS, ASYNC_JOB_TRACKER_ABI } from "@/lib/ritual/abi";

/**
 * useSenderLock — reads AsyncJobTracker.hasPendingJobForSender(address).
 *
 * Ritual enforces ONE pending async job per EOA at a time. Before submitting a new precompile
 * chat, we must check this — otherwise the contract will revert. The hook polls every 5s
 * (Ritual block time is 350ms, but a job can take many blocks to settle).
 *
 * Returns `{ isLocked, message }`. `message` is a human-readable string for the UI.
 */
export interface UseSenderLockResult {
  isLocked: boolean;
  isLoading: boolean;
  isError: boolean;
  message: string | null;
  refetch: () => void;
}

export function useSenderLock(address?: Address): UseSenderLockResult {
  const enabled = Boolean(address);
  const { data, isLoading, isError, refetch } = useReadContract({
    address: ASYNC_JOB_TRACKER_ADDRESS as Address,
    abi: ASYNC_JOB_TRACKER_ABI,
    functionName: "hasPendingJobForSender",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: {
      enabled,
      refetchInterval: 5_000,
      refetchOnBlock: true,
    },
  });

  const isLocked = Boolean(data);

  return {
    isLocked,
    isLoading: enabled && isLoading,
    isError,
    message: isLocked
      ? "A pending async job is already in flight for this wallet. Wait for settlement before submitting a new prompt."
      : null,
    refetch: () => refetch(),
  };
}

"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CAPABILITY } from "@/lib/ritual/constants";
import type { Address } from "viem";

/**
 * useExecutor — discovers a TEE executor for a Ritual precompile capability.
 *
 * Hits the backend route GET /api/executor?capability=N which reads from TEEServiceRegistry
 * (0x9644...). Used before every precompile submit: the returned `teeAddress` becomes the
 * `executor` field of the LLM/Image precompile input, and the returned `publicKey` can be
 * used as `userPublicKey` for executor-side ECIES (we currently leave userPublicKey empty
 * and encrypt on the client side instead).
 *
 * capability: 1=LLM (default), 7=IMAGE_CALL.
 */

export interface TeeExecutor {
  teeAddress: Address;
  publicKey: `0x${string}`;
  endpoint: string;
  isValid: boolean;
}

interface ExecutorResponse {
  capability: number;
  capabilityName?: string;
  found: boolean;
  executor?: TeeExecutor;
  registry?: string;
  message?: string;
  error?: string;
}

export interface UseExecutorResult {
  executor: TeeExecutor | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useExecutor(
  capability: number = CAPABILITY.LLM,
  options?: { enabled?: boolean },
): UseExecutorResult {
  const enabled = options?.enabled ?? true;

  const { data, isLoading, error, refetch } = useQuery<ExecutorResponse>({
    queryKey: ["purrcha", "executor", capability],
    queryFn: async () => {
      const res = await fetch(`/api/executor?capability=${capability}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? body?.error ?? `Executor lookup failed (${res.status})`);
      }
      return (await res.json()) as ExecutorResponse;
    },
    enabled,
    staleTime: 30_000, // executors rotate slowly
    retry: 1,
  });

  return {
    executor: data?.found && data.executor ? data.executor : null,
    isLoading,
    error: error ? (error as Error).message : data && !data.found ? data.message ?? "No executor" : null,
    refetch: () => refetch(),
  };
}

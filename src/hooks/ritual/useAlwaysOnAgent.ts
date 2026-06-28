"use client";

/**
 * useAlwaysOnAgent — ensures a sovereign agent job is always running.
 *
 * REFACTOR: All toast calls moved OUT of setState updaters and into
 * a separate useEffect that watches state transitions. This fixes the
 * "Cannot update ToastContainer while rendering AlwaysOnAgentPanel" error.
 *
 * State updater functions (passed to setState) must be PURE — no side effects.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { usePublicClient, useAccount } from "wagmi";
import { decodeAbiParameters, type Hex } from "viem";
import { SOVEREIGN_AGENT_CONSUMER_ADDRESS } from "@/lib/ritual/constants";
import { useBalanceStore } from "@/stores/balanceStore";
import { toast } from "@/components/ritual/Toast";

const CONSUMER_ABI = [
  { name: "lastJobId", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "lastResult", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes" }] },
] as const;

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 15_000;

export interface AgentExecutionRecord {
  jobId: string;
  success: boolean;
  error: string;
  text: string;
  timestamp: number;
}

export interface AlwaysOnAgentState {
  enabled: boolean;
  prompt: string;
  model: string;
  intervalMs: number;
  executions: AgentExecutionRecord[];
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  lastExecution: AgentExecutionRecord | null;
  nextRunAt: number | null;
  isSubmitting: boolean;
  pausedReason: "none" | "critical_balance" | "pending_job" | "disabled";
}

const initialState: AlwaysOnAgentState = {
  enabled: false,
  prompt: "Monitor Ritual Chain block production and report any anomalies in the last 5 minutes.",
  model: "zai-org/GLM-4.7-FP8",
  intervalMs: DEFAULT_INTERVAL_MS,
  executions: [],
  totalExecutions: 0,
  successCount: 0,
  failureCount: 0,
  lastExecution: null,
  nextRunAt: null,
  isSubmitting: false,
  pausedReason: "disabled",
};

const STORAGE_KEY = "purrcha.always_on_agent";

export function useAlwaysOnAgent() {
  const publicClient = usePublicClient();
  const { isConnected } = useAccount();
  const balance = useBalanceStore();
  const [state, setState] = useState<AlwaysOnAgentState>(initialState);
  const lastJobIdSeen = useRef<Hex | null>(null);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastToastJobId = useRef<string | null>(null);

  // Load persisted config
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setState((s) => ({
          ...s,
          prompt: parsed.prompt ?? s.prompt,
          model: parsed.model ?? s.model,
          intervalMs: parsed.intervalMs ?? s.intervalMs,
          enabled: false,
        }));
      }
    } catch {}
  }, []);

  // Persist config
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        prompt: state.prompt,
        model: state.model,
        intervalMs: state.intervalMs,
      }));
    } catch {}
  }, [state.prompt, state.model, state.intervalMs]);

  // Poll contract for job completion — PURE setState, NO toast calls inside.
  useEffect(() => {
    if (!publicClient || !SOVEREIGN_AGENT_CONSUMER_ADDRESS) return;

    const poll = async () => {
      try {
        const [jobId, resultBytes] = await Promise.all([
          publicClient.readContract({
            address: SOVEREIGN_AGENT_CONSUMER_ADDRESS,
            abi: CONSUMER_ABI,
            functionName: "lastJobId",
          }) as Promise<Hex>,
          publicClient.readContract({
            address: SOVEREIGN_AGENT_CONSUMER_ADDRESS,
            abi: CONSUMER_ABI,
            functionName: "lastResult",
          }) as Promise<Hex>,
        ]);

        if (jobId !== ZERO_BYTES32 && jobId !== lastJobIdSeen.current) {
          lastJobIdSeen.current = jobId;

          let success = false;
          let error = "";
          let text = "";
          try {
            const decoded = decodeAbiParameters(
              [{ type: "bool" }, { type: "string" }, { type: "string" }],
              resultBytes,
            );
            success = decoded[0];
            error = decoded[1];
            text = decoded[2];
          } catch {
            text = `Raw: ${resultBytes.slice(0, 100)}...`;
          }

          const record: AgentExecutionRecord = {
            jobId,
            success,
            error,
            text,
            timestamp: Date.now(),
          };

          // PURE state update — NO toast calls here.
          setState((s) => {
            const executions = [record, ...s.executions].slice(0, 50);
            return {
              ...s,
              executions,
              totalExecutions: s.totalExecutions + 1,
              successCount: s.successCount + (success ? 1 : 0),
              failureCount: s.failureCount + (success ? 0 : 1),
              lastExecution: record,
              nextRunAt: s.enabled ? Date.now() + s.intervalMs : null,
              isSubmitting: false,
            };
          });
        }
      } catch {
        // ignore poll errors
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [publicClient]);

  // TOAST NOTIFICATION EFFECT — fires AFTER state commit, not during render.
  // Watches lastExecution changes and emits exactly one toast per job.
  useEffect(() => {
    if (!state.lastExecution) return;
    if (lastToastJobId.current === state.lastExecution.jobId) return;
    lastToastJobId.current = state.lastExecution.jobId;

    if (state.lastExecution.success && !state.lastExecution.error) {
      toast.success("Agent completed", `Job ${state.lastExecution.jobId.slice(0, 10)}… succeeded.`);
    } else if (state.lastExecution.success && state.lastExecution.error) {
      toast.warning("Agent completed with error", state.lastExecution.error.slice(0, 100));
    } else {
      toast.error("Agent failed", state.lastExecution.error.slice(0, 100));
    }
  }, [state.lastExecution]);

  // Determine paused reason — PURE state update only.
  useEffect(() => {
    setState((s) => {
      if (!s.enabled) return { ...s, pausedReason: "disabled" as const, nextRunAt: null };
      if (balance.health === "critical") return { ...s, pausedReason: "critical_balance" as const, nextRunAt: null };
      if (s.isSubmitting) return { ...s, pausedReason: "pending_job" as const };
      return { ...s, pausedReason: "none" as const };
    });
  }, [state.enabled, balance.health, state.isSubmitting]);

  // Submit job function — toast calls are in async callbacks, NOT in render.
  const submitJob = useCallback(async () => {
    if (state.isSubmitting) return;
    if (balance.health === "critical") {
      toast.warning("Agent paused", "Balance critical — auto-submit paused.");
      return;
    }

    setState((s) => ({ ...s, isSubmitting: true }));
    toast.info("Submitting agent job", `Prompt: ${state.prompt.slice(0, 40)}…`);

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: state.prompt, model: state.model }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success("Agent submitted", `TX: ${data.txHash?.slice(0, 10) ?? ""}…`);
      } else {
        toast.error("Agent submit failed", data.error || "Unknown error");
        setState((s) => ({ ...s, isSubmitting: false, nextRunAt: Date.now() + s.intervalMs }));
      }
    } catch (e) {
      toast.error("Agent error", e instanceof Error ? e.message : String(e));
      setState((s) => ({ ...s, isSubmitting: false, nextRunAt: Date.now() + s.intervalMs }));
    }
  }, [state.isSubmitting, state.prompt, state.model, state.intervalMs, balance.health]);

  // Schedule next job — uses submitJob in a timer, not during render.
  useEffect(() => {
    if (submitTimer.current) {
      clearTimeout(submitTimer.current);
      submitTimer.current = null;
    }

    if (!state.enabled || state.pausedReason !== "none" || !isConnected) return;
    if (!state.nextRunAt) return;

    const delay = state.nextRunAt - Date.now();
    if (delay <= 0) {
      void submitJob();
      return;
    }

    submitTimer.current = setTimeout(() => {
      void submitJob();
    }, Math.min(delay, 60_000));

    return () => {
      if (submitTimer.current) clearTimeout(submitTimer.current);
    };
  }, [state.enabled, state.pausedReason, state.nextRunAt, isConnected, submitJob]);

  const enable = useCallback(() => {
    setState((s) => ({ ...s, enabled: true, nextRunAt: Date.now() + 5000, pausedReason: "none" }));
    toast.success("Always-on enabled", "Agent will run continuously at the configured interval.");
  }, []);

  const disable = useCallback(() => {
    setState((s) => ({ ...s, enabled: false, nextRunAt: null, pausedReason: "disabled", isSubmitting: false }));
    if (submitTimer.current) {
      clearTimeout(submitTimer.current);
      submitTimer.current = null;
    }
    toast.info("Always-on disabled", "Agent auto-submit stopped.");
  }, []);

  type ConfigUpdate = Partial<Pick<AlwaysOnAgentState, "prompt" | "model" | "intervalMs">>;
  const updateConfig = useCallback((partial: ConfigUpdate) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);

  const runNow = useCallback(async () => {
    if (state.isSubmitting) return;
    await submitJob();
  }, [state.isSubmitting, submitJob]);

  return {
    ...state,
    balance,
    enable,
    disable,
    updateConfig,
    runNow,
    successRate: state.totalExecutions > 0
      ? Math.round((state.successCount / state.totalExecutions) * 100)
      : 0,
  };
}

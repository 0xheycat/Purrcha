"use client";

/**
 * AgentLogsPanel — shows REAL on-chain sovereign agent job logs from the deployed
 * SovereignAgentConsumer contract.
 *
 * Fetches lastJobId + lastResult from the contract (via viem publicClient), decodes
 * the result (bool success, string error, string text), and displays it in a
 * scrollable terminal-style log.
 *
 * Also polls for new jobs every 15s. All data is REAL — no mock logs.
 */

import { useEffect, useState, useCallback } from "react";
import { usePublicClient } from "wagmi";
import { decodeAbiParameters, type Hex } from "viem";
import { SOVEREIGN_AGENT_CONSUMER_ADDRESS } from "@/lib/ritual/constants";
import { Terminal, RefreshCw, ExternalLink, CheckCircle2, XCircle, Loader2, Cpu } from "lucide-react";
import { RITUAL_EXPLORER_URL } from "@/lib/ritual/constants";

interface AgentLog {
  jobId: string;
  success: boolean;
  error: string;
  text: string;
  blockNumber: bigint | null;
  txHash: string | null;
  timestamp: number;
}

interface AgentLogsState {
  logs: AgentLog[];
  isLoading: boolean;
  error: string | null;
  lastFetch: number;
}

const CONSUMER_ABI = [
  { name: "lastJobId", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "lastResult", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes" }] },
] as const;

export function AgentLogsPanel() {
  const publicClient = usePublicClient();
  const [state, setState] = useState<AgentLogsState>({
    logs: [],
    isLoading: true,
    error: null,
    lastFetch: 0,
  });

  const fetchLogs = useCallback(async () => {
    if (!publicClient || !SOVEREIGN_AGENT_CONSUMER_ADDRESS) {
      setState((s) => ({ ...s, isLoading: false, error: "Agent contract not configured" }));
      return;
    }

    try {
      // Fetch lastJobId + lastResult from the contract
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

      // Decode result: (bool success, string error, string text, ...)
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
        // If decode fails, show raw hex
        text = `Raw: ${resultBytes.slice(0, 100)}...`;
      }

      // Only add if jobId is non-zero (a job has been submitted)
      if (jobId === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        setState((s) => ({
          logs: s.logs,
          isLoading: false,
          error: null,
          lastFetch: Date.now(),
        }));
        return;
      }

      const log: AgentLog = {
        jobId,
        success,
        error,
        text,
        blockNumber: null,
        txHash: null,
        timestamp: Date.now(),
      };

      // Dedup by jobId
      setState((s) => {
        if (s.logs.some((l) => l.jobId === jobId)) return s;
        return {
          logs: [log, ...s.logs].slice(0, 50), // keep last 50
          isLoading: false,
          error: null,
          lastFetch: Date.now(),
        };
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: e instanceof Error ? e.message : String(e),
        lastFetch: Date.now(),
      }));
    }
  }, [publicClient]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  return (
    <div className="terminal-card p-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 bg-ritual-elevated/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-ritual-pink" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-300 font-semibold">
            agent_logs
          </span>
          <span className="font-mono text-[9px] text-gray-600">
            · sovereign 0x080C
          </span>
        </div>
        <div className="flex items-center gap-2">
          {state.logs.length > 0 && (
            <span className="font-mono text-[9px] text-gray-500">
              {state.logs.length} {state.logs.length === 1 ? "job" : "jobs"}
            </span>
          )}
          <button
            type="button"
            onClick={fetchLogs}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-ritual-green hover:bg-gray-800 transition-colors"
            aria-label="Refresh agent logs"
          >
            <RefreshCw className={`w-3 h-3 ${state.isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Contract address */}
      {SOVEREIGN_AGENT_CONSUMER_ADDRESS && (
        <div className="px-4 py-1.5 border-b border-gray-800/50 bg-ritual-elevated/20 flex items-center gap-2">
          <Cpu className="w-2.5 h-2.5 text-gray-600" aria-hidden="true" />
          <span className="font-mono text-[9px] text-gray-600 uppercase tracking-wider">
            contract
          </span>
          <span className="font-mono text-[9px] text-gray-500 truncate flex-1">
            {SOVEREIGN_AGENT_CONSUMER_ADDRESS}
          </span>
          <a
            href={`${RITUAL_EXPLORER_URL}/address/${SOVEREIGN_AGENT_CONSUMER_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="text-gray-600 hover:text-ritual-green transition-colors flex-shrink-0"
            aria-label="View on explorer"
          >
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      )}

      {/* Body */}
      <div className="max-h-80 overflow-y-auto scrollbar-thin">
        {state.isLoading ? (
          <div className="px-4 py-6 flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-ritual-green animate-spin" aria-hidden="true" />
            <span className="font-mono text-[10px] text-gray-500 uppercase tracking-wider">
              fetching agent logs…
            </span>
          </div>
        ) : state.error ? (
          <div className="px-4 py-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-3.5 h-3.5 text-ritual-red" aria-hidden="true" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-ritual-red">
                fetch_error
              </span>
            </div>
            <p className="font-mono text-[10px] text-gray-500 break-words">{state.error}</p>
          </div>
        ) : state.logs.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <div className="font-mono text-[10px] text-gray-600 uppercase tracking-wider mb-2">
              no_agent_jobs
            </div>
            <p className="font-mono text-[10px] text-gray-500 leading-relaxed">
              No sovereign agent jobs detected.
              <br />
              Run a job via the scheduler or script.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/30">
            {state.logs.map((log, i) => (
              <AgentLogEntry key={`${log.jobId}-${i}`} log={log} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 border-t border-gray-800 bg-ritual-elevated/30 flex items-center justify-between">
        <span className="font-mono text-[9px] text-gray-600 uppercase tracking-wider">
          auto-refresh 15s
        </span>
        {state.lastFetch > 0 && (
          <span className="font-mono text-[9px] text-gray-700">
            {new Date(state.lastFetch).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

function AgentLogEntry({ log }: { log: AgentLog }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = !log.success || (log.error && log.error.length > 0);

  return (
    <div className={`px-4 py-2.5 hover:bg-ritual-elevated/20 transition-colors ${hasError ? "bg-ritual-red/5" : ""}`}>
      <div className="flex items-center gap-2 mb-1">
        {log.success ? (
          <CheckCircle2 className="w-3 h-3 text-ritual-green flex-shrink-0" aria-hidden="true" />
        ) : (
          <XCircle className="w-3 h-3 text-ritual-red flex-shrink-0" aria-hidden="true" />
        )}
        <span className={`font-mono text-[10px] uppercase tracking-wider font-semibold ${log.success ? "text-ritual-green" : "text-ritual-red"}`}>
          {log.success ? "success" : "failed"}
        </span>
        <span className="font-mono text-[9px] text-gray-600 truncate flex-1">
          job {log.jobId.slice(0, 10)}…{log.jobId.slice(-4)}
        </span>
        <span className="font-mono text-[9px] text-gray-700">
          {new Date(log.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {/* Result text */}
      {log.text && (
        <div className="mt-1">
          <div className={`font-mono text-[10px] text-gray-400 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
            {log.text}
          </div>
          {log.text.length > 100 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="font-mono text-[9px] text-ritual-green/70 hover:text-ritual-green mt-0.5"
            >
              {expanded ? "▾ collapse" : "▸ expand"}
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {log.error && log.error.length > 0 && (
        <div className="mt-1 font-mono text-[10px] text-ritual-red/80 leading-relaxed break-words">
          <span className="font-semibold">ERROR: </span>
          {log.error.slice(0, 300)}
          {log.error.length > 300 && "..."}
        </div>
      )}
    </div>
  );
}

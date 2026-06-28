"use client";

/**
 * NetworkStatusWidget — a live dashboard showing real Ritual Chain metrics.
 * Pulls from /api/health + /api/chain + /api/executor. Auto-refreshes every 12s.
 *
 * Shows: chain ID, current block, RPC latency, RitualWallet balance, executor availability
 * (LLM + Image), and contract deployment status. All values are REAL — no mock data.
 */

import { useEffect, useState } from "react";
import { Activity, Box, Cpu, Zap, Wallet, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface NetworkData {
  chainId: number | null;
  blockNumber: string | null;
  rpcOk: boolean;
  rpcLatencyMs: number | null;
  ritualWalletBalance: string | null;
  ritualWalletLocked: boolean | null;
  llmExecutorAvailable: boolean | null;
  imageExecutorAvailable: boolean | null;
  contractDeployed: boolean;
  contractAddress: string | null;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_DATA: NetworkData = {
  chainId: null,
  blockNumber: null,
  rpcOk: false,
  rpcLatencyMs: null,
  ritualWalletBalance: null,
  ritualWalletLocked: null,
  llmExecutorAvailable: null,
  imageExecutorAvailable: null,
  contractDeployed: false,
  contractAddress: null,
  isLoading: true,
  error: null,
};

export function NetworkStatusWidget({ address }: { address?: string }) {
  const [data, setData] = useState<NetworkData>(DEFAULT_DATA);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      try {
        const [healthRes, chainRes, llmRes, imgRes] = await Promise.all([
          fetch("/api/health").then((r) => r.json()).catch(() => null),
          fetch(`/api/chain${address ? `?address=${address}` : ""}`).then((r) => r.json()).catch(() => null),
          fetch("/api/executor?capability=1").then((r) => r.json()).catch(() => null),
          fetch("/api/executor?capability=7").then((r) => r.json()).catch(() => null),
        ]);

        if (cancelled) return;

        setData({
          chainId: healthRes?.chain?.id ?? null,
          blockNumber: healthRes?.chain?.blockNumber ?? chainRes?.blockNumber ?? null,
          rpcOk: healthRes?.chain?.rpcOk ?? false,
          rpcLatencyMs: healthRes?.latencyMs ?? null,
          ritualWalletBalance: chainRes?.ritualWallet?.balance ?? null,
          ritualWalletLocked: chainRes?.ritualWallet?.isLocked ?? null,
          llmExecutorAvailable: llmRes?.found ?? false,
          imageExecutorAvailable: imgRes?.found ?? false,
          contractDeployed: healthRes?.contractDeployed ?? false,
          contractAddress: healthRes?.contractAddress ?? null,
          isLoading: false,
          error: null,
        });
      } catch (e) {
        if (!cancelled) {
          setData((d) => ({ ...d, isLoading: false, error: e instanceof Error ? e.message : String(e) }));
        }
      }
    }

    fetchAll();
    const interval = setInterval(fetchAll, 12000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address]);

  if (data.isLoading) {
    return (
      <div className="terminal-card p-4 flex items-center gap-3">
        <Loader2 className="w-4 h-4 text-ritual-green animate-spin" aria-hidden="true" />
        <span className="font-mono text-[11px] text-gray-500 uppercase tracking-wider">
          fetching chain status…
        </span>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="terminal-card p-4 border-ritual-red/40">
        <div className="flex items-center gap-2 mb-1">
          <XCircle className="w-4 h-4 text-ritual-red" aria-hidden="true" />
          <span className="font-mono text-[11px] text-ritual-red uppercase tracking-wider">network_error</span>
        </div>
        <p className="font-mono text-[10px] text-gray-500">{data.error}</p>
      </div>
    );
  }

  return (
    <div className="terminal-card p-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 bg-ritual-elevated/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-ritual-green" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-300 font-semibold">
            network_status
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${data.rpcOk ? "bg-ritual-green animate-pulse" : "bg-ritual-red"}`} />
          <span className="font-mono text-[9px] uppercase tracking-wider text-gray-500">
            {data.rpcOk ? "live" : "down"}
          </span>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-px bg-gray-800/50">
        <Metric
          icon={<Box className="w-3 h-3" />}
          label="chain_id"
          value={data.chainId?.toString() ?? "—"}
          color="green"
        />
        <Metric
          icon={<Zap className="w-3 h-3" />}
          label="block"
          value={data.blockNumber ? formatBlock(data.blockNumber) : "—"}
          color="lime"
          mono
        />
        <Metric
          icon={<Activity className="w-3 h-3" />}
          label="rpc_latency"
          value={data.rpcLatencyMs != null ? `${data.rpcLatencyMs}ms` : "—"}
          color={data.rpcLatencyMs != null && data.rpcLatencyMs < 800 ? "green" : "gold"}
          mono
        />
        <Metric
          icon={<Wallet className="w-3 h-3" />}
          label="escrow"
          value={data.ritualWalletBalance ? `${data.ritualWalletBalance} R` : "—"}
          color="gold"
          mono
        />
        <Metric
          icon={<Cpu className="w-3 h-3" />}
          label="llm_exec"
          value={data.llmExecutorAvailable ? "available" : "none"}
          color={data.llmExecutorAvailable ? "green" : "red"}
          status={data.llmExecutorAvailable}
        />
        <Metric
          icon={<Cpu className="w-3 h-3" />}
          label="img_exec"
          value={data.imageExecutorAvailable ? "available" : "none"}
          color={data.imageExecutorAvailable ? "green" : "red"}
          status={data.imageExecutorAvailable}
        />
      </div>

      {/* Contract status footer */}
      <div className="px-4 py-2 border-t border-gray-800 bg-ritual-elevated/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {data.contractDeployed ? (
            <CheckCircle2 className="w-3 h-3 text-ritual-green" aria-hidden="true" />
          ) : (
            <XCircle className="w-3 h-3 text-ritual-red" aria-hidden="true" />
          )}
          <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
            contract
          </span>
        </div>
        <span className="font-mono text-[10px] text-gray-500">
          {data.contractAddress
            ? `${data.contractAddress.slice(0, 8)}…${data.contractAddress.slice(-4)}`
            : "not deployed"}
        </span>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  color,
  mono,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "green" | "lime" | "gold" | "red";
  mono?: boolean;
  status?: boolean | null;
}) {
  const colorClass =
    color === "green"
      ? "text-ritual-green"
      : color === "lime"
        ? "text-ritual-lime"
        : color === "gold"
          ? "text-ritual-gold"
          : "text-ritual-red";
  return (
    <div className="bg-bg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={colorClass} aria-hidden="true">{icon}</span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-gray-500">{label}</span>
      </div>
      <div className={`text-[13px] ${mono ? "font-mono tabular-nums" : "font-mono"} ${colorClass} font-semibold`}>
        {value}
      </div>
      {status !== undefined && status !== null && (
        <div className="mt-0.5">
          {status ? (
            <span className="inline-flex items-center gap-0.5 font-mono text-[8px] uppercase text-ritual-green/70">
              <CheckCircle2 className="w-2 h-2" /> ok
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 font-mono text-[8px] uppercase text-ritual-red/70">
              <XCircle className="w-2 h-2" /> unavailable
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatBlock(block: string): string {
  const n = BigInt(block);
  if (n < 1000n) return n.toString();
  if (n < 1_000_000n) return `${(Number(n) / 1000).toFixed(1)}K`;
  return `${(Number(n) / 1_000_000).toFixed(2)}M`;
}

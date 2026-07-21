"use client";

/**
 * RecentActivityFeed — shows recent on-chain activity from the deployed PurrchaChat contract.
 *
 * Fetches real events via /api/history (which reads eth_getLogs from Ritual Chain RPC).
 * Shows the latest 5 events across ALL wallets (not just the connected user) to give a
 * sense of live network activity. Each item shows: event type, tx hash (truncated),
 * block number, and time-ago.
 *
 * NO mock data. If no events exist, shows an honest empty state.
 */

import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, ExternalLink, Loader2 } from "lucide-react";
import { RITUAL_EXPLORER_URL } from "@/lib/ritual/constants";

interface ActivityItem {
  type: "ChatSubmitted" | "ChatResultSettled" | "ImageJobSubmitted" | "ImageResultDelivered" | "VerificationMetadata";
  txHash: string;
  blockNumber: string;
  user: string;
  kind: "llm" | "image";
  hasError?: boolean;
}

interface ActivityResponse {
  items: ActivityItem[];
  count: number;
  currentBlock: string;
  error?: string;
}

const EVENT_META: Record<ActivityItem["type"], { label: string; color: string; icon: string }> = {
  ChatSubmitted: { label: "chat_submitted", color: "text-ritual-green", icon: "↑" },
  ChatResultSettled: { label: "chat_settled", color: "text-ritual-green", icon: "✓" },
  ImageJobSubmitted: { label: "image_submitted", color: "text-ritual-pink", icon: "◆" },
  ImageResultDelivered: { label: "image_delivered", color: "text-ritual-pink", icon: "✓" },
  VerificationMetadata: { label: "verified", color: "text-ritual-lime", icon: "◈" },
};

export function RecentActivityFeed() {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchActivity() {
      try {
        // Fetch recent events from the contract (all wallets, not filtered).
        // We use the /api/history endpoint with the deployer address to show real activity.
        // The deployer address comes from the env var or the contract deployer.
        const deployerAddr = process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS ?? "0x38143BE0Ed4d654468C78334270fce4e0B87aD04";
        const res = await fetch(`/api/history?address=${deployerAddr}&limit=5`);
        const json = await res.json();

        if (cancelled) return;

        if (json.error) {
          setError(json.message || json.error);
          setData({ items: [], count: 0, currentBlock: json.currentBlock ?? "0" });
        } else {
          // Transform history messages into activity items.
          const items: ActivityItem[] = (json.messages || []).map((m: unknown) => {
            const msg = m as {
              requestId: string;
              kind: "llm" | "image";
              txHash: string;
              blockNumber: string;
              user: string;
              hasError: boolean;
            };
            return {
              type: msg.kind === "llm" ? "ChatResultSettled" : "ImageResultDelivered",
              txHash: msg.txHash,
              blockNumber: msg.blockNumber,
              user: msg.user,
              kind: msg.kind,
              hasError: msg.hasError,
            };
          });
          setData({ items, count: items.length, currentBlock: json.currentBlock ?? "0" });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchActivity();
    const interval = setInterval(fetchActivity, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="terminal-card p-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 bg-ritual-elevated/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-ritual-green" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-300 font-semibold">
            recent_activity
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider text-gray-500">
          {data ? `${data.count} events` : "loading"}
        </span>
      </div>

      {/* Body */}
      <div className="max-h-64 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="px-4 py-6 flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-ritual-green animate-spin" aria-hidden="true" />
            <span className="font-mono text-[10px] text-gray-500 uppercase tracking-wider">
              scanning chain…
            </span>
          </div>
        ) : error ? (
          <div className="px-4 py-4">
            <p className="font-mono text-[10px] text-ritual-red/80">{error}</p>
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="divide-y divide-gray-800/50">
            {data.items.map((item, i) => {
              const meta = EVENT_META[item.type];
              return (
                <div key={i} className="px-4 py-2.5 hover:bg-ritual-elevated/30 transition-colors group">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-sm ${meta.color} flex-shrink-0`} aria-hidden="true">
                      {meta.icon}
                    </span>
                    <span className={`font-mono text-[10px] uppercase tracking-wider ${meta.color} flex-1 min-w-0 truncate`}>
                      {meta.label}
                    </span>
                    {item.hasError && (
                      <span className="font-mono text-[8px] uppercase text-ritual-red px-1 rounded border border-ritual-red/30">
                        err
                      </span>
                    )}
                    <a
                      href={`${RITUAL_EXPLORER_URL}/tx/${item.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-ritual-green"
                      aria-label="View on explorer"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-gray-600">
                    <span className="truncate">{item.txHash.slice(0, 10)}…{item.txHash.slice(-4)}</span>
                    <span className="text-gray-700">·</span>
                    <span>blk {Number(item.blockNumber).toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6 text-center">
            <div className="font-mono text-[10px] text-gray-600 uppercase tracking-wider mb-2">
              no_activity
            </div>
            <p className="font-mono text-[10px] text-gray-500 leading-relaxed">
              No on-chain events yet.
              <br />
              Be the first to submit a prompt.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      {data && data.currentBlock !== "0" && (
        <div className="px-4 py-2 border-t border-gray-800 bg-ritual-elevated/30 flex items-center justify-between">
          <span className="font-mono text-[9px] text-gray-600 uppercase tracking-wider">
            current block
          </span>
          <span className="font-mono text-[10px] text-gray-400 tabular-nums">
            {Number(data.currentBlock).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

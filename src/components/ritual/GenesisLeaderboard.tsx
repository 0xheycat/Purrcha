"use client";

/**
 * GenesisLeaderboard — shows the most active PurrchaChat users on Ritual Chain.
 *
 * Fetches real on-chain data from the /api/history endpoint for the deployer address
 * and shows a ranked leaderboard of chat activity. This is for the Ritual Genesis
 * Card campaign — users who submit the most on-chain AI chats earn recognition.
 *
 * All data is REAL — no mock entries.
 */

import { useEffect, useState } from "react";
import { Trophy, Zap, MessageSquare, Shield, Loader2, ExternalLink } from "lucide-react";
import { RITUAL_CHAIN } from "@/lib/ritual/constants";

interface LeaderboardEntry {
  address: string;
  totalChats: number;
  llmChats: number;
  imageChats: number;
  verified: number;
  lastActive: number;
}

interface LeaderboardData {
  entries: LeaderboardEntry[];
  totalUsers: number;
  totalChats: number;
  isLoading: boolean;
  error: string | null;
}

export function GenesisLeaderboard() {
  const [data, setData] = useState<LeaderboardData>({
    entries: [],
    totalUsers: 0,
    totalChats: 0,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchLeaderboard() {
      try {
        // Fetch the deployer's history (real on-chain events)
        const deployerAddr = process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS ?? "0x38143BE0Ed4d654468C78334270fce4e0B87aD04";
        const res = await fetch(`/api/history?address=${deployerAddr}&limit=100`);
        const json = await res.json();

        if (cancelled) return;

        if (json.error) {
          setData({ entries: [], totalUsers: 0, totalChats: 0, isLoading: false, error: json.message || json.error });
          return;
        }

        // Build leaderboard from real messages
        const userMap = new Map<string, LeaderboardEntry>();
        for (const msg of json.messages || []) {
          const addr = (msg.user || deployerAddr).toLowerCase();
          const existing = userMap.get(addr) || {
            address: addr,
            totalChats: 0,
            llmChats: 0,
            imageChats: 0,
            verified: 0,
            lastActive: 0,
          };
          existing.totalChats++;
          if (msg.kind === "llm") existing.llmChats++;
          else existing.imageChats++;
          if (msg.verified) existing.verified++;
          existing.lastActive = Math.max(existing.lastActive, Number(msg.blockNumber || 0));
          userMap.set(addr, existing);
        }

        const entries = Array.from(userMap.values()).sort((a, b) => b.totalChats - a.totalChats).slice(0, 10);
        setData({
          entries,
          totalUsers: userMap.size,
          totalChats: entries.reduce((sum, e) => sum + e.totalChats, 0),
          isLoading: false,
          error: null,
        });
      } catch (e) {
        if (!cancelled) {
          setData((d) => ({ ...d, isLoading: false, error: e instanceof Error ? e.message : String(e) }));
        }
      }
    }

    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="terminal-card p-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 bg-gradient-to-r from-ritual-gold/10 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5 text-ritual-gold" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-300 font-semibold">
            genesis_leaderboard
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider text-ritual-gold/70">
          ritual campaign
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-px bg-gray-800/50">
        <div className="bg-bg px-3 py-2 text-center">
          <div className="font-mono text-[16px] font-bold text-ritual-green tabular-nums">{data.totalUsers}</div>
          <div className="font-mono text-[8px] uppercase tracking-wider text-gray-600">active users</div>
        </div>
        <div className="bg-bg px-3 py-2 text-center">
          <div className="font-mono text-[16px] font-bold text-ritual-lime tabular-nums">{data.totalChats}</div>
          <div className="font-mono text-[8px] uppercase tracking-wider text-gray-600">on-chain chats</div>
        </div>
      </div>

      {/* Body */}
      <div className="max-h-64 overflow-y-auto scrollbar-thin">
        {data.isLoading ? (
          <div className="px-4 py-6 flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-ritual-green animate-spin" />
            <span className="font-mono text-[10px] text-gray-500 uppercase tracking-wider">scanning chain…</span>
          </div>
        ) : data.error ? (
          <div className="px-4 py-4">
            <p className="font-mono text-[10px] text-ritual-red/80">{data.error}</p>
          </div>
        ) : data.entries.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <div className="font-mono text-[10px] text-gray-600 uppercase tracking-wider mb-2">
              no_activity_yet
            </div>
            <p className="font-mono text-[10px] text-gray-500 leading-relaxed">
              Be the first to submit an on-chain AI chat.
              <br />
              Top contributors earn the Ritual Genesis Card.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/30">
            {data.entries.map((entry, i) => (
              <div key={entry.address} className="px-4 py-2 hover:bg-ritual-elevated/20 transition-colors group">
                <div className="flex items-center gap-2">
                  {/* Rank */}
                  <span className={`font-mono text-[12px] font-bold flex-shrink-0 w-5 text-center ${
                    i === 0 ? "text-ritual-gold" : i === 1 ? "text-gray-300" : i === 2 ? "text-ritual-pink" : "text-gray-600"
                  }`}>
                    {i === 0 ? "①" : i === 1 ? "②" : i === 2 ? "③" : `${i + 1}`}
                  </span>

                  {/* Address */}
                  <a
                    href={`${RITUAL_CHAIN.blockExplorers.default.url}/address/${entry.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] text-gray-400 hover:text-ritual-green truncate flex-1"
                  >
                    {entry.address.slice(0, 6)}…{entry.address.slice(-4)}
                  </a>

                  {/* Stats badges */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="font-mono text-[9px] text-ritual-green flex items-center gap-0.5" title="LLM chats">
                      <Zap className="w-2.5 h-2.5" />
                      {entry.llmChats}
                    </span>
                    {entry.imageChats > 0 && (
                      <span className="font-mono text-[9px] text-ritual-pink flex items-center gap-0.5" title="Image chats">
                        <MessageSquare className="w-2.5 h-2.5" />
                        {entry.imageChats}
                      </span>
                    )}
                    {entry.verified > 0 && (
                      <span className="font-mono text-[9px] text-ritual-lime flex items-center gap-0.5" title="Verified">
                        <Shield className="w-2.5 h-2.5" />
                        {entry.verified}
                      </span>
                    )}
                  </div>

                  {/* Total */}
                  <span className="font-mono text-[11px] font-bold text-gray-300 tabular-nums flex-shrink-0">
                    {entry.totalChats}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-800 bg-ritual-elevated/30">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-gray-600 uppercase tracking-wider">
            auto-refresh 30s
          </span>
          <a
            href="https://x.com/ritualfnd/status/2069820943011303735"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[9px] text-ritual-gold hover:underline"
          >
            ↗ genesis card info
          </a>
        </div>
      </div>
    </div>
  );
}

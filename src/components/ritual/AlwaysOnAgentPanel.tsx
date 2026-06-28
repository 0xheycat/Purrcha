"use client";

/**
 * AlwaysOnAgentPanel — UI for the always-on sovereign agent.
 *
 * Shows:
 *   - Enable/Disable toggle
 *   - Current prompt + interval config
 *   - Execution stats (total, success, failure, success rate)
 *   - Last execution result
 *   - Next run countdown
 *   - Paused reason (if any)
 *   - Balance health indicator
 *
 * Uses useAlwaysOnAgent hook for all logic. All data is REAL.
 */

import { useState, useEffect } from "react";
import { Power, Activity, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle, Zap, Settings2 } from "lucide-react";
import { useAlwaysOnAgent } from "@/hooks/ritual/useAlwaysOnAgent";
import { useAccount } from "wagmi";

export function AlwaysOnAgentPanel() {
  const { isConnected } = useAccount();
  const agent = useAlwaysOnAgent();
  const [showConfig, setShowConfig] = useState(false);
  const [countdown, setCountdown] = useState<string>("");

  // Countdown timer
  useEffect(() => {
    if (!agent.nextRunAt || agent.pausedReason !== "none") {
      return;
    }
    const update = () => {
      const remaining = agent.nextRunAt! - Date.now();
      if (remaining <= 0) {
        setCountdown("running…");
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${mins}m ${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [agent.nextRunAt, agent.pausedReason]);

  const healthColor =
    agent.balance.health === "healthy" ? "text-ritual-green"
      : agent.balance.health === "low" ? "text-ritual-gold"
        : agent.balance.health === "critical" ? "text-ritual-red"
          : "text-gray-500";

  return (
    <div className={`terminal-card p-0 overflow-hidden ${agent.enabled ? "border-ritual-green/30" : ""}`}>
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 bg-ritual-elevated/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Power className={`w-3.5 h-3.5 ${agent.enabled ? "text-ritual-green" : "text-gray-500"}`} aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-300 font-semibold">
            always_on_agent
          </span>
          <span className="font-mono text-[9px] text-gray-600">
            · sovereign 0x080C
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            aria-label="Configure agent"
          >
            <Settings2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={agent.enabled ? agent.disable : agent.enable}
            disabled={!isConnected}
            className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded border transition-all disabled:opacity-50 ${
              agent.enabled
                ? "border-ritual-red/40 text-ritual-red hover:bg-ritual-red/10"
                : "border-ritual-green/40 text-ritual-green hover:bg-ritual-green/10"
            }`}
            aria-label={agent.enabled ? "Disable always-on agent" : "Enable always-on agent"}
          >
            {agent.enabled ? <><Power className="w-3 h-3" /> Stop</> : <><Power className="w-3 h-3" /> Start</>}
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="px-4 py-3 border-b border-gray-800 space-y-3 fade-in">
          <div>
            <label className="font-mono text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">
              prompt
            </label>
            <textarea
              value={agent.prompt}
              onChange={(e) => agent.updateConfig({ prompt: e.target.value })}
              rows={2}
              className="terminal-input w-full px-2 py-1.5 text-[11px] resize-y"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">
                model
              </label>
              <input
                type="text"
                value={agent.model}
                onChange={(e) => agent.updateConfig({ model: e.target.value })}
                className="terminal-input w-full px-2 py-1 text-[10px]"
              />
            </div>
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">
                interval (min)
              </label>
              <input
                type="number"
                value={Math.floor(agent.intervalMs / 60000)}
                onChange={(e) => agent.updateConfig({ intervalMs: (parseInt(e.target.value) || 5) * 60000 })}
                min={1}
                max={1440}
                className="terminal-input w-full px-2 py-1 text-[10px]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Status row */}
      <div className="px-4 py-2.5 border-b border-gray-800/50">
        <div className="grid grid-cols-4 gap-2">
          <Stat label="total" value={agent.totalExecutions.toString()} color="text-gray-300" />
          <Stat label="success" value={agent.successCount.toString()} color="text-ritual-green" />
          <Stat label="failed" value={agent.failureCount.toString()} color="text-ritual-red" />
          <Stat label="rate" value={`${agent.successRate}%`} color={agent.successRate >= 80 ? "text-ritual-green" : agent.successRate >= 50 ? "text-ritual-gold" : "text-ritual-red"} />
        </div>
      </div>

      {/* Balance health */}
      <div className="px-4 py-2 border-b border-gray-800/50 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${healthColor.replace("text-", "bg-")} ${agent.balance.health === "healthy" ? "" : "animate-pulse"}`} />
        <span className="font-mono text-[9px] uppercase tracking-wider text-gray-500">
          balance
        </span>
        <span className={`font-mono text-[10px] font-semibold ${healthColor}`}>
          {agent.balance.health}
        </span>
        {agent.balance.escrowBalance && (
          <span className="font-mono text-[9px] text-gray-600 ml-auto">
            escrow: {parseFloat(agent.balance.escrowBalance).toFixed(3)} R
          </span>
        )}
      </div>

      {/* Paused reason */}
      {agent.pausedReason !== "none" && agent.enabled && (
        <div className="px-4 py-2 border-b border-gray-800/50 flex items-center gap-2 bg-ritual-gold/5">
          <AlertTriangle className="w-3 h-3 text-ritual-gold flex-shrink-0" />
          <span className="font-mono text-[10px] text-ritual-gold">
            {agent.pausedReason === "critical_balance" && "Paused: balance critical — refill RitualWallet to resume."}
            {agent.pausedReason === "pending_job" && "Paused: waiting for current job to complete."}
          </span>
        </div>
      )}

      {/* Next run / current job */}
      <div className="px-4 py-2 border-b border-gray-800/50">
        {agent.isSubmitting ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 text-ritual-green animate-spin" />
            <span className="font-mono text-[10px] text-ritual-green uppercase tracking-wider">
              submitting job…
            </span>
          </div>
        ) : agent.enabled && agent.pausedReason === "none" && countdown ? (
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-ritual-lime" />
            <span className="font-mono text-[10px] text-gray-400 uppercase tracking-wider">
              next run in
            </span>
            <span className="font-mono text-[11px] text-ritual-lime font-semibold tabular-nums">
              {countdown}
            </span>
            <button
              type="button"
              onClick={agent.runNow}
              className="ml-auto font-mono text-[9px] uppercase tracking-wider text-ritual-green hover:underline"
            >
              run now
            </button>
          </div>
        ) : agent.enabled ? (
          <div className="flex items-center gap-2">
            <Activity className="w-3 h-3 text-ritual-gold" />
            <span className="font-mono text-[10px] text-gray-500 uppercase tracking-wider">
              {agent.pausedReason === "disabled" ? "disabled" : "monitoring…"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Power className="w-3 h-3 text-gray-600" />
            <span className="font-mono text-[10px] text-gray-600 uppercase tracking-wider">
              disabled — click start to enable
            </span>
          </div>
        )}
      </div>

      {/* Last execution */}
      {agent.lastExecution && (
        <div className="px-4 py-2">
          <div className="flex items-center gap-2 mb-1">
            {agent.lastExecution.success ? (
              <CheckCircle2 className="w-3 h-3 text-ritual-green" />
            ) : (
              <XCircle className="w-3 h-3 text-ritual-red" />
            )}
            <span className={`font-mono text-[9px] uppercase tracking-wider font-semibold ${agent.lastExecution.success ? "text-ritual-green" : "text-ritual-red"}`}>
              last: {agent.lastExecution.success ? "success" : "failed"}
            </span>
            <span className="font-mono text-[9px] text-gray-600 ml-auto">
              {new Date(agent.lastExecution.timestamp).toLocaleTimeString()}
            </span>
          </div>
          {(agent.lastExecution.text || agent.lastExecution.error) && (
            <p className="font-mono text-[10px] text-gray-500 leading-relaxed line-clamp-2">
              {agent.lastExecution.error || agent.lastExecution.text}
            </p>
          )}
        </div>
      )}

      {/* Recent executions sparkline */}
      {agent.executions.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-800/50">
          <div className="font-mono text-[9px] uppercase tracking-wider text-gray-600 mb-1">
            recent
          </div>
          <div className="flex items-center gap-0.5">
            {agent.executions.slice(0, 20).map((exec, i) => (
              <div
                key={i}
                className={`w-1.5 h-4 rounded-sm ${exec.success ? "bg-ritual-green/60" : "bg-ritual-red/60"}`}
                title={`${exec.success ? "Success" : "Failed"}: ${new Date(exec.timestamp).toLocaleTimeString()}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`font-mono text-[14px] font-bold tabular-nums ${color}`}>{value}</div>
      <div className="font-mono text-[8px] uppercase tracking-wider text-gray-600">{label}</div>
    </div>
  );
}

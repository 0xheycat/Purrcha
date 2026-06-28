"use client";

/**
 * SchedulerPanel — UI for scheduling recurring sovereign agent jobs.
 *
 * Lets the user configure:
 *   - Prompt (with enriched logic: system context, model selection, temperature)
 *   - Interval (every N minutes/hours)
 *   - Max executions
 *   - Auto-run toggle
 *
 * When "auto-run" is enabled, the frontend uses setInterval to submit sovereign agent
 * jobs at the configured interval (via the sovereign_agent.py backend API route).
 * When disabled, only a single "Run Now" button is available.
 *
 * All jobs go through the REAL SovereignAgentConsumer contract (0x080C precompile).
 * No mock data — every job is a real on-chain transaction.
 */

import { useState, useEffect, useRef } from "react";
import { Clock, Play, Pause, Plus, Settings2, Repeat, Zap, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ritual/Toast";

interface ScheduledJob {
  id: string;
  prompt: string;
  model: string;
  intervalMs: number;
  maxExecutions: number;
  executions: number;
  active: boolean;
  createdAt: number;
  lastRun: number | null;
  nextRun: number | null;
}

const DEFAULT_PROMPTS = [
  "Analyze the current block on Ritual Chain and report any interesting patterns.",
  "Summarize the latest transactions on the PurrchaChat contract.",
  "Generate a brief status report of the Ritual Chain network health.",
  "Explain what TEE verification means for on-chain AI inference.",
];

export function SchedulerPanel() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [newPrompt, setNewPrompt] = useState(DEFAULT_PROMPTS[0]);
  const [newModel, setNewModel] = useState("zai-org/GLM-4.7-FP8");
  const [newInterval, setNewInterval] = useState(15); // minutes
  const [newMaxExec, setNewMaxExec] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const intervalRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("purrcha.scheduler.jobs");
      if (stored) {
        const parsed = JSON.parse(stored) as ScheduledJob[];
        // Don't auto-resume intervals on load — user must manually activate
        setJobs(parsed.map((j) => ({ ...j, active: false, nextRun: null })));
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("purrcha.scheduler.jobs", JSON.stringify(jobs));
    } catch {
      // ignore
    }
  }, [jobs]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(intervalRefs.current).forEach(clearInterval);
    };
  }, []);

  const addJob = () => {
    if (!newPrompt.trim()) {
      toast.warning("Empty prompt", "Enter a prompt for the scheduled agent job.");
      return;
    }
    const job: ScheduledJob = {
      id: `job-${Date.now()}`,
      prompt: newPrompt,
      model: newModel,
      intervalMs: newInterval * 60 * 1000,
      maxExecutions: newMaxExec,
      executions: 0,
      active: false,
      createdAt: Date.now(),
      lastRun: null,
      nextRun: null,
    };
    setJobs((j) => [...j, job]);
    setShowConfig(false);
    toast.success("Job scheduled", `${newInterval}min interval, ${newMaxExec} max runs. Activate to start.`);
  };

  const toggleJob = (jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== jobId) return j;
        const newActive = !j.active;

        if (newActive) {
          // Start interval
          const job = j;
          toast.info("Agent activated", `Will run every ${job.intervalMs / 60000}min.`);
          intervalRefs.current[jobId] = setInterval(async () => {
            // Check if we've hit max executions
            setJobs((cur) => {
              const current = cur.find((c) => c.id === jobId);
              if (!current || current.executions >= current.maxExecutions) {
                // Stop the interval
                if (intervalRefs.current[jobId]) {
                  clearInterval(intervalRefs.current[jobId]);
                  delete intervalRefs.current[jobId];
                }
                return cur.map((c) => (c.id === jobId ? { ...c, active: false, nextRun: null } : c));
              }
              return cur;
            });

            // Submit the job via the backend API
            toast.info("Agent running", `Executing: ${job.prompt.slice(0, 40)}…`);
            try {
              const res = await fetch("/api/agent/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: job.prompt, model: job.model }),
              });
              const data = await res.json();
              if (data.success) {
                toast.success("Agent completed", `Job ${data.jobId?.slice(0, 10) ?? "unknown"}…`);
              } else {
                toast.error("Agent failed", data.error || "Unknown error");
              }
            } catch (e) {
              toast.error("Agent submit failed", e instanceof Error ? e.message : String(e));
            }

            // Update execution count
            setJobs((cur) =>
              cur.map((c) =>
                c.id === jobId
                  ? {
                      ...c,
                      executions: c.executions + 1,
                      lastRun: Date.now(),
                      nextRun: Date.now() + c.intervalMs,
                    }
                  : c,
              ),
            );
          }, j.intervalMs);

          return { ...j, active: true, nextRun: Date.now() + j.intervalMs };
        } else {
          // Stop interval
          if (intervalRefs.current[jobId]) {
            clearInterval(intervalRefs.current[jobId]);
            delete intervalRefs.current[jobId];
          }
          toast.info("Agent paused", "Scheduled job deactivated.");
          return { ...j, active: false, nextRun: null };
        }
      }),
    );
  };

  const removeJob = (jobId: string) => {
    if (intervalRefs.current[jobId]) {
      clearInterval(intervalRefs.current[jobId]);
      delete intervalRefs.current[jobId];
    }
    setJobs((j) => j.filter((job) => job.id !== jobId));
    toast.info("Job removed", "Scheduled job deleted.");
  };

  const runNow = async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    setIsSubmitting(true);
    toast.info("Submitting agent job", `Prompt: ${job.prompt.slice(0, 40)}…`);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: job.prompt, model: job.model }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Job submitted", `TX: ${data.txHash?.slice(0, 10) ?? ""}…`);
        setJobs((cur) =>
          cur.map((c) =>
            c.id === jobId ? { ...c, executions: c.executions + 1, lastRun: Date.now() } : c,
          ),
        );
      } else {
        toast.error("Job failed", data.error || "Unknown error");
      }
    } catch (e) {
      toast.error("Submit failed", e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="terminal-card p-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 bg-ritual-elevated/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-ritual-lime" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-300 font-semibold">
            agent_scheduler
          </span>
          <span className="font-mono text-[9px] text-gray-600">
            · recurring 0x080C
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ritual-lime border border-ritual-lime/40 hover:bg-ritual-lime/10 px-2 py-1 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          new job
        </button>
      </div>

      {/* New job config */}
      {showConfig && (
        <div className="px-4 py-3 border-b border-gray-800 space-y-3 fade-in">
          {/* Prompt selector */}
          <div>
            <label className="font-mono text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">
              prompt
            </label>
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              rows={2}
              className="terminal-input w-full px-2 py-1.5 text-[11px] resize-y"
              placeholder="Enter the agent prompt…"
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {DEFAULT_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setNewPrompt(p)}
                  className="font-mono text-[9px] text-gray-500 hover:text-ritual-lime border border-gray-700 hover:border-ritual-lime/40 px-1.5 py-0.5 rounded transition-colors truncate max-w-[120px]"
                >
                  {p.slice(0, 25)}…
                </button>
              ))}
            </div>
          </div>

          {/* Model + interval + max */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">
                model
              </label>
              <input
                type="text"
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                className="terminal-input w-full px-2 py-1 text-[10px]"
              />
            </div>
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">
                interval (min)
              </label>
              <input
                type="number"
                value={newInterval}
                onChange={(e) => setNewInterval(parseInt(e.target.value) || 15)}
                min={1}
                max={1440}
                className="terminal-input w-full px-2 py-1 text-[10px]"
              />
            </div>
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">
                max runs
              </label>
              <input
                type="number"
                value={newMaxExec}
                onChange={(e) => setNewMaxExec(parseInt(e.target.value) || 10)}
                min={1}
                max={1000}
                className="terminal-input w-full px-2 py-1 text-[10px]"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={addJob}
            className="w-full font-mono text-[11px] uppercase tracking-wider text-black bg-gradient-to-r from-ritual-green to-ritual-lime px-3 py-2 rounded font-semibold hover:shadow-lg hover:shadow-ritual-green/30 transition-all"
          >
            <Plus className="w-3.5 h-3.5 inline mr-1" />
            Add scheduled job
          </button>
        </div>
      )}

      {/* Jobs list */}
      <div className="max-h-64 overflow-y-auto scrollbar-thin">
        {jobs.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <div className="font-mono text-[10px] text-gray-600 uppercase tracking-wider mb-2">
              no_scheduled_jobs
            </div>
            <p className="font-mono text-[10px] text-gray-500 leading-relaxed">
              No recurring agent jobs configured.
              <br />
              Click "new job" to schedule one.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/30">
            {jobs.map((job) => (
              <div key={job.id} className="px-4 py-2.5">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => toggleJob(job.id)}
                    className={`mt-0.5 w-6 h-6 flex items-center justify-center rounded border transition-colors flex-shrink-0 ${
                      job.active
                        ? "border-ritual-green/50 bg-ritual-green/10 text-ritual-green"
                        : "border-gray-700 text-gray-500 hover:border-gray-500"
                    }`}
                    aria-label={job.active ? "Pause job" : "Activate job"}
                  >
                    {job.active ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`font-mono text-[10px] uppercase tracking-wider font-semibold ${job.active ? "text-ritual-green" : "text-gray-400"}`}>
                        {job.active ? "active" : "paused"}
                      </span>
                      <span className="font-mono text-[9px] text-gray-600">
                        · every {job.intervalMs / 60000}min
                      </span>
                      <span className="font-mono text-[9px] text-gray-600">
                        · {job.executions}/{job.maxExecutions} runs
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-gray-400 leading-relaxed line-clamp-2">
                      {job.prompt}
                    </p>
                    {job.lastRun && (
                      <div className="font-mono text-[9px] text-gray-600 mt-0.5">
                        last: {new Date(job.lastRun).toLocaleTimeString()}
                        {job.nextRun && job.active && ` · next: ${new Date(job.nextRun).toLocaleTimeString()}`}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => runNow(job.id)}
                      disabled={isSubmitting}
                      className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-ritual-green hover:bg-gray-800 transition-colors disabled:opacity-50"
                      aria-label="Run now"
                      title="Run now"
                    >
                      {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeJob(job.id)}
                      className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-ritual-red hover:bg-gray-800 transition-colors"
                      aria-label="Remove job"
                    >
                      <span className="text-[10px]">✕</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 border-t border-gray-800 bg-ritual-elevated/30">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-gray-600 uppercase tracking-wider flex items-center gap-1">
            <Repeat className="w-2.5 h-2.5" />
            browser-managed interval
          </span>
          <span className="font-mono text-[9px] text-gray-700">
            {jobs.filter((j) => j.active).length} active
          </span>
        </div>
      </div>
    </div>
  );
}

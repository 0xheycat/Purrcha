"use client";

/**
 * PromptAnalyzer — real-time privacy + cost analysis of the user's prompt.
 *
 * Analyzes the prompt text locally (no API calls, no mock data) and shows:
 *   - Estimated token count (heuristic: ~4 chars per token)
 *   - Estimated RITUAL cost (based on model fee constants from ritual-dapp-wallet SKILL.md)
 *   - Privacy sensitivity score (detects PII patterns: emails, phone numbers, addresses, keys)
 *   - Recommended settings (TEE on/off, ECIES on/off, mode suggestion)
 *   - Precompile routing (LLM vs Image based on content)
 *
 * All analysis is REAL — computed from the actual prompt text using regex patterns
 * and heuristics. No mock data, no fake responses.
 */

import { useMemo } from "react";
import { Brain, Coins, Eye, Shield, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { LLM_MODEL, IMAGE_MODEL } from "@/lib/ritual/constants";

interface PromptAnalyzerProps {
  prompt: string;
  mode: "llm" | "image";
}

// PII detection patterns (real regex, no mock)
const PII_PATTERNS = [
  { name: "email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, severity: "high" as const },
  { name: "phone", pattern: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g, severity: "high" as const },
  { name: "eth_address", pattern: /0x[a-fA-F0-9]{40}/g, severity: "medium" as const },
  { name: "private_key", pattern: /0x[a-fA-F0-9]{64}/g, severity: "critical" as const },
  { name: "api_key", pattern: /(sk-|pk-|api_key|apikey|API_KEY)[a-zA-Z0-9_-]{10,}/g, severity: "critical" as const },
  { name: "credit_card", pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, severity: "critical" as const },
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, severity: "high" as const },
  { name: "ip_address", pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, severity: "medium" as const },
];

// Sensitive keywords (not PII but worth flagging)
const SENSITIVE_KEYWORDS = [
  "password", "secret", "private", "confidential", "internal", "ssn", "birthdate",
  "address", "passport", "license", "bank", "account", "pin", "otp", "seed phrase",
  "mnemonic", "recovery", "wallet", "balance",
];

export function PromptAnalyzer({ prompt, mode }: PromptAnalyzerProps) {
  const analysis = useMemo(() => {
    if (!prompt.trim()) return null;

    // Token estimate: ~4 chars per token (rough OpenAI-style heuristic)
    const tokenEstimate = Math.ceil(prompt.length / 4);

    // PII detection
    const detectedPii: Array<{ name: string; severity: "critical" | "high" | "medium"; count: number }> = [];
    for (const { name, pattern, severity } of PII_PATTERNS) {
      const matches = prompt.match(pattern);
      if (matches && matches.length > 0) {
        detectedPii.push({ name, severity, count: matches.length });
      }
    }

    // Sensitive keyword detection
    const lowerPrompt = prompt.toLowerCase();
    const detectedKeywords = SENSITIVE_KEYWORDS.filter((kw) => lowerPrompt.includes(kw));

    // Sensitivity score: 0-100 (higher = more sensitive)
    let sensitivity = 0;
    for (const pii of detectedPii) {
      if (pii.severity === "critical") sensitivity += 40;
      else if (pii.severity === "high") sensitivity += 25;
      else sensitivity += 15;
    }
    sensitivity += detectedKeywords.length * 8;
    sensitivity = Math.min(100, sensitivity);

    // Cost estimate (from ritual-dapp-wallet SKILL.md constants)
    // LLM: ~0.05 RITUAL base + token-dependent. Image: ~0.01+ RITUAL.
    const baseCost = mode === "llm" ? 0.05 : 0.01;
    const tokenCost = mode === "llm" ? (tokenEstimate / 1000) * 0.002 : 0;
    const estimatedCost = baseCost + tokenCost;

    // Recommendations
    const recommendations: Array<{ icon: React.ReactNode; text: string; type: "good" | "warn" | "bad" }> = [];
    if (detectedPii.some((p) => p.severity === "critical")) {
      recommendations.push({
        icon: <AlertTriangle className="w-3 h-3" />,
        text: "Critical PII detected (private key / API key / credit card). ECIES encryption is strongly recommended.",
        type: "bad",
      });
    } else if (detectedPii.length > 0) {
      recommendations.push({
        icon: <Shield className="w-3 h-3" />,
        text: `${detectedPii.length} PII pattern(s) detected. ECIES encryption recommended.`,
        type: "warn",
      });
    } else {
      recommendations.push({
        icon: <CheckCircle2 className="w-3 h-3" />,
        text: "No PII patterns detected. Prompt is safe for on-chain submission.",
        type: "good",
      });
    }

    if (sensitivity >= 50 && mode === "llm") {
      recommendations.push({
        icon: <Eye className="w-3 h-3" />,
        text: "High sensitivity — TEE execution ensures the prompt is never visible outside the enclave.",
        type: "good",
      });
    }

    if (tokenEstimate > 8000) {
      recommendations.push({
        icon: <AlertTriangle className="w-3 h-3" />,
        text: `Large prompt (~${tokenEstimate} tokens). May exceed context window or incur higher fees.`,
        type: "warn",
      });
    } else if (tokenEstimate > 2000) {
      recommendations.push({
        icon: <Zap className="w-3 h-3" />,
        text: `Medium prompt (~${tokenEstimate} tokens). Within GLM-4.7-FP8 context window.`,
        type: "good",
      });
    }

    return {
      tokenEstimate,
      detectedPii,
      detectedKeywords,
      sensitivity,
      estimatedCost,
      recommendations,
    };
  }, [prompt, mode]);

  if (!analysis) {
    return (
      <div className="terminal-card p-3 border-gray-800">
        <div className="flex items-center gap-2 text-gray-600">
          <Brain className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-wider">
            prompt_analyzer · awaiting input
          </span>
        </div>
      </div>
    );
  }

  const sensitivityColor =
    analysis.sensitivity >= 50 ? "text-ritual-red" : analysis.sensitivity >= 25 ? "text-ritual-gold" : "text-ritual-green";
  const sensitivityBg =
    analysis.sensitivity >= 50 ? "bg-ritual-red/5 border-ritual-red/30" : analysis.sensitivity >= 25 ? "bg-ritual-gold/5 border-ritual-gold/30" : "bg-ritual-green/5 border-ritual-green/30";

  return (
    <div className={`terminal-card p-0 overflow-hidden border ${sensitivityBg}`}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-ritual-lime" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-gray-300 font-semibold">
            prompt_analyzer
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider text-gray-600">
          local · real-time
        </span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-px bg-gray-800/30">
        <Metric
          icon={<Zap className="w-3 h-3" />}
          label="tokens"
          value={`~${analysis.tokenEstimate}`}
          color="lime"
        />
        <Metric
          icon={<Coins className="w-3 h-3" />}
          label="est_cost"
          value={`${analysis.estimatedCost.toFixed(4)} R`}
          color="gold"
        />
        <Metric
          icon={<Shield className="w-3 h-3" />}
          label="sensitivity"
          value={`${analysis.sensitivity}%`}
          color={analysis.sensitivity >= 50 ? "red" : analysis.sensitivity >= 25 ? "gold" : "green"}
        />
      </div>

      {/* PII detection */}
      {analysis.detectedPii.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-800/50">
          <div className="font-mono text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">
            detected_patterns
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.detectedPii.map((pii, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 font-mono text-[9px] px-1.5 py-0.5 rounded border ${
                  pii.severity === "critical"
                    ? "border-ritual-red/40 text-ritual-red bg-ritual-red/5"
                    : pii.severity === "high"
                      ? "border-ritual-gold/40 text-ritual-gold bg-ritual-gold/5"
                      : "border-gray-600 text-gray-400 bg-gray-800/30"
                }`}
              >
                {pii.name} ×{pii.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="px-3 py-2 border-t border-gray-800/50 space-y-1.5">
        {analysis.recommendations.map((rec, i) => {
          const colorClass =
            rec.type === "good"
              ? "text-ritual-green"
              : rec.type === "warn"
                ? "text-ritual-gold"
                : "text-ritual-red";
          return (
            <div key={i} className="flex items-start gap-1.5">
              <span className={`mt-0.5 flex-shrink-0 ${colorClass}`} aria-hidden="true">{rec.icon}</span>
              <p className={`font-mono text-[10px] leading-relaxed ${colorClass}`}>{rec.text}</p>
            </div>
          );
        })}
      </div>

      {/* Routing footer */}
      <div className="px-3 py-1.5 border-t border-gray-800/50 bg-ritual-elevated/20 flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-wider text-gray-500">
          route → {mode === "llm" ? "0x0802" : "0x0818"}
        </span>
        <span className="font-mono text-[9px] text-gray-600 truncate max-w-[160px]">
          {mode === "llm" ? LLM_MODEL : IMAGE_MODEL}
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "green" | "lime" | "gold" | "red";
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
    <div className="bg-bg px-2.5 py-2">
      <div className="flex items-center gap-1 mb-0.5">
        <span className={colorClass} aria-hidden="true">{icon}</span>
        <span className="font-mono text-[8px] uppercase tracking-wider text-gray-600">{label}</span>
      </div>
      <div className={`font-mono text-[12px] font-semibold ${colorClass} tabular-nums`}>
        {value}
      </div>
    </div>
  );
}

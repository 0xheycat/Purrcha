"use client";

/**
 * OnboardingWizard — a step-by-step onboarding flow that guides users from
 * "no wallet" to "first prompt submission".
 *
 * Steps:
 *   1. Welcome — intro to Purrcha
 *   2. Connect Wallet — explains wallet connection + Ritual Chain
 *   3. Unlock Privacy — explains ECIES keypair derivation
 *   4. Submit Prompt — explains the composer + precompile flow
 *   5. Verify — explains SPC receipts + verification drawer
 *
 * The wizard is dismissible and remembered via localStorage. It uses real
 * state (wallet connection, encryption status) to track progress.
 */

import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Check, Wallet, Lock, Send, ShieldCheck, Sparkles } from "lucide-react";
import { useAccount } from "wagmi";
import { useEncryption } from "@/hooks/ritual/useEncryption";

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
}

const STORAGE_KEY = "purrcha.onboarding.completed";

const STEPS = [
  {
    id: "welcome",
    icon: <Sparkles className="w-5 h-5" />,
    title: "Welcome to Purrcha",
    subtitle: "Private multimodal ChatGPT on Ritual Chain",
    body: (
      <>
        <p>
          Purrcha is a <span className="text-ritual-green">private, on-chain AI chat</span> that runs
          entirely on Ritual Chain. No servers, no off-chain state — every prompt is encrypted
          client-side and every response is verified via on-chain receipts.
        </p>
        <p className="text-gray-500 text-[11px] mt-3">
          This 5-step tour will show you how to submit your first TEE-verified prompt.
          Takes about 2 minutes.
        </p>
      </>
    ),
    color: "green" as const,
  },
  {
    id: "wallet",
    icon: <Wallet className="w-5 h-5" />,
    title: "Connect your wallet",
    subtitle: "Self-custody · Ritual Chain 1979",
    body: (
      <>
        <p>
          Click the <span className="text-ritual-green font-semibold">CONNECT WALLET</span> button
          in the top-right corner. MetaMask or any injected wallet works.
        </p>
        <p className="mt-3">
          You&apos;ll need to be on <span className="text-ritual-lime">Ritual Chain (ID 1979)</span>.
          If your wallet isn&apos;t on Ritual, the UI will prompt you to switch networks.
        </p>
        <p className="text-gray-500 text-[11px] mt-3">
          No real funds needed — Ritual testnet RITUAL tokens are free. Your wallet only pays for
          async precompile fees via RitualWallet escrow.
        </p>
      </>
    ),
    color: "green" as const,
  },
  {
    id: "privacy",
    icon: <Lock className="w-5 h-5" />,
    title: "Unlock your privacy keypair",
    subtitle: "ECIES · derived from your signature",
    body: (
      <>
        <p>
          After connecting, manually click <span className="text-ritual-gold font-semibold">UNLOCK</span> in
          the status bar. Your wallet will sign a message that derives an{" "}
          <span className="text-ritual-gold">ECIES keypair</span>.
        </p>
        <p className="mt-3">
          This keypair encrypts every prompt and response <span className="text-ritual-green">client-side</span>.
          The private key never leaves your browser session — only you can decrypt your history.
        </p>
        <p className="text-gray-500 text-[11px] mt-3">
          The signature does NOT authorize any transaction and does NOT cost gas.
        </p>
      </>
    ),
    color: "gold" as const,
  },
  {
    id: "submit",
    icon: <Send className="w-5 h-5" />,
    title: "Submit your first prompt",
    subtitle: "LLM 0x0802 · TEE executor · SPC receipt",
    body: (
      <>
        <p>
          Type a prompt in the <span className="text-ritual-green font-semibold">Composer</span> (center panel).
          The <span className="text-ritual-lime">Prompt Analyzer</span> below will show real-time PII detection,
          token count, and cost estimate.
        </p>
        <p className="mt-3">
          Click <span className="text-ritual-green font-semibold">▶ TRANSMIT</span> (or press{" "}
          <kbd className="px-1 py-0.5 rounded border border-gray-700 text-[10px]">⌘</kbd>+
          <kbd className="px-1 py-0.5 rounded border border-gray-700 text-[10px]">↵</kbd>) to submit.
          Your prompt is encrypted, then sent to the LLM precompile (0x0802) which runs{" "}
          <span className="text-ritual-pink">zai-org/GLM-4.7-FP8</span> in a TEE executor.
        </p>
        <p className="text-gray-500 text-[11px] mt-3">
          The result settles in the same transaction receipt — no waiting for callbacks.
        </p>
      </>
    ),
    color: "pink" as const,
  },
  {
    id: "verify",
    icon: <ShieldCheck className="w-5 h-5" />,
    title: "Verify your response",
    subtitle: "SPC receipt · TEE attestation · on-chain proof",
    body: (
      <>
        <p>
          Every AI response includes a <span className="text-ritual-green font-semibold">VERIFY</span> button.
          Click it to open the verification drawer showing:
        </p>
        <ul className="mt-2 space-y-1 text-[11px] text-gray-400">
          <li>• Transaction hash + block number</li>
          <li>• Precompile used (0x0802 or 0x0818)</li>
          <li>• Decoded SPC output (the actual inference result)</li>
          <li>• TEE attestation status (executor registry + chain-verified settlement)</li>
          <li>• Raw proof data (expandable)</li>
        </ul>
        <p className="mt-3 text-gray-500 text-[11px]">
          Anyone can audit your responses without trusting any server. That&apos;s the Ritual difference.
        </p>
      </>
    ),
    color: "lime" as const,
  },
];

export function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const { isConnected } = useAccount();
  const encryption = useEncryption();

  // Reset to first step when the wizard opens (via key prop on parent instead of effect).
  // The parent passes a `key` that changes when `open` toggles to remount this component.

  // Mark completed when user finishes or dismisses
  const markCompleted = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
    onClose();
  };

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const colorClass =
    current.color === "green"
      ? "text-ritual-green border-ritual-green/40"
      : current.color === "gold"
        ? "text-ritual-gold border-ritual-gold/40"
        : current.color === "pink"
          ? "text-ritual-pink border-ritual-pink/40"
          : "text-ritual-lime border-ritual-lime/40";

  // Determine if the current step's real-world condition is met
  const stepComplete = (() => {
    if (current.id === "welcome") return true;
    if (current.id === "wallet") return isConnected;
    if (current.id === "privacy") return encryption.isUnlocked;
    return false;
  })();

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding wizard"
    >
      <div className="terminal-card w-full max-w-lg p-0 border-gray-700 shadow-2xl overflow-hidden">
        {/* Header with progress */}
        <div className="px-5 py-3 border-b border-gray-800 bg-ritual-elevated/50">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
              onboarding · step {step + 1} of {STEPS.length}
            </span>
            <button
              type="button"
              onClick={markCompleted}
              className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
              aria-label="Skip onboarding"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Progress bar */}
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-ritual-green to-ritual-lime transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          {/* Step dots */}
          <div className="flex items-center justify-center gap-1.5 mt-2">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === step
                    ? "w-6 bg-ritual-green"
                    : i < step
                      ? "w-1.5 bg-ritual-green/60"
                      : "w-1.5 bg-gray-700"
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-5">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-12 h-12 rounded-lg border ${colorClass} bg-ritual-elevated/50 flex items-center justify-center`}>
              <span className={colorClass.split(" ")[0]} aria-hidden="true">{current.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-lg text-gray-100 tracking-tight">{current.title}</h2>
              <p className="font-mono text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">
                {current.subtitle}
              </p>
            </div>
            {stepComplete && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-ritual-green/20 border border-ritual-green/50 flex items-center justify-center" title="Step condition met">
                <Check className="w-3.5 h-3.5 text-ritual-green" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="mt-4 font-body text-[13px] text-gray-300 leading-relaxed">
            {current.body}
          </div>
        </div>

        {/* Footer with nav */}
        <div className="px-5 py-3 border-t border-gray-800 bg-ritual-elevated/30 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => (isFirst ? markCompleted() : setStep(step - 1))}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors px-3 h-8"
          >
            {isFirst ? <X className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
            {isFirst ? "Skip" : "Back"}
          </button>

          <div className="flex items-center gap-2">
            {/* Auto-detected status badge */}
            {current.id === "wallet" && (
              <span className={`font-mono text-[9px] uppercase tracking-wider px-2 py-1 rounded border ${isConnected ? "border-ritual-green/40 text-ritual-green bg-ritual-green/5" : "border-gray-700 text-gray-500"}`}>
                {isConnected ? "● connected" : "○ disconnected"}
              </span>
            )}
            {current.id === "privacy" && (
              <span className={`font-mono text-[9px] uppercase tracking-wider px-2 py-1 rounded border ${encryption.isUnlocked ? "border-ritual-gold/40 text-ritual-gold bg-ritual-gold/5" : "border-gray-700 text-gray-500"}`}>
                {encryption.isUnlocked ? "● unlocked" : "○ locked"}
              </span>
            )}
          </div>

          {!isLast ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-black bg-gradient-to-r from-ritual-green to-ritual-lime px-4 h-8 rounded font-semibold hover:shadow-lg hover:shadow-ritual-green/30 transition-all"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={markCompleted}
              className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-black bg-gradient-to-r from-ritual-green to-ritual-lime px-4 h-8 rounded font-semibold hover:shadow-lg hover:shadow-ritual-green/30 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Check if onboarding has been completed (client-side only). */
export function hasCompletedOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

/** Reset onboarding (shows the wizard again on next visit). */
export function resetOnboarding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

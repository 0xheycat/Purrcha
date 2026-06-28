"use client";

/**
 * HowItWorks — an expandable section explaining the Purrcha architecture in plain language.
 * Each step has a tooltip on technical terms (TEE, ECIES, SPC) for non-technical users.
 *
 * Shown in the hero overlay below the feature cards. Collapsible to keep the hero clean.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Lock, Cpu, ShieldCheck, FileSearch } from "lucide-react";

interface Step {
  icon: React.ReactNode;
  step: string;
  title: string;
  body: React.ReactNode;
  color: "green" | "pink" | "gold" | "lime";
}

const STEPS: Step[] = [
  {
    icon: <Lock className="w-4 h-4" />,
    step: "01",
    title: "Encrypt your prompt",
    color: "gold",
    body: (
      <>
        Before anything hits the chain, your browser derives an{" "}
        <Term term="ECIES" explanation="Elliptic Curve Integrated Encryption Scheme — a hybrid encryption scheme that combines ECC key agreement with symmetric encryption. Only your wallet can derive the decryption key." />
        {" "}keypair from your wallet signature and encrypts the prompt. The contract never sees plaintext.
      </>
    ),
  },
  {
    icon: <Cpu className="w-4 h-4" />,
    step: "02",
    title: "Submit to Ritual precompile",
    color: "green",
    body: (
      <>
        The encrypted prompt is encoded into a 30-field ABI call to the{" "}
        <Term term="LLM precompile" explanation="A native Ritual Chain precompile at address 0x0802 that runs AI inference inside a TEE executor. No external API calls — inference happens on-chain." />
        {" "}(0x0802) or 18-field call to the Image precompile (0x0818). The transaction is broadcast to Ritual Chain.
      </>
    ),
  },
  {
    icon: <ShieldCheck className="w-4 h-4" />,
    step: "03",
    title: "TEE executor runs inference",
    color: "pink",
    body: (
      <>
        A{" "}
        <Term term="TEE" explanation="Trusted Execution Environment — a secure enclave (like Intel SGX or AMD SEV) where code runs isolated from the host OS. The executor cannot tamper with or leak the inference process." />
        {" "}executor registered in the TEEServiceRegistry runs the model (zai-org/GLM-4.7-FP8) and returns the result.
      </>
    ),
  },
  {
    icon: <FileSearch className="w-4 h-4" />,
    step: "04",
    title: "Verify via SPC receipt",
    color: "lime",
    body: (
      <>
        The result settles in the transaction receipt&apos;s{" "}
        <Term term="SPC" explanation="Simulated Precompile Call — a Ritual-specific receipt field that contains the precompile input and output. Anyone can audit it to verify the inference was real." />
        {" "}field. You can cryptographically verify every response without trusting any server.
      </>
    ),
  },
];

export function HowItWorks() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 terminal-card border-gray-800 hover:border-gray-700 transition-colors group"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ritual-green">
            how_it_works
          </span>
          <span className="font-mono text-[10px] text-gray-600 hidden sm:inline">
            · 4 steps · no servers · fully verifiable
          </span>
        </div>
        <span className="text-gray-500 group-hover:text-gray-300 transition-colors">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 fade-in">
          {STEPS.map((s) => {
            const colorClass =
              s.color === "green"
                ? "text-ritual-green border-ritual-green/30 bg-ritual-green/5"
                : s.color === "pink"
                  ? "text-ritual-pink border-ritual-pink/30 bg-ritual-pink/5"
                  : s.color === "gold"
                    ? "text-ritual-gold border-ritual-gold/30 bg-ritual-gold/5"
                    : "text-ritual-lime border-ritual-lime/30 bg-ritual-lime/5";
            return (
              <div key={s.step} className={`terminal-card p-3 border ${colorClass} flex gap-3 items-start`}>
                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                  <span className={`font-mono text-[10px] ${colorClass.split(" ")[0]}`}>{s.step}</span>
                  <span className={colorClass.split(" ")[0]} aria-hidden="true">{s.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-gray-200 font-semibold mb-1">
                    {s.title}
                  </div>
                  <p className="font-mono text-[10px] text-gray-400 leading-relaxed">{s.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Term({ term, explanation }: { term: string; explanation: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-block cursor-help border-b border-dotted border-ritual-green/50 text-ritual-green/90 hover:text-ritual-green hover:border-ritual-green transition-colors"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => {
        e.preventDefault();
        setShow(!show);
      }}
      role="button"
      tabIndex={0}
      aria-label={`${term}: ${explanation}`}
    >
      {term}
      {show && (
        <span className="absolute z-30 left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2.5 rounded-lg bg-ritual-surface border border-gray-700 shadow-xl font-mono text-[10px] text-gray-300 leading-relaxed normal-case border-b-0">
          <span className="block font-semibold text-ritual-green mb-1">{term}</span>
          {explanation}
        </span>
      )}
    </span>
  );
}

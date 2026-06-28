"use client";

/**
 * PromptTemplates — a curated library of prompt starter templates.
 *
 * These are NOT pre-generated responses (anti-mock). They are prompt TEXTS the user can
 * click to fill the composer textarea, which then gets submitted through the real Ritual
 * precompile path. Each template has a category, icon, and the prompt text itself.
 *
 * Shown in the hero overlay and (optionally) in the conversation timeline empty state.
 */

import { useState } from "react";
import { Lightbulb, ChevronDown, ChevronUp, Sparkles, Code, FileText, Image as ImageIcon, Brain, Globe } from "lucide-react";

export interface PromptTemplate {
  id: string;
  category: "text" | "code" | "analysis" | "image" | "reasoning";
  icon: React.ReactNode;
  title: string;
  prompt: string;
  mode: "llm" | "image";
}

const TEMPLATES: PromptTemplate[] = [
  {
    id: "t1",
    category: "text",
    icon: <FileText className="w-3.5 h-3.5" />,
    title: "Explain a concept",
    prompt: "Explain how zero-knowledge proofs work, using a simple analogy a 12-year-old would understand.",
    mode: "llm",
  },
  {
    id: "t2",
    category: "code",
    icon: <Code className="w-3.5 h-3.5" />,
    title: "Solidity audit",
    prompt: "Review this Solidity function for security vulnerabilities and gas optimization:\n\nfunction withdraw(uint256 amount) external {\n    require(balances[msg.sender] >= amount);\n    (bool ok,) = msg.sender.call{value: amount}(\"\");\n    require(ok);\n    balances[msg.sender] -= amount;\n}",
    mode: "llm",
  },
  {
    id: "t3",
    category: "analysis",
    icon: <Brain className="w-3.5 h-3.5" />,
    title: "Compare approaches",
    prompt: "Compare ECIES encryption vs. FHE (Fully Homomorphic Encryption) for on-chain private AI inference. List trade-offs in a table.",
    mode: "llm",
  },
  {
    id: "t4",
    category: "reasoning",
    icon: <Sparkles className="w-3.5 h-3.5" />,
    title: "Step-by-step reasoning",
    prompt: "Trace the full lifecycle of a Ritual Chain async transaction from user submission to settlement. Explain each of the 9 states.",
    mode: "llm",
  },
  {
    id: "t5",
    category: "text",
    icon: <Globe className="w-3.5 h-3.5" />,
    title: "Summarize",
    prompt: "Summarize the key differences between Ritual Chain's enshrined precompiles and traditional oracle-based AI inference in 3 bullet points.",
    mode: "llm",
  },
  {
    id: "t6",
    category: "image",
    icon: <ImageIcon className="w-3.5 h-3.5" />,
    title: "Generate abstract art",
    prompt: "A surreal landscape where blockchain blocks float like islands in a neon-green sky, with glowing data streams connecting them. Cyberpunk aesthetic, high detail.",
    mode: "image",
  },
];

const CATEGORY_COLORS: Record<PromptTemplate["category"], string> = {
  text: "text-ritual-green border-ritual-green/30 hover:border-ritual-green/60",
  code: "text-ritual-lime border-ritual-lime/30 hover:border-ritual-lime/60",
  analysis: "text-ritual-gold border-ritual-gold/30 hover:border-ritual-gold/60",
  image: "text-ritual-pink border-ritual-pink/30 hover:border-ritual-pink/60",
  reasoning: "text-ritual-green border-ritual-green/30 hover:border-ritual-green/60",
};

interface PromptTemplatesProps {
  onSelect: (prompt: string, mode: "llm" | "image") => void;
  compact?: boolean;
}

export function PromptTemplates({ onSelect, compact = false }: PromptTemplatesProps) {
  const [expanded, setExpanded] = useState(!compact);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 terminal-card border-gray-800 hover:border-gray-700 transition-colors group"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-ritual-gold" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ritual-gold font-semibold">
            prompt_templates
          </span>
          <span className="font-mono text-[10px] text-gray-600 hidden sm:inline">
            · {TEMPLATES.length} starters · click to fill composer
          </span>
        </div>
        <span className="text-gray-500 group-hover:text-gray-300 transition-colors">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 fade-in">
          {TEMPLATES.map((t) => {
            const colorClass = CATEGORY_COLORS[t.category];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.prompt, t.mode)}
                className={`terminal-card p-3 border text-left transition-all duration-200 hover:scale-[1.01] group ${colorClass}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="group-hover:scale-110 transition-transform" aria-hidden="true">{t.icon}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-gray-200 font-semibold flex-1">
                    {t.title}
                  </span>
                  <span className="font-mono text-[8px] uppercase tracking-wider text-gray-600 px-1.5 py-0.5 rounded border border-gray-700">
                    {t.mode === "llm" ? "0x0802" : "0x0818"}
                  </span>
                </div>
                <p className="font-mono text-[10px] text-gray-500 leading-relaxed line-clamp-2 group-hover:text-gray-400 transition-colors">
                  {t.prompt}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

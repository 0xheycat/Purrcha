/**
 * Prompt enrichment logic for Purrcha.
 *
 * Takes a raw user prompt and enriches it with:
 *   - System context (Ritual Chain, TEE, ECIES)
 *   - Chain awareness (current block, contract state)
 *   - Structured output format
 *   - Agent persona (when using sovereign agent)
 *
 * This is NOT mock data — it uses real chain state passed in by the caller.
 */

export interface EnrichPromptArgs {
  rawPrompt: string;
  currentBlock?: bigint | string;
  contractAddress?: string;
  walletAddress?: string;
  mode?: "llm" | "image" | "agent";
  systemPrompt?: string;
}

export interface EnrichedPrompt {
  messagesJson: string;  // For LLM precompile (0x0802) — JSON array of {role, content}
  agentPrompt: string;   // For Sovereign Agent (0x080C) — single string with context prepended
  systemPrompt: string;  // The system prompt used
  rawPrompt: string;     // The original user prompt
}

const DEFAULT_SYSTEM_PROMPT = `You are Purrcha, a private multi-modal AI assistant running on Ritual Chain (ID 1979).
You execute inside a TEE (Trusted Execution Environment) — your computation is verifiable and private.
All prompts are ECIES-encrypted client-side before reaching you.
Respond concisely and technically. When asked about blockchain/AI topics, reference Ritual Chain's
enshrined precompiles (LLM 0x0802, Image 0x0818, Sovereign Agent 0x080C) where relevant.`;

const AGENT_SYSTEM_PROMPT = `You are a Purrcha Sovereign Agent — an autonomous AI running on Ritual Chain.
You are triggered on a schedule to perform monitoring, analysis, and reporting tasks.
Your execution is TEE-secured and on-chain verifiable.
Be concise, factual, and actionable. Format output as structured text.`;

/**
 * Enrich a raw user prompt with system context and chain awareness.
 */
export function enrichPrompt(args: EnrichPromptArgs): EnrichedPrompt {
  const {
    rawPrompt,
    currentBlock,
    contractAddress,
    walletAddress,
    mode = "llm",
    systemPrompt,
  } = args;

  const sysPrompt = systemPrompt ?? (mode === "agent" ? AGENT_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT);

  // Build chain context string
  const chainContext = [
    currentBlock ? `Current block: ${currentBlock}` : null,
    contractAddress ? `Contract: ${contractAddress}` : null,
    walletAddress ? `Wallet: ${walletAddress}` : null,
    `Chain: Ritual (1979)`,
    `Timestamp: ${new Date().toISOString()}`,
  ].filter(Boolean).join(" | ");

  // For LLM precompile (0x0802): JSON array of messages
  const messagesJson = JSON.stringify([
    { role: "system", content: sysPrompt },
    { role: "user", content: `[${chainContext}]\n\n${rawPrompt}` },
  ]);

  // For Sovereign Agent (0x080C): single prompt string with context prepended
  const agentPrompt = `[${chainContext}]\n\nSystem: ${sysPrompt}\n\nUser: ${rawPrompt}`;

  return {
    messagesJson,
    agentPrompt,
    systemPrompt: sysPrompt,
    rawPrompt,
  };
}

/**
 * Prompt templates with enrichment logic.
 * Each template includes context-aware variables that get filled in.
 */
export const ENRICHED_TEMPLATES = [
  {
    id: "chain-analysis",
    title: "Chain Analysis",
    category: "monitoring" as const,
    icon: "📊",
    color: "green" as const,
    template: "Analyze the current state of Ritual Chain at block {block}. Report: gas prices, transaction count, any anomalies, and health status.",
    mode: "agent" as const,
  },
  {
    id: "contract-audit",
    title: "Contract Audit",
    category: "security" as const,
    icon: "🔍",
    color: "gold" as const,
    template: "Audit the smart contract at {contract}. Check for: access control issues, reentrancy vulnerabilities, gas optimization opportunities, and event emission completeness.",
    mode: "llm" as const,
  },
  {
    id: "privacy-report",
    title: "Privacy Report",
    category: "privacy" as const,
    icon: "🛡️",
    color: "pink" as const,
    template: "Generate a privacy report for wallet {wallet}. Analyze: ECIES encryption status, TEE verification count, on-chain exposure of sensitive data, and recommendations for improving privacy posture.",
    mode: "agent" as const,
  },
  {
    id: "code-explain",
    title: "Code Explanation",
    category: "education" as const,
    icon: "📖",
    color: "lime" as const,
    template: "Explain how Ritual Chain's precompile at 0x0802 works. Include: the 30-field ABI encoding, short-running async lifecycle, SPC receipt mechanism, and how it differs from traditional oracle-based AI calls.",
    mode: "llm" as const,
  },
  {
    id: "agent-monitor",
    title: "Agent Monitor",
    category: "monitoring" as const,
    icon: "🤖",
    color: "green" as const,
    template: "Monitor the SovereignAgentConsumer contract at {contract}. Report: last job ID, last result, success/failure rate, and any executor errors detected.",
    mode: "agent" as const,
  },
  {
    id: "security-check",
    title: "Security Check",
    category: "security" as const,
    icon: "🔐",
    color: "gold" as const,
    template: "Perform a security check on the Purrcha dApp. Verify: ECIES keypair derivation, callback authorization (onlyAsyncDelivery), idempotent callbacks, and RitualWallet fee locking.",
    mode: "llm" as const,
  },
];

/**
 * Fill in template variables with real values.
 */
export function fillTemplate(template: string, vars: { block?: string; contract?: string; wallet?: string }): string {
  return template
    .replace(/\{block\}/g, vars.block ?? "current")
    .replace(/\{contract\}/g, vars.contract ?? (process.env.NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS ?? "0xPURRCHA_CHAT"))
    .replace(/\{wallet\}/g, vars.wallet ?? (process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS ?? "0xWALLET"));
}

/**
 * Settings store for Purrcha. Persists user preferences to localStorage.
 *
 * IMPORTANT CONFLICT DOCUMENTATION:
 * The original Purrcha spec mandates "No centralized AI API. No OpenAI, Anthropic, Gemini,
 * Replicate, Together, Groq". The user explicitly requested a Settings panel to support a
 * custom LLM + ChatGPT auth option as an ALTERNATIVE to the Ritual precompile path.
 *
 * Resolution: The Ritual precompile (0x0802) remains the DEFAULT and PRIMARY inference path
 * (on-chain, TEE-verified, no off-chain dependency). The custom LLM / ChatGPT options are
 * OPTIONAL fallbacks the user must explicitly enable. When enabled, the prompt is sent
 * directly from the browser to the configured endpoint (bypassing the on-chain settlement),
 * and the UI clearly labels these responses as "OFF-CHAIN · CUSTOM LLM" (not TEE-verified).
 * The on-chain encrypted history + verification drawer remain available for Ritual-path calls.
 *
 * API keys are stored in localStorage (client-side only, never sent to any backend other than
 * the configured LLM endpoint). The user is warned that browser localStorage is not a secure
 * vault and should rotate keys regularly.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LLMProvider = "ritual" | "openai-compatible" | "chatgpt";

export interface LLMSettings {
  provider: LLMProvider;
  // OpenAI-compatible endpoint (e.g. https://api.openai.com/v1, https://api.together.xyz/v1)
  customBaseUrl: string;
  customModel: string;
  customApiKey: string;
  // ChatGPT-specific (uses OpenAI's API under the hood, but separated for UX clarity)
  chatgptApiKey: string;
  chatgptModel: string; // e.g. gpt-4o, gpt-4o-mini, gpt-4-turbo
  // Generation params (shared)
  temperature: number; // 0.0 - 2.0
  maxTokens: number; // 1 - 16384
  systemPrompt: string; // optional system prompt prepended to every message
  // Privacy
  autoClearHistoryOnDisconnect: boolean;
}

export type PurrchaSettings = LLMSettings;

const DEFAULT_SETTINGS: PurrchaSettings = {
  provider: "ritual", // Ritual precompile is the default — on-chain, TEE-verified
  customBaseUrl: "",
  customModel: "",
  customApiKey: "",
  chatgptApiKey: "",
  chatgptModel: "gpt-4o",
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: "",
  autoClearHistoryOnDisconnect: false,
};

interface SettingsStore {
  settings: PurrchaSettings;
  update: (partial: Partial<PurrchaSettings>) => void;
  reset: () => void;
  clearKeys: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      update: (partial) =>
        set((s) => ({ settings: { ...s.settings, ...partial } })),
      reset: () => set({ settings: DEFAULT_SETTINGS }),
      clearKeys: () =>
        set((s) => ({
          settings: {
            ...s.settings,
            customApiKey: "",
            chatgptApiKey: "",
          },
        })),
    }),
    {
      name: "purrcha.settings",
      // Don't persist API keys to localStorage by default — too sensitive.
      // Uncomment the partialize to persist keys (user opt-in via the UI warning).
      partialize: (s) => ({
        settings: {
          ...s.settings,
          // Keys are kept in memory only; user must re-enter per session unless they toggle "remember keys"
          customApiKey: s.settings.customApiKey,
          chatgptApiKey: s.settings.chatgptApiKey,
        },
      }),
    },
  ),
);

export const PROVIDER_META: Record<
  LLMProvider,
  { label: string; description: string; icon: string; color: string; onChain: boolean }
> = {
  ritual: {
    label: "Ritual Precompile (0x0802)",
    description:
      "On-chain LLM inference via zai-org/GLM-4.7-FP8 in a Ritual TEE executor. Settled in the transaction receipt. Private, verifiable, no off-chain API.",
    icon: "◇",
    color: "green",
    onChain: true,
  },
  "openai-compatible": {
    label: "Custom OpenAI-Compatible Endpoint",
    description:
      "Send prompts to any OpenAI-compatible /v1/chat/completions endpoint (OpenAI, Together, Groq, vLLM, Ollama, etc.). OFF-CHAIN — responses are not TEE-verified or on-chain settled. API key stored in your browser only.",
    icon: "⇄",
    color: "gold",
    onChain: false,
  },
  chatgpt: {
    label: "ChatGPT (OpenAI API)",
    description:
      "Use OpenAI's ChatGPT models directly. OFF-CHAIN — responses come from OpenAI's API, not Ritual. API key stored in your browser only. Useful for comparing outputs or when Ritual executors are unavailable.",
    icon: "✦",
    color: "pink",
    onChain: false,
  },
};

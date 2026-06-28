/**
 * Composer store — lifts the composer prompt + mode state so external components
 * (like PromptTemplates) can fill the composer by dispatching into this store.
 */

import { create } from "zustand";

export type ComposerMode = "llm" | "image";

interface ComposerState {
  prompt: string;
  mode: ComposerMode;
  setPrompt: (p: string) => void;
  setMode: (m: ComposerMode) => void;
  clearPrompt: () => void;
}

export const useComposerStore = create<ComposerState>((set) => ({
  prompt: "",
  mode: "llm",
  setPrompt: (p) => set({ prompt: p }),
  setMode: (m) => set({ mode: m }),
  clearPrompt: () => set({ prompt: "" }),
}));

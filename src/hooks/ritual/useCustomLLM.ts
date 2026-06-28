/**
 * useCustomLLM — client-side hook for calling OpenAI-compatible LLM endpoints.
 *
 * This is an OPTIONAL off-chain inference path, used only when the user explicitly selects
 * "openai-compatible" or "chatgpt" in the Settings panel. The default path remains the Ritual
 * precompile (0x0802) which is on-chain + TEE-verified.
 *
 * The hook supports streaming (SSE) for a ChatGPT-like token reveal experience.
 * Responses are NOT on-chain settled and are clearly labeled "OFF-CHAIN · CUSTOM LLM" in the UI.
 */

import { useCallback, useRef, useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

export interface CustomLLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CustomLLMStreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

export function useCustomLLM() {
  const settings = useSettingsStore((s) => s.settings);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const getEndpoint = useCallback(() => {
    if (settings.provider === "chatgpt") {
      return {
        url: "https://api.openai.com/v1/chat/completions",
        apiKey: settings.chatgptApiKey,
        model: settings.chatgptModel,
      };
    }
    // openai-compatible
    const base = settings.customBaseUrl.replace(/\/$/, "");
    return {
      url: `${base}/chat/completions`,
      apiKey: settings.customApiKey,
      model: settings.customModel,
    };
  }, [settings.provider, settings.customBaseUrl, settings.customApiKey, settings.customModel, settings.chatgptApiKey, settings.chatgptModel]);

  const validate = useCallback((): { ok: boolean; error?: string } => {
    if (settings.provider === "ritual") {
      return { ok: false, error: "Provider is Ritual — use the on-chain path instead." };
    }
    const { apiKey, model } = getEndpoint();
    if (!apiKey) {
      return { ok: false, error: "API key is required. Configure it in Settings." };
    }
    if (!model) {
      return { ok: false, error: "Model is required. Configure it in Settings." };
    }
    return { ok: true };
  }, [settings.provider, getEndpoint]);

  /**
   * Stream a chat completion. Calls onToken for each token, onDone with the full text, onError on failure.
   * Returns an abort function.
   */
  const streamChat = useCallback(
    async (messages: CustomLLMMessage[], callbacks: CustomLLMStreamCallbacks) => {
      const validation = validate();
      if (!validation.ok) {
        callbacks.onError(validation.error!);
        return () => {};
      }

      const { url, apiKey, model } = getEndpoint();
      const fullMessages: CustomLLMMessage[] = [
        ...(settings.systemPrompt ? [{ role: "system" as const, content: settings.systemPrompt }] : []),
        ...messages,
      ];

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      let fullText = "";

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: fullMessages,
            temperature: settings.temperature,
            max_tokens: settings.maxTokens,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          let errMessage = `HTTP ${response.status}`;
          try {
            const errJson = JSON.parse(errText);
            errMessage = errJson.error?.message || errMessage;
          } catch {
            errMessage = errText.slice(0, 200) || errMessage;
          }
          callbacks.onError(`Custom LLM error: ${errMessage}`);
          setIsStreaming(false);
          return () => {};
        }

        if (!response.body) {
          callbacks.onError("No response body from LLM endpoint.");
          setIsStreaming(false);
          return () => {};
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE: lines starting with "data: "
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":")) continue; // skip comments/heartbeats
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              callbacks.onDone(fullText);
              setIsStreaming(false);
              return () => {};
            }
            try {
              const json = JSON.parse(data);
              const token = json.choices?.[0]?.delta?.content;
              if (token) {
                fullText += token;
                callbacks.onToken(token);
              }
            } catch {
              // skip malformed chunk
            }
          }
        }
        callbacks.onDone(fullText);
      } catch (e) {
        if (controller.signal.aborted) {
          callbacks.onDone(fullText);
        } else {
          callbacks.onError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }

      return () => controller.abort();
    },
    [validate, getEndpoint, settings.temperature, settings.maxTokens, settings.systemPrompt],
  );

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  return {
    streamChat,
    abort,
    isStreaming,
    validate,
    isActive: settings.provider !== "ritual",
    provider: settings.provider,
  };
}

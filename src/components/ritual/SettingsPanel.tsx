"use client";

/**
 * SettingsPanel — flagship settings drawer for Purrcha.
 *
 * Sections:
 *   1. LLM Provider — Ritual precompile (default) / Custom OpenAI-compatible / ChatGPT
 *   2. Custom endpoint config (base URL, model, API key) — shown when provider != ritual
 *   3. Generation params (temperature, max tokens, system prompt)
 *   4. Privacy & security (clear keys, clear history, auto-clear on disconnect)
 *
 * Design: matches the Purrcha dark terminal aesthetic. Slide-in drawer from the right.
 */

import { useEffect, useState } from "react";
import { useSettingsStore, PROVIDER_META, type LLMProvider } from "@/stores/settingsStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Settings, Shield, Key, Cpu, AlertTriangle, Trash2, RotateCcw, X } from "lucide-react";
import { useAsyncTxStore } from "@/stores/asyncTxStore";

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const { settings, update, reset, clearKeys } = useSettingsStore();
  const clearAllTransactions = useAsyncTxStore((s) => s.clearAll);
  const [showCustomKey, setShowCustomKey] = useState(false);
  const [showChatgptKey, setShowChatgptKey] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleProviderChange = (provider: LLMProvider) => {
    update({ provider });
  };

  const handleClearHistory = () => {
    if (typeof window !== "undefined") {
      // Clear async tx store (which holds encrypted local response copies)
      clearAllTransactions();
      // Clear wagmi localStorage (wallet connection)
      try {
        localStorage.removeItem("purrcha.wagmi.connected");
        localStorage.removeItem("wagmi.connected");
        localStorage.removeItem("wagmi.store");
      } catch {
        // ignore
      }
    }
  };

  const handleReset = () => {
    reset();
    setConfirmReset(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[540px] bg-bg border-l border-gray-800 p-0 overflow-hidden flex flex-col"
        aria-label="Purrcha settings"
      >
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b border-gray-800 bg-ritual-elevated/50 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-ritual-green" aria-hidden="true" />
            <div>
              <SheetTitle className="font-display text-lg tracking-wider text-gray-100">
                SETTINGS
              </SheetTitle>
              <SheetDescription className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">
                purrcha · configuration
              </SheetDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 text-gray-500 hover:text-gray-300 hover:bg-gray-800"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </Button>
        </SheetHeader>

        <ScrollArea className="flex-1 px-5 py-5">
          <div className="space-y-8">
            {/* ── LLM Provider ── */}
            <section aria-labelledby="provider-heading">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-4 h-4 text-ritual-green" aria-hidden="true" />
                <h2
                  id="provider-heading"
                  className="text-xs font-mono uppercase tracking-[0.2em] text-gray-300"
                >
                  LLM Provider
                </h2>
              </div>
              <div className="space-y-2">
                {(Object.keys(PROVIDER_META) as LLMProvider[]).map((provider) => {
                  const meta = PROVIDER_META[provider];
                  const isSelected = settings.provider === provider;
                  return (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => handleProviderChange(provider)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? meta.color === "green"
                            ? "border-ritual-green/50 bg-ritual-green/5 shadow-glow-green"
                            : meta.color === "gold"
                              ? "border-ritual-gold/50 bg-ritual-gold/5"
                              : "border-ritual-pink/50 bg-ritual-pink/5"
                          : "border-gray-800 bg-ritual-elevated/30 hover:border-gray-700"
                      }`}
                      aria-pressed={isSelected}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`text-lg font-mono ${
                            meta.color === "green"
                              ? "text-ritual-green"
                              : meta.color === "gold"
                                ? "text-ritual-gold"
                                : "text-ritual-pink"
                          }`}
                          aria-hidden="true"
                        >
                          {meta.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-200">
                              {meta.label}
                            </span>
                            {meta.onChain ? (
                              <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-ritual-green/30 text-ritual-green bg-ritual-green/5">
                                On-Chain
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-ritual-gold/30 text-ritual-gold bg-ritual-gold/5">
                                Off-Chain
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                            {meta.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── Custom Endpoint Config ── */}
            {settings.provider !== "ritual" && (
              <section aria-labelledby="endpoint-heading" className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Key className="w-4 h-4 text-ritual-gold" aria-hidden="true" />
                  <h2
                    id="endpoint-heading"
                    className="text-xs font-mono uppercase tracking-[0.2em] text-gray-300"
                  >
                    {settings.provider === "chatgpt" ? "ChatGPT Config" : "Endpoint Config"}
                  </h2>
                </div>

                {/* Warning banner */}
                <div className="p-3 rounded-lg border border-ritual-gold/30 bg-ritual-gold/5 flex gap-2">
                  <AlertTriangle
                    className="w-4 h-4 text-ritual-gold flex-shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <p className="text-[11px] text-ritual-gold/90 leading-relaxed">
                    <strong>Off-chain mode.</strong> Prompts are sent directly from your browser
                    to the configured endpoint. Responses are NOT settled on Ritual Chain and are
                    NOT TEE-verified. The API key is stored in your browser&apos;s localStorage —
                    rotate it regularly and do not use on shared devices.
                  </p>
                </div>

                {settings.provider === "openai-compatible" && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="custom-base-url" className="text-[11px] font-mono uppercase tracking-wider text-gray-400">
                        Base URL
                      </Label>
                      <Input
                        id="custom-base-url"
                        type="url"
                        value={settings.customBaseUrl}
                        onChange={(e) => update({ customBaseUrl: e.target.value })}
                        placeholder="https://your-provider.com/v1"
                        className="font-mono text-xs terminal-input"
                      />
                      <p className="text-[10px] text-gray-500 font-mono">
                        Any OpenAI-compatible /v1 endpoint (OpenAI, Together, Groq, vLLM, Ollama, etc.)
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="custom-model" className="text-[11px] font-mono uppercase tracking-wider text-gray-400">
                        Model
                      </Label>
                      <Input
                        id="custom-model"
                        type="text"
                        value={settings.customModel}
                        onChange={(e) => update({ customModel: e.target.value })}
                        placeholder="gpt-4o-mini"
                        className="font-mono text-xs terminal-input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="custom-api-key" className="text-[11px] font-mono uppercase tracking-wider text-gray-400">
                        API Key
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="custom-api-key"
                          type={showCustomKey ? "text" : "password"}
                          value={settings.customApiKey}
                          onChange={(e) => update({ customApiKey: e.target.value })}
                          placeholder="sk-..."
                          className="font-mono text-xs terminal-input flex-1"
                          autoComplete="off"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCustomKey(!showCustomKey)}
                          className="font-mono text-[10px] uppercase border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                        >
                          {showCustomKey ? "Hide" : "Show"}
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {settings.provider === "chatgpt" && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="chatgpt-model" className="text-[11px] font-mono uppercase tracking-wider text-gray-400">
                        ChatGPT Model
                      </Label>
                      <select
                        id="chatgpt-model"
                        value={settings.chatgptModel}
                        onChange={(e) => update({ chatgptModel: e.target.value })}
                        className="font-mono text-xs terminal-input w-full h-9 rounded-md px-3"
                      >
                        <option value="gpt-4o">gpt-4o (recommended)</option>
                        <option value="gpt-4o-mini">gpt-4o-mini (faster, cheaper)</option>
                        <option value="gpt-4-turbo">gpt-4-turbo</option>
                        <option value="gpt-4">gpt-4</option>
                        <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                        <option value="o1-preview">o1-preview</option>
                        <option value="o1-mini">o1-mini</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="chatgpt-api-key" className="text-[11px] font-mono uppercase tracking-wider text-gray-400">
                        OpenAI API Key
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="chatgpt-api-key"
                          type={showChatgptKey ? "text" : "password"}
                          value={settings.chatgptApiKey}
                          onChange={(e) => update({ chatgptApiKey: e.target.value })}
                          placeholder="sk-proj-..."
                          className="font-mono text-xs terminal-input flex-1"
                          autoComplete="off"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowChatgptKey(!showChatgptKey)}
                          className="font-mono text-[10px] uppercase border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                        >
                          {showChatgptKey ? "Hide" : "Show"}
                        </Button>
                      </div>
                      <p className="text-[10px] text-gray-500 font-mono">
                        Get a key at platform.openai.com/api-keys. Stored in your browser only.
                      </p>
                    </div>
                  </>
                )}
              </section>
            )}

            {/* ── Generation Params ── */}
            <section aria-labelledby="gen-heading" className="space-y-4">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-ritual-lime" aria-hidden="true" />
                <h2
                  id="gen-heading"
                  className="text-xs font-mono uppercase tracking-[0.2em] text-gray-300"
                >
                  Generation Parameters
                </h2>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="temperature" className="text-[11px] font-mono uppercase tracking-wider text-gray-400">
                    Temperature
                  </Label>
                  <span className="font-mono text-xs text-ritual-lime tabular-nums">
                    {settings.temperature.toFixed(2)}
                  </span>
                </div>
                <Slider
                  id="temperature"
                  min={0}
                  max={2}
                  step={0.05}
                  value={[settings.temperature]}
                  onValueChange={(v) => update({ temperature: v[0] })}
                  aria-label="Temperature"
                />
                <p className="text-[10px] text-gray-500 font-mono">
                  Lower = focused/deterministic. Higher = creative. Default 0.7.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="max-tokens" className="text-[11px] font-mono uppercase tracking-wider text-gray-400">
                    Max Tokens
                  </Label>
                  <span className="font-mono text-xs text-ritual-lime tabular-nums">
                    {settings.maxTokens}
                  </span>
                </div>
                <Slider
                  id="max-tokens"
                  min={256}
                  max={16384}
                  step={256}
                  value={[settings.maxTokens]}
                  onValueChange={(v) => update({ maxTokens: v[0] })}
                  aria-label="Max tokens"
                />
                <p className="text-[10px] text-gray-500 font-mono">
                  Maximum tokens to generate. Higher = longer responses + more cost.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="system-prompt" className="text-[11px] font-mono uppercase tracking-wider text-gray-400">
                  System Prompt (optional)
                </Label>
                <Textarea
                  id="system-prompt"
                  value={settings.systemPrompt}
                  onChange={(e) => update({ systemPrompt: e.target.value })}
                  placeholder="You are a helpful assistant..."
                  className="font-mono text-xs terminal-input min-h-[80px] resize-y"
                />
                <p className="text-[10px] text-gray-500 font-mono">
                  Prepended to every conversation. Applied to both Ritual and custom LLM paths.
                </p>
              </div>
            </section>

            {/* ── Privacy & Security ── */}
            <section aria-labelledby="privacy-heading" className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-ritual-green" aria-hidden="true" />
                <h2
                  id="privacy-heading"
                  className="text-xs font-mono uppercase tracking-[0.2em] text-gray-300"
                >
                  Privacy & Security
                </h2>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-gray-800 bg-ritual-elevated/30">
                <div className="flex-1 pr-3">
                  <p className="text-sm text-gray-300">Auto-clear on wallet disconnect</p>
                  <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                    Clear local response cache when wallet disconnects
                  </p>
                </div>
                <Switch
                  checked={settings.autoClearHistoryOnDisconnect}
                  onCheckedChange={(v) => update({ autoClearHistoryOnDisconnect: v })}
                  aria-label="Auto-clear on disconnect"
                />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearKeys}
                  className="justify-start font-mono text-xs uppercase tracking-wider border-ritual-gold/40 text-ritual-gold hover:bg-ritual-gold/10 hover:text-ritual-gold"
                >
                  <Key className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                  Clear stored API keys
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearHistory}
                  className="justify-start font-mono text-xs uppercase tracking-wider border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                  Clear local response cache
                </Button>
                {confirmReset ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReset}
                      className="flex-1 justify-start font-mono text-xs uppercase tracking-wider border-ritual-red/40 text-ritual-red hover:bg-ritual-red/10"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                      Confirm reset all settings
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmReset(false)}
                      className="font-mono text-xs text-gray-400"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmReset(true)}
                    className="justify-start font-mono text-xs uppercase tracking-wider border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                    Reset all settings to defaults
                  </Button>
                )}
              </div>
            </section>

            {/* ── About ── */}
            <section className="pt-4 border-t border-gray-800">
              <p className="text-[10px] font-mono text-gray-600 leading-relaxed">
                PURRCHA v1.0 · RITUAL CHAIN 1979 · LLM 0x0802 · IMAGE 0x0818 · ECIES · TEE-VERIFIED
                <br />
                Settings persist to localStorage. API keys are browser-only — never sent to any
                Purrcha backend.
              </p>
            </section>
          </div>
        </ScrollArea>

        <SheetFooter className="px-5 py-3 border-t border-gray-800 bg-ritual-elevated/30">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full font-mono text-xs uppercase tracking-wider border border-ritual-green text-ritual-green hover:bg-ritual-green/10"
          >
            ▰ Save & Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

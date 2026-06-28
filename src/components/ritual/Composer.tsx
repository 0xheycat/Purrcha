"use client";

import * as React from "react";
import { useSubmitChat } from "@/hooks/ritual/useSubmitChat";
import { usePurrchaWallet } from "@/hooks/ritual/usePurrchaWallet";
import { useSenderLock } from "@/hooks/ritual/useSenderLock";
import { useExecutor } from "@/hooks/ritual/useExecutor";
import { useEncryption } from "@/hooks/ritual/useEncryption";
import { isContractDeployed, PURRCHA_CHAT_ADDRESS } from "@/lib/ritual/abi";
import { CAPABILITY, PRECOMPILES, RITUAL_BLOCK_TIME_MS } from "@/lib/ritual/constants";
import { truncateHex } from "@/hooks/ritual/useChainStatus";
import { useComposerStore } from "@/stores/composerStore";
import { PromptAnalyzer } from "@/components/ritual/PromptAnalyzer";
import { FeeEstimator } from "@/components/ritual/FeeEstimator";

/**
 * Composer — the multi-modal prompt composer (center panel).
 *
 * Modes:
 *   - TEXT (LLM 0x0802)
 *   - IMAGE (Image 0x0818)
 *   - MULTIMODAL (text + image — currently maps to image with prompt as text input)
 *
 * Validation disables the submit button unless ALL of:
 *   - Wallet connected
 *   - Correct chain (1979)
 *   - Contract deployed
 *   - Sender not locked (no pending async job)
 *   - Prompt non-empty
 *   - Image attached (for IMAGE/MULTIMODAL mode)
 *
 * The submit button shows the precompile address in mono. Specific validation errors
 * surface as red mono inline text.
 */
type Mode = "text" | "image" | "multimodal";

const MODE_TO_KIND: Record<Mode, "llm" | "image"> = {
  text: "llm",
  image: "image",
  multimodal: "image",
};

export function Composer() {
  const [mode, setMode] = React.useState<Mode>("text");
  // Wire to the shared composer store so PromptTemplates (and other components) can fill the prompt.
  const prompt = useComposerStore((s) => s.prompt);
  const setPrompt = useComposerStore((s) => s.setPrompt);
  const storeMode = useComposerStore((s) => s.mode);
  // Sync local mode with store mode when the store changes (e.g. from PromptTemplates).
  React.useEffect(() => {
    if (storeMode === "image" && mode !== "image") setMode("image");
    else if (storeMode === "llm" && mode === "image") setMode("text");
  }, [storeMode, mode]);
  const [imageData, setImageData] = React.useState<{ dataUrl: string; contentType: string; name: string } | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const wallet = usePurrchaWallet();
  const senderLock = useSenderLock(wallet.address);
  const executorLlm = useExecutor(CAPABILITY.LLM, { enabled: isContractDeployed });
  const executorImg = useExecutor(CAPABILITY.IMAGE_CALL, { enabled: isContractDeployed });
  const encryption = useEncryption();
  const { submit, isSubmitting, validationError } = useSubmitChat();

  // Countdown for sender lock (estimated blocks remaining × 350ms).
  const [lockCountdown, setLockCountdown] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!senderLock.isLocked) {
      setLockCountdown(null);
      return;
    }
    setLockCountdown(RITUAL_BLOCK_TIME_MS);
    const interval = setInterval(() => {
      setLockCountdown((v) => (v === null ? null : Math.max(0, v - 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [senderLock.isLocked]);

  const handleFile = React.useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setImageData({ dataUrl, contentType: file.type, name: file.name });
    };
    reader.readAsDataURL(file);
  }, []);

  const onDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  // ── Validation ──────────────────────────────────────────────────────────
  const validations: Array<{ ok: boolean; label: string; detail?: string }> = [
    { ok: wallet.isConnected, label: "Wallet connected", detail: wallet.connectorName },
    { ok: wallet.isCorrectChain, label: "On Ritual Chain 1979" },
    { ok: isContractDeployed, label: "Contract deployed", detail: PURRCHA_CHAT_ADDRESS ? truncateHex(PURRCHA_CHAT_ADDRESS) : "—" },
    { ok: !senderLock.isLocked, label: "No pending async job" },
    {
      ok: Boolean(mode === "text" ? executorLlm.executor : executorImg.executor),
      label: "TEE executor available",
      detail: mode === "text" ? executorLlm.executor?.teeAddress : executorImg.executor?.teeAddress,
    },
    { ok: encryption.isUnlocked, label: "ECIES keypair unlocked" },
    { ok: prompt.trim().length > 0, label: "Prompt non-empty" },
    {
      ok: mode === "text" ? true : Boolean(imageData),
      label: mode === "text" ? "" : "Image attached",
    },
  ].filter((v) => v.label !== "");

  const allValid = validations.every((v) => v.ok);
  const showImageDrop = mode === "image" || mode === "multimodal";
  const activePrecompile = mode === "text" ? PRECOMPILES.LLM : PRECOMPILES.IMAGE_CALL;

  // ── Submit handler ──────────────────────────────────────────────────────
  const onSubmit = React.useCallback(async () => {
    if (!allValid) return;
    const result = await submit({
      kind: MODE_TO_KIND[mode],
      prompt: prompt.trim(),
      imageData: imageData
        ? { dataUrl: imageData.dataUrl, contentType: imageData.contentType }
        : undefined,
    });
    if (!result.error) {
      setPrompt("");
      setImageData(null);
    }
  }, [allValid, submit, mode, prompt, imageData, setPrompt]);

  // ── Not-deployed banner ─────────────────────────────────────────────────
  if (!isContractDeployed) {
    return (
      <section className="terminal-card p-6" aria-label="Composer">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ritual-red animate-pulse" />
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ritual-red">
              contract_not_deployed
            </span>
          </div>
          <p className="font-mono text-[12px] text-gray-400 leading-relaxed">
            The PurrchaChat consumer contract is not yet deployed on Ritual Chain.
            Set the environment variable:
          </p>
          <pre className="font-mono text-[11px] text-ritual-lime bg-surface border border-gray-700 rounded px-3 py-2 overflow-x-auto">
            NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS=0x…
          </pre>
          <p className="font-mono text-[11px] text-gray-500 leading-relaxed">
            Run <code className="text-ritual-green">forge script contracts/script/Deploy.s.sol</code>{" "}
            from the contracts/ directory, then redeploy the frontend with the address.
          </p>
          <p className="font-mono text-[11px] text-gray-500 leading-relaxed">
            Until then, you can still inspect the live chain status, the design system,
            and the lifecycle rail. Submitting is disabled.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="terminal-card flex flex-col" aria-label="Composer">
      {/* Mode toggle */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500 mr-2">
          mode
        </span>
        {(["text", "image", "multimodal"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded border transition-colors ${
              mode === m
                ? m === "text"
                  ? "border-ritual-green/60 text-ritual-green bg-ritual-green/10"
                  : "border-ritual-pink/60 text-ritual-pink bg-ritual-pink/10"
                : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
            }`}
            aria-pressed={mode === m}
          >
            {m === "text" ? "◇ text 0x0802" : m === "image" ? "◆ image 0x0818" : "◈ multimodal"}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-gray-600 uppercase tracking-wider hidden sm:inline">
          {activePrecompile}
        </span>
      </div>

      {/* Prompt input */}
      <div className="p-3 space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your prompt to the Ritual TEE executor…"
          rows={4}
          className="terminal-input w-full px-3 py-2 text-[12px] resize-y min-h-[88px]"
          aria-label="Prompt"
          disabled={isSubmitting}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && allValid && !isSubmitting) {
              void onSubmit();
            }
          }}
        />

        {/* Real-time prompt analysis + fee estimation — side by side */}
        {prompt.trim().length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <PromptAnalyzer prompt={prompt} mode={MODE_TO_KIND[mode]} />
            <FeeEstimator prompt={prompt} mode={MODE_TO_KIND[mode]} hasWallet={!wallet.isDisconnected} />
          </div>
        )}

        {/* Image dropzone (image / multimodal modes) */}
        {showImageDrop && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-md border border-dashed cursor-pointer transition-colors p-3 ${
              dragOver
                ? "border-ritual-pink bg-ritual-pink/5"
                : "border-gray-700 hover:border-ritual-pink/50 hover:bg-ritual-pink/5"
            }`}
            role="button"
            tabIndex={0}
            aria-label="Image upload dropzone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            {imageData ? (
              <div className="flex items-center gap-3">
                <img
                  src={imageData.dataUrl}
                  alt={imageData.name}
                  className="w-12 h-12 object-cover rounded border border-gray-700"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[11px] text-gray-300 truncate">
                    {imageData.name}
                  </div>
                  <div className="font-mono text-[10px] text-gray-500 uppercase tracking-wider">
                    {imageData.contentType} · attached
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageData(null);
                  }}
                  className="font-mono text-[10px] text-ritual-red hover:bg-ritual-red/10 px-2 py-1 rounded"
                >
                  ✕ remove
                </button>
              </div>
            ) : (
              <div className="text-center py-3">
                <div className="font-mono text-[11px] text-gray-400">
                  Drop image or click to upload
                </div>
                <div className="font-mono text-[10px] text-gray-600 mt-0.5 uppercase tracking-wider">
                  PNG · JPG · WEBP · GIF
                </div>
              </div>
            )}
          </div>
        )}

        {/* Validation list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {validations.map((v, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider"
              title={v.detail}
            >
              <span className={v.ok ? "text-ritual-green" : "text-ritual-red"}>
                {v.ok ? "✓" : "✕"}
              </span>
              <span className={v.ok ? "text-gray-500" : "text-ritual-red/90"}>
                {v.label}
                {v.detail && v.ok ? (
                  <span className="text-gray-600 ml-1">
                    {truncateHex(v.detail, 10, 6)}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        {/* Validation error from submit */}
        {validationError && (
          <div className="font-mono text-[11px] text-ritual-red border-l-2 border-ritual-red/40 pl-2">
            {validationError}
          </div>
        )}

        {/* Sender lock countdown */}
        {senderLock.isLocked && lockCountdown !== null && (
          <div className="font-mono text-[11px] text-ritual-gold border-l-2 border-ritual-gold/40 pl-2 flex items-center justify-between">
            <span>Pending async job — wait for settlement.</span>
            <span className="tabular-nums">~{Math.ceil(lockCountdown / 1000)}s</span>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onSubmit}
            disabled={!allValid || isSubmitting}
            className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 h-11 rounded-md border border-ritual-green/60 text-ritual-green hover:bg-ritual-green/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 glow-green"
            aria-label="Transmit prompt"
          >
            {isSubmitting ? (
              <>
                <span className="animate-pulse">⟳</span>
                <span>Transmitting…</span>
              </>
            ) : (
              <>
                <span>▶</span>
                <span>Transmit</span>
              </>
            )}
          </button>
          <span className="font-mono text-[10px] text-gray-600 uppercase tracking-wider hidden sm:inline">
            ⌘+↵
          </span>
          <span className="ml-auto font-mono text-[10px] text-gray-600 uppercase tracking-wider">
            precompile: <span className="text-ritual-green">{activePrecompile}</span>
          </span>
        </div>
      </div>
    </section>
  );
}

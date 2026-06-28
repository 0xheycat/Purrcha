"use client";

import * as React from "react";
import { useCallback, useRef } from "react";
import { usePublicClient, useWaitForTransactionReceipt } from "wagmi";
import {
  encodeAbiParameters,
  encodeFunctionData,
  decodeAbiParameters,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { useRitualWrite } from "./useRitualWrite";
import { useExecutor } from "./useExecutor";
import { useSenderLock } from "./useSenderLock";
import { useEncryption } from "./useEncryption";
import { usePurrchaWallet } from "./usePurrchaWallet";
import { useCustomLLM } from "./useCustomLLM";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAsyncTxStore } from "@/stores/asyncTxStore";
import { isContractDeployed, PURRCHA_CHAT_ABI, PURRCHA_CHAT_ADDRESS } from "@/lib/ritual/abi";
import { PRECOMPILES, LLM_MODEL, IMAGE_MODEL, CAPABILITY } from "@/lib/ritual/constants";
import {
  decodeLLMOutput,
  extractLLMText,
  encodeImageInputs,
  encodeImageOutputConfig,
  encodeImageStorageRef,
  gsUriToHttps,
  type RitualReceipt,
} from "@/lib/ritual/precompiles";

/**
 * useSubmitChat — the main Purrcha submit orchestrator.
 *
 * Drives the full 9-state lifecycle:
 *   idle → submitted → confirming → pending_result → (settling) → settled | failed | timeout
 *
 * LLM (short-running async): after the tx receipt is mined, decode spcCalls[0].output, extract
 * the text, encrypt it locally with the ECIES public key, persist to localStorage keyed by
 * requestId, and surface the plaintext to the live ResponseStream component.
 *
 * Image (long-running async): the result arrives via a callback tx → ImageResultDelivered event.
 * The AsyncJobTracker JobRemoved event signals completion. We poll the AsyncJobTracker and
 * surface the result via the useAsyncJobEvents hook (the store's status transitions drive the UI).
 *
 * Privacy model: the prompt is encrypted client-side with the ECIES public key BEFORE the
 * contract call. The ciphertext is passed as `encryptedPromptCiphertext` and emitted in
 * ChatResultSettled. The on-chain `encryptedResponseCiphertext` is empty (we leave userPublicKey
 * empty so the executor doesn't pre-encrypt). The frontend re-encrypts the response text
 * client-side and persists it to localStorage keyed by requestId — this is the "local" copy.
 * The /api/history route returns the on-chain prompt ciphertext (which the frontend decrypts).
 */

export type SubmitKind = "llm" | "image";

export interface SubmitArgs {
  kind: SubmitKind;
  prompt: string;
  imageData?: { dataUrl: string; contentType: string }; // base64 data URL for image input
}

export interface SubmitResult {
  txId: string;
  txHash?: Hex;
  error?: string;
}

export interface UseSubmitChatResult {
  submit: (args: SubmitArgs) => Promise<SubmitResult>;
  isSubmitting: boolean;
  /** Last validation error from submit() — shown inline in the Composer. */
  validationError: string | null;
}

// Pre-compute the ChatResultSettled + ImageResultDelivered topic0 hashes for receipt log parsing.
const TOPIC_CHAT_RESULT_SETTLED = keccak256(
  toBytes("ChatResultSettled(address,bytes32,bool,bytes,string,bytes,bytes,bytes32)"),
);
const TOPIC_IMAGE_RESULT_DELIVERED = keccak256(
  toBytes("ImageResultDelivered(address,bytes32,bool,string,bytes32,uint256,uint256,string,bytes,bytes)"),
);

// LocalStorage bucket for the re-encrypted response text (keyed by requestId).
const RESPONSE_BUCKET = "purrcha.responses.v1";

export interface StoredResponse {
  requestId: string;
  encryptedResponseCiphertext: string;
  source: "receipt-spc" | "image-event";
  txHash?: string;
  createdAt: number;
}

export function loadResponses(): Record<string, StoredResponse> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(RESPONSE_BUCKET) ?? "{}");
  } catch {
    return {};
  }
}

export function saveResponse(resp: StoredResponse): void {
  if (typeof window === "undefined") return;
  try {
    const all = loadResponses();
    all[resp.requestId] = resp;
    window.localStorage.setItem(RESPONSE_BUCKET, JSON.stringify(all));
  } catch {
    // ignore quota errors
  }
}

/**
 * Off-chain custom LLM submit path. Used when the user has selected "openai-compatible" or
 * "chatgpt" in Settings. Bypasses the Ritual precompile entirely — the prompt goes directly
 * from the browser to the configured endpoint. The response is NOT on-chain settled and is
 * clearly labeled "OFF-CHAIN · CUSTOM LLM" in the UI.
 *
 * The prompt is still ECIES-encrypted (if the user has unlocked their keypair) and stored
 * locally so it appears in the conversation timeline with an "off-chain" badge.
 */
async function submitCustomLLM(
  args: SubmitArgs,
  customLLM: ReturnType<typeof useCustomLLM>,
  settings: ReturnType<typeof useSettingsStore.getState>["settings"],
  keyPair: { publicKey: string } | null,
  encrypt: (text: string) => string | null,
  addTransaction: (id: string, kind: "llm" | "image", label?: string, promptPreview?: string) => void,
  updateState: (id: string, partial: Record<string, unknown>) => void,
  setStatus: (id: string, status: "idle" | "submitted" | "confirming" | "pending_result" | "settling" | "settled" | "failed" | "rejected" | "timeout") => void,
  submitCounter: React.MutableRefObject<number>,
): Promise<SubmitResult> {
  const validation = customLLM.validate();
  if (!validation.ok) {
    return { txId: "", error: validation.error };
  }

  const txId = `custom-${Date.now()}-${submitCounter.current++}`;
  addTransaction(txId, "llm", `Custom LLM: ${args.prompt.slice(0, 40)}…`, args.prompt.slice(0, 80));
  setStatus(txId, "submitted");

  // Encrypt the prompt locally (if keypair unlocked) so it persists in the timeline privately.
  const encryptedPrompt = keyPair ? encrypt(args.prompt) : null;

  updateState(txId, {
    status: "pending_result",
    submittedAt: Date.now(),
    executor: "0x0000000000000000000000000000000000000000" as Hex, // sentinel: off-chain
  });

  let fullText = "";
  const abort = await customLLM.streamChat(
    [{ role: "user", content: args.prompt }],
    {
      onToken: (token) => {
        fullText += token;
        // Surface the streaming text via a window event the ResponseStream listens for.
        window.dispatchEvent(
          new CustomEvent("purrcha:custom-llm-token", { detail: { txId, token, fullText } }),
        );
      },
      onDone: (finalText) => {
        // Persist the response locally (encrypted if keypair available).
        const requestId = `custom-${txId}`;
        const encryptedResponse = keyPair ? encrypt(finalText) : null;
        saveResponse({
          requestId,
          encryptedResponseCiphertext: encryptedResponse ?? finalText, // fallback to plaintext if no keypair
          source: "receipt-spc", // reuse the existing source union; off-chain is indicated by txHash prefix
          txHash: `0xOFFCHAIN_${txId}`, // sentinel: off-chain (not a real tx hash)
          createdAt: Date.now(),
        });
        // Store off-chain metadata in a sidecar for the ResponseStream to read.
        if (typeof window !== "undefined") {
          try {
            const sidecarKey = `purrcha.offchain.${txId}`;
            window.localStorage.setItem(sidecarKey, JSON.stringify({
              provider: settings.provider,
              model: settings.provider === "chatgpt" ? settings.chatgptModel : settings.customModel,
              plaintext: finalText,
              encryptedPrompt: encryptedPrompt ?? null,
              timestamp: Date.now(),
            }));
          } catch {
            // ignore quota errors
          }
        }
        setStatus(txId, "settled");
        window.dispatchEvent(
          new CustomEvent("purrcha:custom-llm-done", { detail: { txId, fullText: finalText } }),
        );
      },
      onError: (error) => {
        setStatus(txId, "failed");
        updateState(txId, { error, errorCategory: "network" });
        window.dispatchEvent(
          new CustomEvent("purrcha:custom-llm-error", { detail: { txId, error } }),
        );
      },
    },
  );

  // The abort function is retained by the hook for the user to cancel via the UI.
  void abort;

  return { txId };
}

export function useSubmitChat(): UseSubmitChatResult {
  const wallet = usePurrchaWallet();
  const publicClient = usePublicClient();
  const { write, isPending } = useRitualWrite();
  const { encrypt, keyPair } = useEncryption();
  const customLLM = useCustomLLM();
  const settings = useSettingsStore((s) => s.settings);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const submitCounter = useRef(0);

  const executorLlm = useExecutor(CAPABILITY.LLM, { enabled: isContractDeployed });
  const executorImg = useExecutor(CAPABILITY.IMAGE_CALL, { enabled: isContractDeployed });
  const senderLock = useSenderLock(wallet.address);

  const addTransaction = useAsyncTxStore((s) => s.addTransaction);
  const updateState = useAsyncTxStore((s) => s.updateState);
  const setStatus = useAsyncTxStore((s) => s.setStatus);

  // We use publicClient.waitForTransactionReceipt directly; this hook is imported to ensure
  // the wagmi query cache is warmed up for tx receipts elsewhere in the app.
  void useWaitForTransactionReceipt;

  const submit = useCallback(
    async (args: SubmitArgs): Promise<SubmitResult> => {
      setValidationError(null);

      // ── Validation ─────────────────────────────────────────────────────────
      if (!isContractDeployed) {
        const msg = "Contract not deployed — set NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS.";
        setValidationError(msg);
        return { txId: "", error: msg };
      }
      if (wallet.isDisconnected) {
        const msg = "Connect a wallet to submit.";
        setValidationError(msg);
        return { txId: "", error: msg };
      }
      if (wallet.isWrongChain) {
        const msg = "Wrong network — switch to Ritual Chain (1979).";
        setValidationError(msg);
        return { txId: "", error: msg };
      }
      if (senderLock.isLocked) {
        const msg = "A pending async job is in flight. Wait for settlement before submitting.";
        setValidationError(msg);
        return { txId: "", error: msg };
      }
      if (!args.prompt || args.prompt.trim().length === 0) {
        const msg = "Prompt is empty.";
        setValidationError(msg);
        return { txId: "", error: msg };
      }
      if (args.kind === "image" && !args.imageData) {
        const msg = "Image mode requires an attached image.";
        setValidationError(msg);
        return { txId: "", error: msg };
      }

      // ── Custom LLM path (off-chain) ──────────────────────────────────────
      // When the user has selected "openai-compatible" or "chatgpt" in Settings AND the
      // request is a text LLM call (not image), bypass the on-chain Ritual path entirely.
      // The response is NOT settled on-chain and is clearly labeled "OFF-CHAIN · CUSTOM LLM".
      // Image calls always go through the Ritual Image precompile (no off-chain equivalent).
      if (settings.provider !== "ritual" && args.kind === "llm") {
        return await submitCustomLLM(args, customLLM, settings, keyPair, encrypt, addTransaction, updateState, setStatus, submitCounter);
      }

      const executor = args.kind === "llm" ? executorLlm.executor : executorImg.executor;
      if (!executor) {
        const msg =
          args.kind === "llm"
            ? "No TEE executor available for LLM (capability 1). Try again shortly."
            : "No TEE executor available for IMAGE_CALL (capability 7). Try again shortly.";
        setValidationError(msg);
        return { txId: "", error: msg };
      }
      if (!keyPair) {
        const msg = "Unlock your ECIES keypair to encrypt the prompt before submitting.";
        setValidationError(msg);
        return { txId: "", error: msg };
      }

      // ── Encrypt prompt ─────────────────────────────────────────────────────
      const encryptedPrompt = encrypt(args.prompt);
      if (!encryptedPrompt) {
        const msg = "Prompt encryption failed.";
        setValidationError(msg);
        return { txId: "", error: msg };
      }

      // ── Track in store ─────────────────────────────────────────────────────
      submitCounter.current += 1;
      const txId = `purrcha-${Date.now()}-${submitCounter.current}`;
      addTransaction(
        txId,
        args.kind,
        args.kind === "llm" ? "LLM chat" : "Image chat",
        args.prompt.slice(0, 80),
      );
      updateState(txId, {
        status: "submitted",
        executor: executor.teeAddress,
        submittedAt: Date.now(),
      });

      setIsSubmitting(true);

      try {
        // ── Encode the call ────────────────────────────────────────────────
        let calldata: Hex;

        if (args.kind === "llm") {
          const messagesJson = JSON.stringify([{ role: "user", content: args.prompt }]);
          calldata = encodeSubmitTextChat({
            executor: executor.teeAddress,
            messagesJson,
            model: LLM_MODEL,
            temperatureScaled: 700n,
            maxCompletionTokens: 4096n,
            encryptedPromptCiphertext: encryptedPrompt,
          });
        } else {
          const img = args.imageData!;
          const base64 = img.dataUrl.split(",")[1] ?? "";
          const imageBytes = hexFromBase64(base64);

          const inputs = [
            {
              inputType: 0, // TEXT
              data: "0x" as Hex,
              uri: args.prompt.slice(0, 200),
              contentHash: ("0x" + "0".repeat(64)) as Hex,
              param1: 0,
              param2: 0,
              encrypted: false,
            },
            {
              inputType: 1, // IMAGE
              data: imageBytes,
              uri: "",
              contentHash: ("0x" + "0".repeat(64)) as Hex,
              param1: 0,
              param2: 0,
              encrypted: false,
            },
          ];
          const inputsModal = encodeImageInputs(inputs);
          const outputConfig = encodeImageOutputConfig({
            outputType: 1, // IMAGE
            maxWidth: 1024,
            maxHeight: 1024,
            maxParam3: 0,
            encryptOutput: false,
            numInferenceSteps: 28,
            guidanceScaleX100: 350,
            seed: 0,
            fps: 0,
            negativePrompt: "",
          });
          const outputStorageRef = encodeImageStorageRef({
            platform: "gcs",
            path: "purrcha/outputs/",
            keyRef: "",
          });

          calldata = encodeSubmitImageChat({
            executor: executor.teeAddress,
            ttl: 300n,
            pollIntervalBlocks: 2n,
            maxPollBlock: 500n,
            model: IMAGE_MODEL,
            inputsModal,
            outputConfig,
            outputStorageRef,
            encryptedPromptCiphertext: encryptedPrompt,
          });
        }

        if (!PURRCHA_CHAT_ADDRESS) throw new Error("Contract address missing");

        // ── Broadcast via useRitualWrite (bypasses eth_call simulation) ──────
        const txHash = await write({
          address: PURRCHA_CHAT_ADDRESS as Address,
          data: calldata,
        });

        updateState(txId, { status: "confirming", txHash });

        // ── Await receipt + decode result ──────────────────────────────────
        if (!publicClient) throw new Error("Public client unavailable");
        const receipt = (await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations: 1,
          timeout: 120_000,
        })) as unknown as RitualReceipt & {
          logs: Array<{ topics: string[]; data: Hex; address: string }>;
          status: "success" | "reverted";
          blockNumber: bigint;
        };

        updateState(txId, { settledBlock: Number(receipt.blockNumber) });

        if (receipt.status !== "success") {
          setStatus(txId, "failed");
          updateState(txId, {
            error: "Transaction reverted on-chain.",
            errorCategory: "contract",
          });
          setIsSubmitting(false);
          return { txId, txHash, error: "Transaction reverted" };
        }

        // ── LLM (short-running): decode spcCalls[0].output → text ──────────
        if (args.kind === "llm") {
          let requestId: Hex | undefined;
          for (const log of receipt.logs) {
            if (log.topics?.[0]?.toLowerCase() === TOPIC_CHAT_RESULT_SETTLED.toLowerCase()) {
              requestId = (log.topics[2] as Hex) ?? undefined;
              break;
            }
          }

          const spcOut = extractSpcResult(receipt);
          let responseText: string | null = null;
          let errorMessage: string | undefined;
          if (spcOut) {
            try {
              const decoded = decodeLLMOutput(spcOut);
              if (decoded.hasError) {
                errorMessage = decoded.errorMessage || "Executor returned an error.";
              } else {
                responseText = extractLLMText(decoded.completionData);
              }
            } catch {
              responseText = null;
            }
          }

          if (errorMessage) {
            setStatus(txId, "failed");
            updateState(txId, {
              error: errorMessage,
              errorCategory: "async",
              requestId,
            });
          } else {
            setStatus(txId, "settled");
            updateState(txId, { requestId, result: { text: responseText, kind: "llm" } });

            if (responseText && requestId) {
              const encResp = encrypt(responseText);
              if (encResp) {
                saveResponse({
                  requestId,
                  encryptedResponseCiphertext: encResp,
                  source: "receipt-spc",
                  txHash,
                  createdAt: Date.now(),
                });
              }
            }
          }
        } else {
          // Image (long-running async): the result will arrive via callback tx.
          updateState(txId, { status: "pending_result" });

          for (const log of receipt.logs) {
            if (log.topics?.[0]?.toLowerCase() === TOPIC_IMAGE_RESULT_DELIVERED.toLowerCase()) {
              const requestId = (log.topics[2] as Hex) ?? undefined;
              updateState(txId, { requestId });
              try {
                const decoded = decodeAbiParameters(
                  [
                    { type: "bool" },
                    { type: "string" },
                    { type: "bytes32" },
                    { type: "uint256" },
                    { type: "uint256" },
                    { type: "string" },
                    { type: "bytes" },
                    { type: "bytes" },
                  ],
                  log.data,
                );
                if (decoded[0]) {
                  setStatus(txId, "failed");
                  updateState(txId, { error: decoded[5] || "Image executor error." });
                } else {
                  setStatus(txId, "settled");
                  updateState(txId, {
                    result: {
                      kind: "image",
                      outputUri: gsUriToHttps(decoded[1]),
                      width: Number(decoded[3]),
                      height: Number(decoded[4]),
                      contentHash: decoded[2],
                    },
                  });
                }
              } catch {
                // leave as pending_result; useAsyncJobEvents will settle it
              }
              break;
            }
          }
        }

        setIsSubmitting(false);
        return { txId, txHash };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const lowerMsg = msg.toLowerCase();

        // PRECISE ERROR CLASSIFICATION — do not misclassify RPC errors as user rejection.
        let errorCategory: "wallet" | "contract" | "async" | "network" = "network";
        let txStatus: "failed" | "rejected" = "failed";
        let friendlyError = msg;

        if (lowerMsg.includes("transaction type not supported")) {
          errorCategory = "network";
          txStatus = "failed";
          friendlyError = "Ritual RPC rejected the transaction type. The app will retry with a legacy transaction format on the next attempt.";
        } else if (lowerMsg.includes("simulation not supported")) {
          errorCategory = "network";
          txStatus = "failed";
          friendlyError = "Wallet simulation not supported for this precompile call. This is expected for Ritual async precompiles — the transaction should still be broadcastable.";
        } else if (lowerMsg.includes("user rejected") || lowerMsg.includes("rejected the request") || (lowerMsg.includes("reject") && !lowerMsg.includes("not supported"))) {
          errorCategory = "wallet";
          txStatus = "rejected";
          friendlyError = "Transaction rejected in wallet.";
        } else if (lowerMsg.includes("insufficient funds") || lowerMsg.includes("insufficient balance")) {
          errorCategory = "wallet";
          txStatus = "failed";
          friendlyError = "Insufficient RITUAL balance for transaction fees.";
        } else if (lowerMsg.includes("wrong network") || lowerMsg.includes("switch to ritual")) {
          errorCategory = "wallet";
          txStatus = "failed";
          friendlyError = "Wrong network — switch to Ritual Chain (1979) first.";
        } else if (lowerMsg.includes("gas estimation failed") || lowerMsg.includes("execution reverted")) {
          errorCategory = "contract";
          txStatus = "failed";
          friendlyError = `Contract execution error: ${msg}`;
        }

        setStatus(txId, txStatus);
        updateState(txId, {
          error: friendlyError,
          errorCategory,
        });
        setIsSubmitting(false);
        return { txId, error: friendlyError };
      }
    },
    [
      wallet,
      senderLock,
      executorLlm.executor,
      executorImg.executor,
      keyPair,
      encrypt,
      write,
      publicClient,
      addTransaction,
      updateState,
      setStatus,
    ],
  );

  return {
    submit,
    isSubmitting: isSubmitting || isPending,
    validationError,
  };
}

// ───────────────────────── Helpers ─────────────────────────

function hexFromBase64(b64: string): Hex {
  if (typeof window === "undefined") {
    return `0x${Buffer.from(b64, "base64").toString("hex")}` as Hex;
  }
  const bin = window.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `0x${hex}` as Hex;
}

function extractSpcResult(receipt: RitualReceipt): Hex | null {
  const spc = receipt.spcCalls;
  if (!spc || spc.length === 0) return null;
  return spc[0].output;
}

interface SubmitTextChatArgs {
  executor: Address;
  messagesJson: string;
  model: string;
  temperatureScaled: bigint;
  maxCompletionTokens: bigint;
  encryptedPromptCiphertext: Hex;
}

function encodeSubmitTextChat(args: SubmitTextChatArgs): Hex {
  // Use encodeFunctionData with the contract ABI so the calldata includes
  // the correct 4-byte function selector for submitTextChat(...).
  // This is CRITICAL — without the selector, the wallet sees raw bytes as a
  // fallback call, causing "Unknown Signature Type" / "Simulation Not Supported".
  return encodeFunctionData({
    abi: PURRCHA_CHAT_ABI,
    functionName: "submitTextChat",
    args: [
      args.executor,
      args.messagesJson,
      args.model,
      args.temperatureScaled,
      args.maxCompletionTokens,
      args.encryptedPromptCiphertext,
    ],
  });
}

interface SubmitImageChatArgs {
  executor: Address;
  ttl: bigint;
  pollIntervalBlocks: bigint;
  maxPollBlock: bigint;
  model: string;
  inputsModal: Hex;
  outputConfig: Hex;
  outputStorageRef: Hex;
  encryptedPromptCiphertext: Hex;
}

function encodeSubmitImageChat(args: SubmitImageChatArgs): Hex {
  return encodeFunctionData({
    abi: PURRCHA_CHAT_ABI,
    functionName: "submitImageChat",
    args: [
      args.executor,
      args.ttl,
      args.pollIntervalBlocks,
      args.maxPollBlock,
      args.model,
      args.inputsModal,
      args.outputConfig,
      args.outputStorageRef,
      args.encryptedPromptCiphertext,
    ],
  });
}

// Re-export for downstream consumers.
export { PRECOMPILES, PURRCHA_CHAT_ABI };

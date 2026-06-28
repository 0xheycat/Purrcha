/**
 * Ritual precompile encoding/decoding helpers (viem-based, framework-agnostic).
 * Follows the 30-field LLM ABI and 18-field Image ABI from
 * ritual-dapp-precompiles/SKILL.md exactly.
 */

import {
  encodeAbiParameters,
  decodeAbiParameters,
  type Hex,
  type Address,
} from "viem";
import { PRECOMPILES } from "./constants";

// ───────────────────────── LLM Precompile (0x0802) — 30 fields ─────────────────────────

export const LLM_CALL_ABI = [
  { type: "address" },                    // 0  executor
  { type: "bytes[]" },                    // 1  encryptedSecrets
  { type: "uint256" },                    // 2  ttl
  { type: "bytes[]" },                    // 3  secretSignatures
  { type: "bytes" },                      // 4  userPublicKey
  { type: "string" },                     // 5  messagesJson
  { type: "string" },                     // 6  model
  { type: "int256" },                     // 7  frequencyPenalty
  { type: "string" },                     // 8  logitBiasJson
  { type: "bool" },                       // 9  logprobs
  { type: "int256" },                     // 10 maxCompletionTokens
  { type: "string" },                     // 11 metadataJson
  { type: "string" },                     // 12 modalitiesJson
  { type: "uint256" },                    // 13 n
  { type: "bool" },                       // 14 parallelToolCalls
  { type: "int256" },                     // 15 presencePenalty
  { type: "string" },                     // 16 reasoningEffort
  { type: "bytes" },                      // 17 responseFormatData
  { type: "int256" },                     // 18 seed
  { type: "string" },                     // 19 serviceTier
  { type: "string" },                     // 20 stopJson
  { type: "bool" },                       // 21 stream
  { type: "int256" },                     // 22 temperature (×1000)
  { type: "bytes" },                      // 23 toolChoiceData
  { type: "bytes" },                      // 24 toolsData
  { type: "int256" },                     // 25 topLogprobs
  { type: "int256" },                     // 26 topP (×1000)
  { type: "string" },                     // 27 user
  { type: "bool" },                       // 28 piiEnabled
  { type: "tuple", components: [{ type: "string" }, { type: "string" }, { type: "string" }] }, // 29 convoHistory
] as const;

export interface LLMCallParams {
  executor: Address;
  messagesJson: string;
  model: string;
  temperatureScaled?: bigint; // default 700n (0.7)
  maxCompletionTokens?: bigint; // default 4096n
  ttl?: bigint; // default 300n
  encryptedSecrets?: Hex[];
  secretSignatures?: Hex[];
  userPublicKey?: Hex;
}

export function encodeLLMCall(params: LLMCallParams): Hex {
  return encodeAbiParameters(LLM_CALL_ABI, [
    params.executor,
    params.encryptedSecrets ?? [],
    params.ttl ?? 300n,
    params.secretSignatures ?? [],
    params.userPublicKey ?? "0x",
    params.messagesJson,
    params.model,
    0n, // frequencyPenalty
    "", // logitBiasJson
    false, // logprobs
    params.maxCompletionTokens ?? 4096n,
    "", // metadataJson
    "", // modalitiesJson
    1n, // n
    true, // parallelToolCalls
    0n, // presencePenalty
    "medium", // reasoningEffort
    "0x", // responseFormatData
    -1n, // seed (null)
    "auto", // serviceTier
    "", // stopJson
    false, // stream
    params.temperatureScaled ?? 700n,
    "0x", // toolChoiceData
    "0x", // toolsData
    -1n, // topLogprobs (null)
    1000n, // topP (1.0 × 1000)
    "", // user
    false, // piiEnabled
    ["", "", ""] as [string, string, string], // convoHistory (empty)
  ]);
}

/** LLM output: (bool hasError, bytes completionData, bytes modelMetadata, string errorMessage, (string,string,string) updatedConvoHistory) */
export const LLM_OUTPUT_ABI = [
  { type: "bool" },
  { type: "bytes" },
  { type: "bytes" },
  { type: "string" },
  { type: "tuple", components: [{ type: "string" }, { type: "string" }, { type: "string" }] },
] as const;

export interface LLMOutput {
  hasError: boolean;
  completionData: Hex;
  modelMetadata: Hex;
  errorMessage: string;
}

export function decodeLLMOutput(raw: Hex): LLMOutput {
  const [hasError, completionData, modelMetadata, errorMessage] = decodeAbiParameters(
    LLM_OUTPUT_ABI,
    raw,
  );
  return { hasError, completionData, modelMetadata, errorMessage };
}

/**
 * The completionData returned by the LLM precompile is itself ABI-encoded (a nested
 * CompletionData struct). The human-readable text is the first string field. We best-effort
 * decode it; if it fails, return the raw hex.
 */
export function extractLLMText(completionData: Hex): string {
  try {
    const decoded = decodeAbiParameters([{ type: "string" }], completionData);
    return decoded[0];
  } catch {
    try {
      // Some models return JSON in completionData; try decoding as a tuple with a string.
      const decoded = decodeAbiParameters(
        [{ type: "string" }, { type: "string" }],
        completionData,
      );
      return decoded[0];
    } catch {
      return completionData;
    }
  }
}

// ───────────────────────── Image Precompile (0x0818) — 18 fields ─────────────────────────

/** ModalInput: (uint8 inputType, bytes data, string uri, bytes32 contentHash, uint32 param1, uint32 param2, bool encrypted) */
const MODAL_INPUT_ABI = {
  type: "tuple",
  components: [
    { name: "inputType", type: "uint8" }, // 0=TEXT, 1=IMAGE, 2=AUDIO, 3=VIDEO
    { name: "data", type: "bytes" },
    { name: "uri", type: "string" },
    { name: "contentHash", type: "bytes32" },
    { name: "param1", type: "uint32" },
    { name: "param2", type: "uint32" },
    { name: "encrypted", type: "bool" },
  ],
} as const;

/** OutputConfig: (uint8 outputType, uint32 maxWidth, uint32 maxHeight, uint32 maxParam3, bool encryptOutput, uint16 numInferenceSteps, uint16 guidanceScaleX100, uint32 seed, uint8 fps, string negativePrompt) */
const OUTPUT_CONFIG_ABI = {
  type: "tuple",
  components: [
    { name: "outputType", type: "uint8" }, // 1=IMAGE
    { name: "maxWidth", type: "uint32" },
    { name: "maxHeight", type: "uint32" },
    { name: "maxParam3", type: "uint32" },
    { name: "encryptOutput", type: "bool" },
    { name: "numInferenceSteps", type: "uint16" },
    { name: "guidanceScaleX100", type: "uint16" },
    { name: "seed", type: "uint32" },
    { name: "fps", type: "uint8" },
    { name: "negativePrompt", type: "string" },
  ],
} as const;

const STORAGE_REF_ABI = {
  type: "tuple",
  components: [{ type: "string" }, { type: "string" }, { type: "string" }],
} as const;

export interface ImageCallParams {
  executor: Address;
  ttl?: bigint;
  pollIntervalBlocks?: bigint;
  maxPollBlock?: bigint;
  model: string;
  inputs: Array<{
    inputType: number; // 0=TEXT, 1=IMAGE
    data: Hex;
    uri: string;
    contentHash: Hex;
    param1: number;
    param2: number;
    encrypted: boolean;
  }>;
  outputConfig: {
    outputType: number; // 1=IMAGE
    maxWidth: number;
    maxHeight: number;
    maxParam3: number;
    encryptOutput: boolean;
    numInferenceSteps: number;
    guidanceScaleX100: number;
    seed: number;
    fps: number;
    negativePrompt: string;
  };
  outputStorageRef: { platform: string; path: string; keyRef: string };
}

export function encodeImageInputs(inputs: ImageCallParams["inputs"]): Hex {
  return encodeAbiParameters(
    [{ type: "tuple[]", components: MODAL_INPUT_ABI.components }],
    [inputs as unknown as Record<string, unknown>[]],
  );
}

export function encodeImageOutputConfig(cfg: ImageCallParams["outputConfig"]): Hex {
  return encodeAbiParameters([OUTPUT_CONFIG_ABI], [cfg as unknown as Record<string, unknown>]);
}

export function encodeImageStorageRef(ref: ImageCallParams["outputStorageRef"]): Hex {
  return encodeAbiParameters([STORAGE_REF_ABI], [[ref.platform, ref.path, ref.keyRef]]);
}

/** Image Phase 2 result decoder. */
export const IMAGE_RESULT_ABI = [
  { type: "bool" }, // hasError
  { type: "bytes" }, // completionData
  { type: "string" }, // outputUri
  { type: "bytes32" }, // outputContentHash
  { type: "bool" }, // outputEncrypted
  { type: "uint32" }, // outputSizeBytes
  { type: "uint32" }, // outputWidth
  { type: "uint32" }, // outputHeight
  { type: "string" }, // errorMessage
] as const;

export interface ImageResult {
  hasError: boolean;
  completionData: Hex;
  outputUri: string;
  outputContentHash: Hex;
  outputEncrypted: boolean;
  outputSizeBytes: number;
  outputWidth: number;
  outputHeight: number;
  errorMessage: string;
}

export function decodeImageResult(raw: Hex): ImageResult {
  const [hasError, completionData, outputUri, outputContentHash, outputEncrypted, outputSizeBytes, outputWidth, outputHeight, errorMessage] =
    decodeAbiParameters(IMAGE_RESULT_ABI, raw);
  return {
    hasError,
    completionData,
    outputUri,
    outputContentHash,
    outputEncrypted,
    outputSizeBytes: Number(outputSizeBytes),
    outputWidth: Number(outputWidth),
    outputHeight: Number(outputHeight),
    errorMessage,
  };
}

// ───────────────────────── SPC Receipt Parsing ─────────────────────────

/** Ritual receipt extension: spcCalls array of {input, output} pairs. */
export interface RitualReceipt {
  spcCalls?: Array<{ input: Hex; output: Hex }>;
}

/** Extract the first SPC output from a Ritual transaction receipt (short-running async). */
export function extractSpcResult(receipt: unknown): Hex | null {
  const spcCalls = (receipt as RitualReceipt)?.spcCalls;
  if (!spcCalls || spcCalls.length === 0) return null;
  return spcCalls[0].output;
}

/** Convert a gs:// URI to a browser-fetchable HTTPS URL (GCS public bucket). */
export function gsUriToHttps(uri: string): string {
  if (uri.startsWith("gs://")) {
    return uri.replace("gs://", "https://storage.googleapis.com/");
  }
  return uri;
}

export { PRECOMPILES };

/**
 * Ritual Chain constants — skill-defined, fixed on Ritual Chain (ID 1979).
 * These addresses are documented in ritual-dapp-precompiles/SKILL.md and
 * ritual-dapp-contracts/SKILL.md. They are NOT deployed by us; they are system contracts.
 */

import { defineChain } from "viem";

export const RITUAL_EXPLORER_URL = "https://explorer.ritualfoundation.org";

export const RITUAL_CHAIN = defineChain({
  id: 1979,
  name: "Ritual Chain",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.ritualfoundation.org"],
      webSocket: ["wss://rpc.ritualfoundation.org/ws"],
    },
  },
  blockExplorers: {
    default: { name: "Ritual Explorer", url: RITUAL_EXPLORER_URL },
  },
  testnet: true,
  // Ritual Chain does NOT support standard EIP-1559 (type 2) transactions.
  // It uses custom tx types (0x10, 0x11, 0x12) + legacy (type 0).
  // Setting fees to legacy-only prevents wagmi from advertising EIP-1559 support.
  fees: {
    estimateFeesPerGas: async () => ({
      gasPrice: 1_000_000_000n, // 1 gwei — legacy mode
    }),
  },
});

/** System contracts (skill-defined, fixed — do NOT change). */
export const SYSTEM = {
  RITUAL_WALLET: "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948",
  SCHEDULER: "0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B",
  ASYNC_JOB_TRACKER: "0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5",
  ASYNC_DELIVERY: "0x5A16214fF555848411544b005f7Ac063742f39F6",
  TEE_SERVICE_REGISTRY: "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F",
  SECRETS_ACCESS_CONTROL: "0xf9BF1BC8A3e79B9EBeD0fa2Db70D0513fecE32FD",
  MODEL_PRICING_REGISTRY: "0x7A85F48b971ceBb75491b61abe279728F4c4384f",
} as const;

/** Ritual precompile addresses (skill-defined, fixed — do NOT change). */
export const PRECOMPILES = {
  ONNX: "0x0000000000000000000000000000000000000800",
  HTTP_CALL: "0x0000000000000000000000000000000000000801",
  LLM: "0x0000000000000000000000000000000000000802",
  JQ: "0x0000000000000000000000000000000000000803",
  LONG_RUNNING_HTTP: "0x0000000000000000000000000000000000000805",
  ZK_TWO_PHASE: "0x0000000000000000000000000000000000000806",
  FHE_CALL: "0x0000000000000000000000000000000000000807",
  SOVEREIGN_AGENT: "0x000000000000000000000000000000000000080C",
  IMAGE_CALL: "0x0000000000000000000000000000000000000818",
  AUDIO_CALL: "0x0000000000000000000000000000000000000819",
  VIDEO_CALL: "0x000000000000000000000000000000000000081A",
  DKMS_KEY: "0x000000000000000000000000000000000000081B",
  PERSISTENT_AGENT: "0x0000000000000000000000000000000000000820",
  ED25519: "0x0000000000000000000000000000000000000009",
  SECP256R1: "0x0000000000000000000000000000000000000100",
  TX_HASH: "0x0000000000000000000000000000000000000830",
} as const;

/** TEEServiceRegistry capability enum (from ritual-dapp-contracts/SKILL.md). */
export const CAPABILITY = {
  HTTP_CALL: 0,
  LLM: 1,
  WORMHOLE_QUERY: 2,
  STREAMING: 3,
  VLLM_PROXY: 4,
  ZK_CALL: 5,
  DKMS: 6,
  IMAGE_CALL: 7,
  AUDIO_CALL: 8,
  VIDEO_CALL: 9,
  FHE: 10,
} as const;

/** LLM model — configurable via NEXT_PUBLIC_LLM_MODEL env var. Defaults to the only confirmed-live model on Ritual. */
export const LLM_MODEL = process.env.NEXT_PUBLIC_LLM_MODEL ?? "zai-org/GLM-4.7-FP8";

/** Image generation model — configurable via NEXT_PUBLIC_IMAGE_MODEL env var. */
export const IMAGE_MODEL = process.env.NEXT_PUBLIC_IMAGE_MODEL ?? "black-forest-labs/FLUX.2-klein-4B";

/** Sovereign Agent consumer contract (0x080C precompile caller). Deployed on Ritual Chain. */
export const SOVEREIGN_AGENT_CONSUMER_ADDRESS = (process.env.NEXT_PUBLIC_SOVEREIGN_AGENT_CONSUMER_ADDRESS ?? "") as `0x${string}`;

/** Persistent Agent consumer contract (0x0820 precompile caller). Deployed on Ritual Chain. */
export const PERSISTENT_AGENT_CONSUMER_ADDRESS = (process.env.NEXT_PUBLIC_PERSISTENT_AGENT_CONSUMER_ADDRESS ?? "") as `0x${string}`;

/**
 * The deployed PurrchaChat contract address. Comes from NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS.
 * Empty string = not yet deployed; the UI shows the "contract not deployed" state honestly.
 */
export const PURRCHA_CHAT_ADDRESS = (process.env.NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS ?? "") as `0x${string}`;

/** Ritual block time baseline (conservative, from ritual-dapp-contracts/SKILL.md). */
export const RITUAL_BLOCK_TIME_MS = 350;

/** Max async TTL in blocks (from ritual-dapp-contracts/SKILL.md). */
export const MAX_ASYNC_TTL = 500;

export const WALLET_ADDRESS = (process.env.NEXT_PUBLIC_RITUAL_WALLET_ADDRESS ?? SYSTEM.RITUAL_WALLET) as `0x${string}`;
export const ASYNC_JOB_TRACKER_ADDRESS = (process.env.NEXT_PUBLIC_ASYNC_JOB_TRACKER_ADDRESS ?? SYSTEM.ASYNC_JOB_TRACKER) as `0x${string}`;
export const TEE_SERVICE_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_TEE_SERVICE_REGISTRY_ADDRESS ?? SYSTEM.TEE_SERVICE_REGISTRY) as `0x${string}`;

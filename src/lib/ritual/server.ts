/**
 * Server-side viem client for Ritual Chain. Used by Next.js API Routes only.
 * The public RPC is used directly — no paid provider.
 */

import { createPublicClient, http, type PublicClient } from "viem";
import { RITUAL_CHAIN } from "./constants";

let _client: PublicClient | null = null;

export function getRitualPublicClient(): PublicClient {
  if (_client) return _client;
  _client = createPublicClient({
    chain: RITUAL_CHAIN,
    transport: http("https://rpc.ritualfoundation.org", {
      batch: { wait: 64 },
      retryCount: 2,
    }),
  });
  return _client;
}

/** In-memory event index cache (per wallet). Resets on serverless cold start. */
interface IndexedMessage {
  requestId: `0x${string}`;
  kind: "llm" | "image";
  user: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: bigint;
  timestamp: number;
  hasError: boolean;
  errorMessage: string;
  encryptedPromptCiphertext: `0x${string}`;
  encryptedResponseCiphertext: `0x${string}`;
  // For image results:
  outputUri?: string;
  outputContentHash?: `0x${string}`;
  // Verification metadata:
  precompileId?: number;
  executor?: `0x${string}`;
  settledBlock?: bigint;
  verified?: boolean;
}

const _index = new Map<string, IndexedMessage[]>(); // lowercase wallet -> messages
const _lastIndexedBlock = new Map<string, bigint>(); // lowercase wallet -> last scanned block

export function getCachedMessages(wallet: string): IndexedMessage[] {
  return _index.get(wallet.toLowerCase()) ?? [];
}

export function setCachedMessages(wallet: string, messages: IndexedMessage[], lastBlock: bigint) {
  _index.set(wallet.toLowerCase(), messages);
  _lastIndexedBlock.set(wallet.toLowerCase(), lastBlock);
}

export function getLastIndexedBlock(wallet: string): bigint | undefined {
  return _lastIndexedBlock.get(wallet.toLowerCase());
}

export function appendCachedMessage(wallet: string, msg: IndexedMessage) {
  const key = wallet.toLowerCase();
  const existing = _index.get(key) ?? [];
  // Dedup by requestId.
  if (!existing.some((m) => m.requestId === msg.requestId)) {
    existing.push(msg);
    _index.set(key, existing);
  }
}

export type { IndexedMessage };

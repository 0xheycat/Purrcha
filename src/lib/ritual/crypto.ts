/**
 * ECIES encryption for Purrcha private conversation history.
 *
 * Privacy model (follows ritual-dapp-secrets/SKILL.md ECIES scheme):
 *   1. On session start, the wallet owner signs a domain-specific EIP-191 message.
 *   2. The signature is hashed (keccak256) to derive a secp256k1 private key scalar.
 *   3. The public key encrypts every prompt/response BEFORE the tx is submitted.
 *   4. The ciphertext is stored on-chain in contract events (opaque to the contract & indexer).
 *   5. Only the wallet owner can re-derive the private key (by signing the same message) and
 *      decrypt. No plaintext is ever persisted in events, backend cache, or localStorage.
 *
 * The ECIES_CONFIG.symmetricNonceLength MUST be 12 to match Ritual executor expectations
 * (ritual-dapp-secrets/SKILL.md "ECIES Nonce Length").
 */

import { ECIES_CONFIG, PrivateKey, encrypt, decrypt } from "eciesjs";
import { hexToBytes, bytesToHex, keccak256, type Hex } from "viem";

// MANDATORY: 12-byte nonce for Ritual ECIES compatibility.
ECIES_CONFIG.symmetricNonceLength = 12;

/** The EIP-191 message the wallet signs to derive the Purrcha encryption keypair. */
export const PURRCHA_KEY_DERIVATION_MESSAGE =
  "Sign this message to unlock your Purrcha private conversation history.\n\n" +
  "This signature derives an ECIES keypair stored only in this browser session.\n" +
  "It does NOT authorize any transaction and does NOT cost gas.\n\n" +
  "Domain: purrcha.ritual.chain";

export interface PurrchaKeyPair {
  publicKey: `0x${string}`; // 65-byte uncompressed secp256k1 (0x04 || X || Y)
  privateKey: `0x${string}`; // 32-byte scalar
}

/**
 * Derive a deterministic ECIES keypair from a wallet signature.
 * The signature bytes are keccak256-hashed to produce a 32-byte private key scalar.
 * The same wallet signing the same message always derives the same keypair, so history
 * persists across sessions for the wallet owner. A different wallet produces a different
 * keypair and cannot decrypt another wallet's history.
 */
export function deriveKeyPairFromSignature(signature: `0x${string}`): PurrchaKeyPair {
  const hashed = keccak256(signature);
  const sk = new PrivateKey(hexToBytes(hashed));
  return {
    publicKey: `0x${sk.publicKey.toHex()}` as Hex,
    privateKey: `0x${sk.toHex()}` as Hex,
  };
}

/**
 * Encrypt a UTF-8 string to the derived public key. Returns hex ciphertext.
 * Used before submitting any chat content on-chain.
 */
export function encryptForOwner(publicKey: `0x${string}`, plaintext: string): `0x${string}` {
  const pubBytes = hexToBytes(publicKey);
  const ct = encrypt(pubBytes, Buffer.from(plaintext, "utf-8"));
  // eciesjs encrypt() returns Uint8Array, NOT Buffer — .toString("hex") produces
  // comma-separated decimals. Must convert via Buffer or bytesToHex.
  return `0x${Buffer.from(ct).toString("hex")}` as Hex;
}

/**
 * Decrypt a hex ciphertext with the derived private key. Returns UTF-8 plaintext.
 * Used when loading encrypted history from on-chain events.
 * Throws if the private key does not match (wrong wallet) or the ciphertext is corrupt.
 */
export function decryptWithOwnerKey(privateKey: `0x${string}`, ciphertext: `0x${string}`): string {
  const sk = privateKey.slice(2);
  const ctBytes = hexToBytes(ciphertext);
  const pt = decrypt(sk, Buffer.from(ctBytes));
  // eciesjs decrypt() also returns Uint8Array — convert to string properly.
  return Buffer.from(pt).toString("utf-8");
}

/**
 * Generate an ephemeral keypair (for one-off encryption, e.g. precompile userPublicKey).
 * Not used for the conversation-history flow, but available for private-output precompile calls.
 */
export function generateEphemeralKeyPair(): PurrchaKeyPair {
  const sk = new PrivateKey();
  return {
    publicKey: `0x${sk.publicKey.toHex()}` as Hex,
    privateKey: `0x${sk.toHex()}` as Hex,
  };
}

/** Convert bytes to hex (re-exported for convenience). */
export { bytesToHex };

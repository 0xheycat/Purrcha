"use client";

import * as React from "react";
import { useSignMessage, useAccount } from "wagmi";
import {
  PURRCHA_KEY_DERIVATION_MESSAGE,
  deriveKeyPairFromSignature,
  encryptForOwner,
  decryptWithOwnerKey,
  type PurrchaKeyPair,
} from "@/lib/ritual/crypto";

/**
 * useEncryption — manages the ECIES keypair session for Purrcha private history.
 *
 * NO AUTO-UNLOCK. The user must manually click the "Unlock" button in the StatusBar.
 * This prevents the 6-7 signature prompt spam that new users experienced.
 *
 * Flow:
 *   1. User connects wallet → keyPair = null, isUnlocked = false
 *   2. User clicks "Unlock" in StatusBar → unlock() called
 *   3. Wallet prompts for signature (ONCE)
 *   4. Signature → derive keypair → store in sessionStorage → isUnlocked = true
 *   5. If user rejects → unlockError set, can retry by clicking Unlock again
 *
 * The keypair persists in sessionStorage for the tab session, so refreshing
 * the page does NOT trigger another signature prompt.
 */

const SESSION_KEY_STORAGE = "purrcha.ecies.keypair.v1";

interface StoredKeyPair {
  address: string;
  publicKey: `0x${string}`;
  privateKey: `0x${string}`;
}

function loadStored(): StoredKeyPair | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY_STORAGE);
    if (!raw) return null;
    return JSON.parse(raw) as StoredKeyPair;
  } catch {
    return null;
  }
}

function persistStored(kp: StoredKeyPair | null): void {
  if (typeof window === "undefined") return;
  try {
    if (kp) window.sessionStorage.setItem(SESSION_KEY_STORAGE, JSON.stringify(kp));
    else window.sessionStorage.removeItem(SESSION_KEY_STORAGE);
  } catch {}
}

export interface UseEncryptionResult {
  keyPair: PurrchaKeyPair | null;
  isUnlocked: boolean;
  isUnlocking: boolean;
  unlockError: string | null;
  unlock: () => Promise<void>;
  lock: () => void;
  encrypt: (plaintext: string) => `0x${string}` | null;
  decrypt: (ciphertext: `0x${string}`) => string | null;
}

export function useEncryption(): UseEncryptionResult {
  const { address } = useAccount();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();

  const [keyPair, setKeyPair] = React.useState<PurrchaKeyPair | null>(null);
  const [unlockError, setUnlockError] = React.useState<string | null>(null);

  // Hydrate from sessionStorage when address changes.
  // This is the ONLY effect — no auto-unlock, no automatic signMessage.
  React.useEffect(() => {
    if (!address) {
      setKeyPair(null);
      setUnlockError(null);
      return;
    }
    const stored = loadStored();
    if (stored && stored.address === address.toLowerCase()) {
      // Silent hydrate — no signature needed.
      setKeyPair({ publicKey: stored.publicKey, privateKey: stored.privateKey });
    } else {
      // Different wallet — clear stored keypair.
      persistStored(null);
      setKeyPair(null);
    }
  }, [address]);

  // Manual unlock — called ONLY when user clicks the Unlock button.
  const unlock = React.useCallback(async () => {
    if (!address) {
      setUnlockError("Connect a wallet first.");
      return;
    }
    if (keyPair) return; // already unlocked

    setUnlockError(null);
    try {
      const signature = await signMessageAsync({ message: PURRCHA_KEY_DERIVATION_MESSAGE });
      const derived = deriveKeyPairFromSignature(signature as `0x${string}`);
      persistStored({
        address: address.toLowerCase(),
        publicKey: derived.publicKey,
        privateKey: derived.privateKey,
      });
      setKeyPair(derived);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUnlockError(
        msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("denied")
          ? "Signature rejected — click Unlock to try again."
          : msg
      );
    }
  }, [address, keyPair, signMessageAsync]);

  const lock = React.useCallback(() => {
    persistStored(null);
    setKeyPair(null);
    setUnlockError(null);
  }, []);

  const encrypt = React.useCallback(
    (plaintext: string): `0x${string}` | null => {
      if (!keyPair) return null;
      try { return encryptForOwner(keyPair.publicKey, plaintext); } catch { return null; }
    },
    [keyPair],
  );

  const decrypt = React.useCallback(
    (ciphertext: `0x${string}`): string | null => {
      if (!keyPair) return null;
      if (!ciphertext || ciphertext === "0x" || ciphertext.length < 4) return null;
      try { return decryptWithOwnerKey(keyPair.privateKey, ciphertext); } catch { return null; }
    },
    [keyPair],
  );

  return {
    keyPair,
    isUnlocked: keyPair !== null,
    isUnlocking: isSigning,
    unlockError,
    unlock,
    lock,
    encrypt,
    decrypt,
  };
}

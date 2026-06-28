"use client";

import * as React from "react";
import { Settings, Search } from "lucide-react";
import { usePurrchaWallet } from "@/hooks/ritual/usePurrchaWallet";
import { useEncryption } from "@/hooks/ritual/useEncryption";
import { useChainStatus, truncateHex, useCopyToClipboard } from "@/hooks/ritual/useChainStatus";
import { WalletButton } from "./WalletButton";
import { isContractDeployed, PURRCHA_CHAT_ADDRESS } from "@/lib/ritual/abi";

/**
 * StatusBar — the top command bar of the Purrcha command center.
 *
 * Shows (left → right):
 *   - Purrcha terminal logo "▰ PURRCHA"
 *   - Chain status dot + "RITUAL CHAIN · 1979" (green) or "WRONG NETWORK" (gold) + WalletButton
 *   - Live block number (mono)
 *   - Wallet address (truncated) + copy (when connected)
 *   - RitualWallet balance (mono, gold)
 *   - Privacy lock indicator: "ENCRYPTED" (green) or "UNLOCK TO READ" (gold)
 *   - Settings gear button (opens the SettingsPanel drawer)
 *
 * Responsive: collapses to icons on mobile (sm: breakpoint restores full labels).
 */
interface StatusBarProps {
  onOpenSettings?: () => void;
  onOpenCommandPalette?: () => void;
}

function SettingsToggleButton({ onOpenSettings }: { onOpenSettings?: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenSettings}
      className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-700 text-gray-400 hover:text-ritual-green hover:border-ritual-green/50 hover:bg-ritual-green/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ritual-green/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      aria-label="Open settings"
      title="Settings"
    >
      <Settings className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

function CommandPaletteButton({ onOpenCommandPalette }: { onOpenCommandPalette?: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenCommandPalette}
      className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ritual-green/50"
      aria-label="Open command palette"
      title="Command palette (Cmd+K)"
    >
      <Search className="w-3.5 h-3.5" aria-hidden="true" />
      <span className="font-mono text-[10px] uppercase tracking-wider">search</span>
      <kbd className="font-mono text-[9px] text-gray-600 px-1 py-0.5 rounded border border-gray-700">⌘K</kbd>
    </button>
  );
}

export function StatusBar({ onOpenSettings, onOpenCommandPalette }: StatusBarProps = {}) {
  const wallet = usePurrchaWallet();
  const encryption = useEncryption();
  const chain = useChainStatus(wallet.address);
  const { copied, copy } = useCopyToClipboard();

  const blockNumber = chain.data?.blockNumber ?? "—";
  const ritualBalance = wallet.ritualBalanceFormatted ?? "—";
  const chainOk = wallet.isCorrectChain;
  const chainLabel = wallet.isDisconnected ? "No Wallet" : chainOk ? "Ritual · 1979" : "Wrong Network";
  const chainColor = wallet.isDisconnected ? "gray" : chainOk ? "green" : "gold";
  const chainDotClass =
    chainColor === "green"
      ? "bg-ritual-green animate-pulse"
      : chainColor === "gold"
        ? "bg-ritual-gold animate-pulse"
        : "bg-gray-500";

  return (
    <header
      className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-gray-800"
      role="banner"
    >
      <div className="px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 pr-2 sm:pr-4 border-r border-gray-800 mr-1 sm:mr-2">
          <span className="text-ritual-green text-glow-green font-mono text-base sm:text-lg font-bold tracking-tight">
            ▰
          </span>
          <span className="font-display text-base sm:text-lg tracking-wider text-gray-100">
            PURRCHA
          </span>
          <span className="hidden md:inline text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] ml-2">
            private · multimodal · on-chain
          </span>
        </div>

        {/* Chain status */}
        <div className="flex items-center gap-2" title={chainLabel}>
          <span
            className={`w-2 h-2 rounded-full ${chainDotClass}`}
            aria-hidden="true"
          />
          <span
            className={`hidden sm:inline font-mono text-[11px] uppercase tracking-[0.1em] ${
              chainColor === "green" ? "text-ritual-green" : chainColor === "gold" ? "text-ritual-gold" : "text-gray-400"
            }`}
          >
            {chainLabel}
          </span>
        </div>

        {/* Block number */}
        <div className="hidden sm:flex items-center gap-1.5 px-2 sm:px-3 border-l border-gray-800">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">blk</span>
          <span className="font-mono text-[11px] text-gray-300 tabular-nums" aria-live="polite">
            {typeof blockNumber === "string" && blockNumber !== "—"
              ? BigInt(blockNumber).toLocaleString()
              : "—"}
          </span>
        </div>

        {/* Wallet address + copy (when connected) */}
        {wallet.address && (
          <div className="hidden md:flex items-center gap-1.5 px-3 border-l border-gray-800">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">addr</span>
            <button
              type="button"
              onClick={() => copy(wallet.address!)}
              className="font-mono text-[11px] text-gray-300 hover:text-ritual-green transition-colors"
              title={wallet.address}
              aria-label="Copy wallet address"
            >
              {copied ? "copied!" : truncateHex(wallet.address)}
            </button>
          </div>
        )}

        {/* RitualWallet balance */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 border-l border-gray-800">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">escrow</span>
          <span className="font-mono text-[11px] text-ritual-gold tabular-nums" title="RitualWallet balance">
            {ritualBalance} RITUAL
          </span>
        </div>

        {/* Privacy lock — clickable to trigger ECIES unlock (MANUAL ONLY — no auto-unlock) */}
        <button
          type="button"
          onClick={() => {
            if (!encryption.isUnlocked && !encryption.isUnlocking && !wallet.isDisconnected) {
              void encryption.unlock();
            }
          }}
          disabled={encryption.isUnlocked || encryption.isUnlocking || wallet.isDisconnected}
          className={`hidden sm:flex items-center gap-1.5 px-2 sm:px-3 border-l border-gray-800 transition-all ${
            encryption.isUnlocked
              ? "cursor-default"
              : wallet.isDisconnected
                ? "cursor-default opacity-50"
                : "hover:bg-ritual-gold/10 glow-gold"
          } ${encryption.isUnlocking ? "opacity-60" : ""}`}
          title={
            encryption.isUnlocked
              ? "ECIES keypair active — history is decrypted locally."
              : encryption.isUnlocking
                ? "Awaiting wallet signature…"
                : wallet.isDisconnected
                  ? "Connect wallet first, then click to unlock."
                  : "Click to sign EIP-191 message and unlock your encrypted history. This does NOT cost gas."
          }
          aria-label={encryption.isUnlocked ? "Encryption unlocked" : "Unlock encrypted history"}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${encryption.isUnlocked ? "bg-ritual-green" : wallet.isDisconnected ? "bg-gray-600" : "bg-ritual-gold animate-pulse"}`}
            aria-hidden="true"
          />
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.1em] ${encryption.isUnlocked ? "text-ritual-green" : wallet.isDisconnected ? "text-gray-600" : "text-ritual-gold font-semibold"}`}
          >
            {encryption.isUnlocking ? "Signing…" : encryption.isUnlocked ? "Encrypted" : wallet.isDisconnected ? "Locked" : "▶ Unlock"}
          </span>
        </button>
        {encryption.unlockError && (
          <span className="hidden sm:inline font-mono text-[9px] text-ritual-red/70 truncate max-w-[120px]" title={encryption.unlockError}>
            ⚠ {encryption.unlockError}
          </span>
        )}

        {/* Contract deployment status */}
        {!isContractDeployed && (
          <div className="hidden xl:flex items-center gap-1.5 px-3 border-l border-gray-800">
            <span className="w-1.5 h-1.5 rounded-full bg-ritual-red" aria-hidden="true" />
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ritual-red">
              Contract not deployed
            </span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Command palette button */}
        <CommandPaletteButton onOpenCommandPalette={onOpenCommandPalette} />

        {/* Settings button */}
        <SettingsToggleButton onOpenSettings={onOpenSettings} />

        {/* Wallet button */}
        <WalletButton />
      </div>

      {/* Mobile-only secondary row: block + privacy collapsed */}
      <div className="sm:hidden border-t border-gray-800 px-3 h-8 flex items-center justify-between text-[10px] font-mono">
        <div className="flex items-center gap-2 text-gray-500">
          <span className="uppercase">blk</span>
          <span className="text-gray-300 tabular-nums">
            {typeof blockNumber === "string" && blockNumber !== "—"
              ? BigInt(blockNumber).toLocaleString()
              : "—"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!encryption.isUnlocked && !encryption.isUnlocking && !wallet.isDisconnected) {
              void encryption.unlock();
            }
          }}
          disabled={encryption.isUnlocked || encryption.isUnlocking || wallet.isDisconnected}
          className={`flex items-center gap-1.5 ${encryption.isUnlocked ? "text-ritual-green" : "text-ritual-gold"} ${encryption.isUnlocking ? "opacity-60" : ""}`}
          aria-label={encryption.isUnlocked ? "Encryption unlocked" : "Unlock encrypted history"}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${encryption.isUnlocked ? "bg-ritual-green" : "bg-ritual-gold animate-pulse"}`}
            aria-hidden="true"
          />
          <span className="uppercase tracking-wider">
            {encryption.isUnlocking ? "Signing…" : encryption.isUnlocked ? "Encrypted" : "Unlock to read"}
          </span>
        </button>
      </div>

      {/* Render the contract address as a hidden aria attribute for screen readers */}
      <span className="sr-only" aria-hidden="true">
        {PURRCHA_CHAT_ADDRESS ? `Contract ${PURRCHA_CHAT_ADDRESS}` : "Contract not deployed"}
      </span>
    </header>
  );
}

"use client";

import * as React from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { RITUAL_CHAIN } from "@/lib/ritual/constants";
import { truncateHex, useCopyToClipboard } from "@/hooks/ritual/useChainStatus";

/**
 * WalletButton — Ritual-styled wallet connector.
 *
 * - Disconnected: green-bordered "CONNECT WALLET" button (opens connector picker).
 * - Wrong chain: gold "SWITCH TO RITUAL" button (uses wagmi useSwitchChain — works with
 *   any connector, handles wallet_addEthereumChain automatically when chain isn't added).
 * - Connected + correct chain: truncated address + dropdown with copy/disconnect.
 *
 * Touch targets are ≥44px on mobile (per the design system).
 */
export function WalletButton() {
  const { address, isConnected, connector } = useAccount();
  const activeChainId = useChainId();
  const { connectors, connectAsync, isPending: isConnecting, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { copied, copy } = useCopyToClipboard();

  const isWrongChain = isConnected && activeChainId !== RITUAL_CHAIN.id;

  const switchChain = React.useCallback(async () => {
    try {
      await switchChainAsync({ chainId: RITUAL_CHAIN.id });
    } catch {
      // wagmi's switchChain handles wallet_addEthereumChain automatically (error 4902).
      // If the user rejects, the WalletButton stays visible for manual retry.
    }
  }, [switchChainAsync]);

  // Disconnected state: connect CTA.
  if (!isConnected) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          disabled={isConnecting}
          className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 h-11 rounded-md border border-ritual-green/60 text-ritual-green hover:bg-ritual-green/10 transition-colors glow-green disabled:opacity-50"
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
        >
          {isConnecting ? "Connecting…" : "▰ Connect Wallet"}
        </button>
        {pickerOpen && (
          <div
            className="absolute right-0 mt-2 w-56 terminal-card p-1 z-50 fade-in"
            role="listbox"
          >
            {connectors.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-gray-500 font-mono">
                No injected wallet detected. Install MetaMask or Rabby.
              </div>
            )}
            {connectors.map((c) => (
              <button
                key={c.uid}
                onClick={async () => {
                  setPickerOpen(false);
                  try {
                    await connectAsync({ connector: c });
                  } catch {
                    /* user rejected */
                  }
                }}
                className="w-full text-left px-3 py-2 text-[12px] font-mono text-gray-300 hover:bg-ritual-green/10 hover:text-ritual-green rounded transition-colors"
                role="option"
                aria-selected={c.uid === connector?.id}
              >
                <span className="text-ritual-green mr-2">▸</span>
                {c.name}
              </button>
            ))}
            {error && (
              <div className="px-3 py-2 text-[11px] text-ritual-red font-mono">
                {error.message}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Wrong-chain state: switch CTA.
  if (isWrongChain) {
    return (
      <button
        type="button"
        onClick={switchChain}
        disabled={isSwitching}
        className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 h-11 rounded-md border border-ritual-gold/60 text-ritual-gold hover:bg-ritual-gold/10 transition-colors glow-gold disabled:opacity-60 flex items-center gap-2"
      >
        {isSwitching ? (
          <>
            <span className="w-3 h-3 border-2 border-ritual-gold/40 border-t-ritual-gold rounded-full animate-spin" />
            Switching…
          </>
        ) : (
          "⚠ Switch to Ritual"
        )}
      </button>
    );
  }

  // Connected + correct chain: address + dropdown.
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="font-mono text-[11px] uppercase tracking-[0.08em] px-3 h-11 rounded-md border border-gray-700 hover:border-ritual-green/60 hover:text-ritual-green text-gray-300 transition-colors flex items-center gap-2"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <span className="w-2 h-2 rounded-full bg-ritual-green animate-pulse" aria-hidden="true" />
        <span className="hidden sm:inline">{address ? truncateHex(address) : "0x…"}</span>
        <span className="sm:hidden">●●●</span>
      </button>
      {menuOpen && (
        <div
          className="absolute right-0 mt-2 w-64 terminal-card p-1 z-50 fade-in"
          role="menu"
        >
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-mono">
              Connected · {connector?.name ?? "Injected"}
            </div>
            <div className="font-mono text-[11px] text-gray-300 break-all">{address}</div>
          </div>
          <button
            onClick={() => {
              if (address) copy(address);
            }}
            className="w-full text-left px-3 py-2 text-[12px] font-mono text-gray-300 hover:bg-ritual-green/10 hover:text-ritual-green rounded transition-colors"
            role="menuitem"
          >
            <span className="text-ritual-green mr-2">⧉</span>
            {copied ? "Copied!" : "Copy address"}
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              disconnect();
            }}
            className="w-full text-left px-3 py-2 text-[12px] font-mono text-ritual-red hover:bg-ritual-red/10 rounded transition-colors"
            role="menuitem"
          >
            <span className="mr-2">✕</span>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

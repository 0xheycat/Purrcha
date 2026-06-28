"use client";

import * as React from "react";
import {
  useAccount,
  useChainId,
  useBalance,
  useSendTransaction,
  usePublicClient,
} from "wagmi";
import { encodeFunctionData, parseEther, type Address, type Hex } from "viem";
import { RITUAL_CHAIN } from "@/lib/ritual/constants";
import { WALLET_ADDRESS, RITUAL_WALLET_ABI } from "@/lib/ritual/abi";

/**
 * usePurrchaWallet — the wallet state primitive for the entire Purrcha dApp.
 *
 * Combines:
 *   - wagmi `useAccount` (address, connector, isConnected)
 *   - wagmi `useChainId` compared against Ritual Chain ID 1979 (wrong-network detection)
 *   - native balance (RITUAL ETH) via wagmi `useBalance`
 *   - RitualWallet `balanceOf` (escrow balance for async fees) + `lockUntil` (deposit lock)
 *   - `deposit(amountEth, lockBlocks)` — calls RitualWallet.deposit directly via
 *     `useSendTransaction` + `encodeFunctionData`. The EOA must deposit directly (NOT via the
 *     PurrchaChat consumer) because RitualWallet bills async fees from tx.origin.
 *
 * Exposes boolean derived state for the StatusBar:
 *   - isCorrectChain: connected and on chain 1979
 *   - isWrongChain: connected but on a different chain
 *   - isDisconnected: no wallet
 */
export interface PurrchaWalletState {
  address?: Address;
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  connectorName?: string;
  chainId?: number;
  isCorrectChain: boolean;
  isWrongChain: boolean;
  isDisconnected: boolean;
  nativeBalance?: bigint;
  nativeBalanceFormatted?: string;
  ritualBalance?: bigint;
  ritualBalanceFormatted?: string;
  ritualLockUntilBlock?: bigint;
  ritualIsLocked?: boolean;
  deposit: (amountEth: string, lockBlocks: bigint) => Promise<Hex>;
  depositPending: boolean;
  depositError?: Error | null;
}

export function usePurrchaWallet(): PurrchaWalletState {
  const account = useAccount();
  const activeChainId = useChainId();
  const publicClient = usePublicClient();
  const {
    sendTransactionAsync,
    isPending: depositPending,
    error: depositError,
  } = useSendTransaction();

  const address = account.address;
  const isConnected = account.isConnected;
  const isCorrectChain = isConnected && activeChainId === RITUAL_CHAIN.id;
  const isWrongChain = isConnected && activeChainId !== RITUAL_CHAIN.id;
  const isDisconnected = !isConnected;

  // Native RITUAL ETH balance.
  const nativeBalanceQuery = useBalance({
    address,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });

  // RitualWallet escrow balance + lock state. We read these via the wagmi public client
  // (useReadContract would work too; we keep it lightweight here and poll on a timer).
  const [ritualState, setRitualState] = React.useState<{
    balance?: bigint;
    lockUntil?: bigint;
  }>({});

  React.useEffect(() => {
    if (!address || !isCorrectChain || !publicClient) {
      setRitualState({});
      return;
    }
    let cancelled = false;
    const read = async () => {
      try {
        const [balance, lockUntil] = await Promise.all([
          publicClient.readContract({
            address: WALLET_ADDRESS as Address,
            abi: RITUAL_WALLET_ABI,
            functionName: "balanceOf",
            args: [address],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: WALLET_ADDRESS as Address,
            abi: RITUAL_WALLET_ABI,
            functionName: "lockUntil",
            args: [address],
          }) as Promise<bigint>,
        ]);
        if (!cancelled) {
          setRitualState({ balance, lockUntil });
        }
      } catch {
        // silent — the UI shows "—" when unavailable
      }
    };
    read();
    const interval = setInterval(read, 12_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address, isCorrectChain, publicClient]);

  const deposit = React.useCallback(
    async (amountEth: string, lockBlocks: bigint): Promise<Hex> => {
      if (!sendTransactionAsync) throw new Error("Wallet not connected");
      if (!isCorrectChain) throw new Error("Wrong chain — switch to Ritual Chain (1979)");
      const value = parseEther(amountEth);
      const data = encodeFunctionData({
        abi: RITUAL_WALLET_ABI,
        functionName: "deposit",
        args: [lockBlocks],
      });
      const hash = await sendTransactionAsync({
        to: WALLET_ADDRESS as Address,
        data,
        value,
      });
      return hash as Hex;
    },
    [sendTransactionAsync, isCorrectChain],
  );

  return {
    address,
    isConnected,
    isConnecting: account.isConnecting,
    isReconnecting: account.isReconnecting,
    connectorName: account.connector?.name,
    chainId: activeChainId,
    isCorrectChain,
    isWrongChain,
    isDisconnected,
    nativeBalance: nativeBalanceQuery.data?.value,
    nativeBalanceFormatted: nativeBalanceQuery.data?.formatted,
    ritualBalance: ritualState.balance,
    ritualBalanceFormatted: ritualState.balance
      ? formatRitual(ritualState.balance)
      : undefined,
    ritualLockUntilBlock: ritualState.lockUntil,
    ritualIsLocked: ritualState.balance ? ritualState.balance > 0n : false,
    deposit,
    depositPending,
    depositError: depositError ?? undefined,
  };
}

function formatRitual(wei: bigint): string {
  // 18 decimals, show 4 fractional digits max
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n) / 10n ** 14n; // 4 decimals
  return `${whole}.${frac.toString().padStart(4, "0")}`;
}

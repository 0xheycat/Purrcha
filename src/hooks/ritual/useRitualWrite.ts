"use client";

import * as React from "react";
import { useSendTransaction, useChainId, useConnectorClient } from "wagmi";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { RITUAL_CHAIN } from "@/lib/ritual/constants";

/**
 * useRitualWrite — bypasses wagmi's broken eth_call simulation AND forces
 * legacy (type 0) transactions on Ritual Chain.
 *
 * CRITICAL ROOT CAUSE: viem's prepareTransactionRequest checks if blocks have
 * baseFeePerGas and if so, OVERRIDES the request type to 'eip1559' — even if
 * we pass type:'legacy'. Ritual Chain has baseFeePerGas (7 wei) but does NOT
 * support EIP-1559 (type 2). Rabby/MetaMask then send type 2 → Ritual rejects.
 *
 * FIX: Bypass viem's prepareTransactionRequest entirely by calling
 * eth_sendTransaction directly via the wallet provider. We construct a
 * minimal legacy transaction request with only gasPrice (no maxFeePerGas).
 *
 * Pattern from ritual-dapp-frontend/SKILL.md:
 *   const data = encodeFunctionData({ abi, functionName, args });
 *   const hash = await sendTransactionAsync({ to, data, gas });
 */
export interface RitualWriteArgs {
  address: Address;
  abi?: readonly unknown[];
  functionName?: string;
  args?: readonly unknown[];
  data?: Hex;
  value?: bigint;
  gas?: bigint;
}

export interface RitualWriteResult {
  write: (args: RitualWriteArgs) => Promise<Hex>;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

const RITUAL_GAS_PRICE = "0x3b9aca00"; // 1 gwei in hex

export function useRitualWrite(): RitualWriteResult {
  const { sendTransactionAsync, isPending, isError, error, reset } = useSendTransaction();
  const activeChainId = useChainId();
  const { data: connectorClient } = useConnectorClient();

  const write = React.useCallback(
    async (args: RitualWriteArgs): Promise<Hex> => {
      if (activeChainId !== RITUAL_CHAIN.id) {
        throw new Error(
          `Wrong network (chain ${activeChainId}). Switch to Ritual Chain (1979) first.`
        );
      }

      let data: Hex;
      if (args.data) {
        data = args.data;
      } else if (args.abi && args.functionName) {
        data = encodeFunctionData({
          abi: args.abi,
          functionName: args.functionName,
          args: args.args ?? [],
        } as never);
      } else {
        throw new Error("useRitualWrite: either `data` or `abi+functionName+args` is required.");
      }

      // First try: use direct eth_sendTransaction via the wallet provider.
      // This bypasses viem's prepareTransactionRequest which auto-detects EIP-1559
      // from baseFeePerGas and overrides our type:'legacy' to type:'eip1559'.
      const gasHex = ("0x" + (args.gas ?? 2_000_000n).toString(16)) as Hex;
      const valueHex = args.value ? ("0x" + args.value.toString(16)) as Hex : undefined;

      // Build a legacy transaction request — gasPrice only, NO maxFeePerGas.
      const txParams: Record<string, string> = {
        from: "", // will be filled below
        to: args.address,
        data,
        gas: gasHex,
        gasPrice: RITUAL_GAS_PRICE,
      };
      if (valueHex) txParams.value = valueHex;

      const provider = typeof window !== "undefined" ? window.ethereum : undefined;

      // Get the connected account address
      if (connectorClient?.account?.address) {
        txParams.from = connectorClient.account.address;
      } else if (provider) {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        if (accounts.length > 0) txParams.from = accounts[0];
      }

      if (!txParams.from) {
        throw new Error("Wallet not connected — connect a wallet first.");
      }

      try {
        if (!provider) {
          throw new Error("Wallet provider is unavailable.");
        }
        // Direct eth_sendTransaction — bypasses viem's tx type detection entirely.
        const hash = await provider.request({
          method: "eth_sendTransaction",
          params: [txParams],
        });
        return hash as Hex;
      } catch (directError) {
        // If direct call fails, fall back to wagmi's sendTransactionAsync
        // (which may still send EIP-1559, but it's the best fallback).
        const errMsg = directError instanceof Error ? directError.message : String(directError);
        if (errMsg.toLowerCase().includes("reject") || errMsg.toLowerCase().includes("denied")) {
          throw directError; // User rejected — don't retry.
        }
        // Fall back to wagmi sendTransactionAsync
        const hash = await sendTransactionAsync({
          to: args.address,
          data,
          value: args.value ?? undefined,
          gas: args.gas ?? 2_000_000n,
        } as never);
        return hash as Hex;
      }
    },
    [sendTransactionAsync, activeChainId, connectorClient],
  );

  return {
    write,
    isPending,
    isError,
    error: error ?? null,
    reset,
  };
}

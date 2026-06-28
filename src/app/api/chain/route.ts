/**
 * GET /api/chain
 * Returns live Ritual Chain status: chain ID, current block, gas price, and the deployer's
 * RitualWallet balance + lock state. Used by the frontend status bar.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRitualPublicClient } from "@/lib/ritual/server";
import { WALLET_ADDRESS } from "@/lib/ritual/abi";
import { RITUAL_WALLET_ABI } from "@/lib/ritual/abi";
import { formatEther, type Hex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  try {
    const client = getRitualPublicClient();
    const [chainId, blockNumber, block] = await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
      client.getBlock({ blockTag: "latest" }),
    ]);

    let wallet: Record<string, unknown> | null = null;
    if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) {
      try {
        const [balance, lockUntil] = await Promise.all([
          client.readContract({
            address: WALLET_ADDRESS,
            abi: RITUAL_WALLET_ABI,
            functionName: "balanceOf",
            args: [address as Hex],
          }) as Promise<bigint>,
          client.readContract({
            address: WALLET_ADDRESS,
            abi: RITUAL_WALLET_ABI,
            functionName: "lockUntil",
            args: [address as Hex],
          }) as Promise<bigint>,
        ]);
        wallet = {
          address,
          balance: formatEther(balance),
          balanceWei: balance.toString(),
          lockUntilBlock: lockUntil.toString(),
          isLocked: blockNumber < lockUntil,
          blocksRemaining: blockNumber < lockUntil ? Number(lockUntil - blockNumber) : 0,
        };
      } catch (e) {
        wallet = { address, error: e instanceof Error ? e.message : String(e) };
      }
    }

    return NextResponse.json({
      chainId,
      chainName: "Ritual Chain",
      blockNumber: blockNumber.toString(),
      blockTimestamp: Number(block.timestamp),
      blockHash: block.hash,
      gasPrice: "0", // Ritual uses RitualWallet fees, not standard gas
      ritualWallet: {
        address: WALLET_ADDRESS,
        ...(wallet ?? {}),
      },
      contractDeployed: Boolean(process.env.NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS),
      contractAddress: process.env.NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS ?? null,
    });
  } catch (e) {
    return NextResponse.json({
      error: "Chain query failed",
      message: e instanceof Error ? e.message : String(e),
    }, { status: 502 });
  }
}

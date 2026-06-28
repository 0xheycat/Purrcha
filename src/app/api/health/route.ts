/**
 * GET /api/health
 * Health check + Ritual Chain connectivity probe. Serverless-safe, no background state.
 */
import { NextResponse } from "next/server";
import { getRitualPublicClient } from "@/lib/ritual/server";
import { RITUAL_CHAIN, SYSTEM } from "@/lib/ritual/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let chainId: number | null = null;
  let blockNumber: bigint | null = null;
  let rpcOk = false;
  let rpcError: string | null = null;

  try {
    const client = getRitualPublicClient();
    chainId = await client.getChainId();
    blockNumber = await client.getBlockNumber();
    rpcOk = true;
  } catch (e) {
    rpcError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    status: rpcOk ? "ok" : "degraded",
    service: "purrcha-backend",
    chain: {
      id: chainId,
      expectedId: RITUAL_CHAIN.id,
      name: RITUAL_CHAIN.name,
      blockNumber: blockNumber?.toString() ?? null,
      rpc: "https://rpc.ritualfoundation.org",
      rpcOk,
      rpcError,
    },
    systemContracts: SYSTEM,
    contractDeployed: Boolean(process.env.NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS),
    contractAddress: process.env.NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS ?? null,
    latencyMs: Date.now() - started,
    timestamp: new Date().toISOString(),
  });
}

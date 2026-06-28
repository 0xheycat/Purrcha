/**
 * GET /api/executor?capability=1
 *
 * Discovers a TEE executor for a given capability from TEEServiceRegistry.
 * capability: 1=LLM, 7=IMAGE_CALL (see ritual-dapp-precompiles/SKILL.md).
 *
 * Returns the executor's teeAddress (for the precompile input) and publicKey (for ECIES
 * secret encryption, if needed). The frontend uses this before submitting any precompile call.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRitualPublicClient } from "@/lib/ritual/server";
import { TEE_SERVICE_REGISTRY_ADDRESS } from "@/lib/ritual/abi";
import { TEE_REGISTRY_ABI } from "@/lib/ritual/abi";
import { CAPABILITY } from "@/lib/ritual/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAPABILITY_NAMES: Record<number, string> = {
  0: "HTTP_CALL",
  1: "LLM",
  2: "WORMHOLE_QUERY",
  3: "STREAMING",
  4: "VLLM_PROXY",
  5: "ZK_CALL",
  6: "DKMS",
  7: "IMAGE_CALL",
  8: "AUDIO_CALL",
  9: "VIDEO_CALL",
  10: "FHE",
};

export async function GET(req: NextRequest) {
  const capParam = req.nextUrl.searchParams.get("capability");
  const capability = capParam ? parseInt(capParam, 10) : CAPABILITY.LLM;

  if (capability < 0 || capability > 10) {
    return NextResponse.json({ error: "capability must be 0-10" }, { status: 400 });
  }

  try {
    const client = getRitualPublicClient();

    // First try the indexed API (faster, finalized state).
    let executor: { teeAddress: `0x${string}`; publicKey: `0x${string}`; endpoint: string; isValid: boolean } | null = null;

    try {
      const count = await client.readContract({
        address: TEE_SERVICE_REGISTRY_ADDRESS,
        abi: TEE_REGISTRY_ABI,
        functionName: "getIndexedServiceCountByCapability",
        args: [capability],
      }) as bigint;

      if (count > 0n) {
        const teeAddress = await client.readContract({
          address: TEE_SERVICE_REGISTRY_ADDRESS,
          abi: TEE_REGISTRY_ABI,
          functionName: "getIndexedServiceByCapabilityAt",
          args: [capability, 0n],
        }) as `0x${string}`;

        // Fetch the node details via getService.
        const service = await client.readContract({
          address: TEE_SERVICE_REGISTRY_ADDRESS,
          abi: TEE_REGISTRY_ABI,
          functionName: "getServicesByCapability",
          args: [capability, true],
        }) as unknown as Array<{ node: { teeAddress: `0x${string}`; publicKey: `0x${string}`; endpoint: string }; isValid: boolean }>;

        const match = service.find((s) => s.node.teeAddress.toLowerCase() === teeAddress.toLowerCase());
        if (match) {
          executor = {
            teeAddress: match.node.teeAddress,
            publicKey: match.node.publicKey,
            endpoint: match.node.endpoint,
            isValid: match.isValid,
          };
        }
      }
    } catch {
      // Fall through to the full getServicesByCapability call.
    }

    // Fallback: full getServicesByCapability.
    if (!executor) {
      const services = await client.readContract({
        address: TEE_SERVICE_REGISTRY_ADDRESS,
        abi: TEE_REGISTRY_ABI,
        functionName: "getServicesByCapability",
        args: [capability, true],
      }) as unknown as Array<{ node: { teeAddress: `0x${string}`; publicKey: `0x${string}`; endpoint: string }; isValid: boolean }>;

      const first = services.find((s) => s.isValid) ?? services[0];
      if (first) {
        executor = {
          teeAddress: first.node.teeAddress,
          publicKey: first.node.publicKey,
          endpoint: first.node.endpoint,
          isValid: first.isValid,
        };
      }
    }

    if (!executor) {
      return NextResponse.json({
        capability,
        capabilityName: CAPABILITY_NAMES[capability],
        found: false,
        message: `No TEE executor registered for capability ${capability} (${CAPABILITY_NAMES[capability]}). The Ritual Chain executor set may be temporarily unavailable.`,
      }, { status: 404 });
    }

    return NextResponse.json({
      capability,
      capabilityName: CAPABILITY_NAMES[capability],
      found: true,
      executor,
      registry: TEE_SERVICE_REGISTRY_ADDRESS,
    });
  } catch (e) {
    return NextResponse.json({
      error: "Executor discovery failed",
      message: e instanceof Error ? e.message : String(e),
      capability,
    }, { status: 502 });
  }
}

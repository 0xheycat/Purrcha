/**
 * GET /api/verify?txHash=0x...
 *
 * Fetches verification details for a settled Ritual transaction: the full receipt (including
 * the Ritual-specific spcCalls field), the contract events emitted, the precompile used, and
 * any TEE attestation/proof data available. The blockchain is the source of truth.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRitualPublicClient } from "@/lib/ritual/server";
import { PURRCHA_CHAT_ADDRESS } from "@/lib/ritual/abi";
import { PRECOMPILES } from "@/lib/ritual/constants";
import { decodeLLMOutput, decodeImageResult, extractLLMText } from "@/lib/ritual/precompiles";
import type { Hex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRECOMPILE_NAMES: Record<string, string> = {
  [PRECOMPILES.LLM]: "LLM Call (0x0802)",
  [PRECOMPILES.IMAGE_CALL]: "Image Call (0x0818)",
  [PRECOMPILES.HTTP_CALL]: "HTTP Call (0x0801)",
  [PRECOMPILES.ONNX]: "ONNX Inference (0x0800)",
  [PRECOMPILES.JQ]: "JQ (0x0803)",
};

export async function GET(req: NextRequest) {
  const txHash = req.nextUrl.searchParams.get("txHash");
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Valid 'txHash' query parameter required" }, { status: 400 });
  }

  try {
    const client = getRitualPublicClient();
    const [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: txHash as Hex }),
      client.getTransaction({ hash: txHash as Hex }),
    ]);

    // Extract the Ritual-specific spcCalls field (not in standard EVM receipts).
    const spcCalls = (receipt as unknown as { spcCalls?: Array<{ input: Hex; output: Hex }> }).spcCalls ?? [];

    // Find the contract event log (if the tx interacted with PurrchaChat).
    let contractEvent: { name: string; args: Record<string, unknown> } | null = null;
    if (PURRCHA_CHAT_ADDRESS) {
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === PURRCHA_CHAT_ADDRESS.toLowerCase()) {
          contractEvent = {
            name: "PurrchaChat event",
            args: { topics: log.topics, data: log.data, logIndex: log.logIndex },
          };
          break;
        }
      }
    }

    // Decode the first SPC output if present (LLM or Image).
    let spcDecoded: { precompile: string; kind: string; hasError?: boolean; errorMessage?: string; text?: string; outputUri?: string } | null = null;
    if (spcCalls.length > 0) {
      const output = spcCalls[0].output;
      // Try LLM decode first.
      try {
        const llm = decodeLLMOutput(output);
        spcDecoded = {
          precompile: PRECOMPILES.LLM,
          kind: "LLM",
          hasError: llm.hasError,
          errorMessage: llm.errorMessage || undefined,
          text: llm.hasError ? undefined : extractLLMText(llm.completionData),
        };
      } catch {
        // Try Image decode.
        try {
          const img = decodeImageResult(output);
          spcDecoded = {
            precompile: PRECOMPILES.IMAGE_CALL,
            kind: "Image",
            hasError: img.hasError,
            errorMessage: img.errorMessage || undefined,
            outputUri: img.outputUri,
          };
        } catch {
          // Leave as raw.
        }
      }
    }

    // Determine the precompile address from the tx's first log or the spcCalls.
    const precompileAddress = spcDecoded?.precompile ?? null;

    // TEE attestation: Ritual does not expose a separate attestation blob in the receipt today.
    // The TEE trust comes from the executor being registered in TEEServiceRegistry and the
    // settlement being chain-verified. We surface this honestly.
    const teeAttestation = {
      available: false,
      reason: "Ritual Chain TEE attestation is implicit: the executor is registered in TEEServiceRegistry (0x9644...) and the settlement is verified by the chain's commitment validator. No separate attestation blob is exposed in the transaction receipt.",
      executorRegistry: "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F",
      asyncDelivery: "0x5A16214fF555848411544b005f7Ac063742f39F6",
    };

    return NextResponse.json({
      txHash,
      status: receipt.status,
      statusLabel: receipt.status === "success" ? "settled" : "failed",
      blockNumber: receipt.blockNumber.toString(),
      blockHash: receipt.blockHash,
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      from: tx?.from,
      to: tx?.to,
      contractAddress: PURRCHA_CHAT_ADDRESS,
      interactedWithContract: tx?.to?.toLowerCase() === PURRCHA_CHAT_ADDRESS?.toLowerCase(),
      precompileUsed: precompileAddress ? PRECOMPILE_NAMES[precompileAddress] ?? precompileAddress : null,
      precompileAddress,
      spcCalls: spcCalls.map((c) => ({ input: c.input, output: c.output })),
      spcDecoded,
      contractEvent,
      logs: receipt.logs.map((l) => ({
        address: l.address,
        topics: l.topics,
        data: l.data,
        logIndex: l.logIndex,
      })),
      teeAttestation,
      verificationStatus: receipt.status === "success" ? "verified" : "failed",
      humanReadable:
        receipt.status === "success"
          ? `Transaction ${txHash.slice(0, 10)}... settled on Ritual Chain at block ${receipt.blockNumber}. ` +
            (spcDecoded
              ? `Precompile: ${spcDecoded.kind}. ` +
                (spcDecoded.hasError ? `Executor returned an error: ${spcDecoded.errorMessage}` : "Executor returned a result successfully.")
              : "No SPC output decoded.")
          : `Transaction ${txHash.slice(0, 10)}... reverted on Ritual Chain.`,
    });
  } catch (e) {
    return NextResponse.json({
      error: "Verification failed",
      message: e instanceof Error ? e.message : String(e),
      txHash,
    }, { status: 502 });
  }
}

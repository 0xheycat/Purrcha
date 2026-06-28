/**
 * GET /api/history?address=0x...&limit=100
 *
 * Indexes real on-chain PurrchaChat events for the given wallet and returns the encrypted
 * conversation history. The blockchain/event log is the source of truth — this route only
 * caches decoded events in-memory for the serverless instance lifetime.
 *
 * Returns encrypted ciphertext only; the frontend decrypts with the wallet-derived ECIES key.
 * Never returns plaintext. Never invents data.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRitualPublicClient, getCachedMessages, setCachedMessages, getLastIndexedBlock, type IndexedMessage } from "@/lib/ritual/server";
import { EVENT_TOPICS, decodeIndexedUserAndRequestId } from "@/lib/ritual/events";
import { PURRCHA_CHAT_ABI, PURRCHA_CHAT_ADDRESS } from "@/lib/ritual/abi";
import { decodeAbiParameters, type Hex, type Log } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SCAN_BLOCKS = 50_000n; // ~4.9 hours at 350ms/block
const DEFAULT_LIMIT = 100;

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || DEFAULT_LIMIT, 500) : DEFAULT_LIMIT;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Valid 'address' query parameter required" }, { status: 400 });
  }
  if (!PURRCHA_CHAT_ADDRESS) {
    return NextResponse.json({
      error: "Contract not deployed",
      message: "NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS is not set. Deploy the contract first, then set the env var.",
      messages: [],
    }, { status: 503 });
  }

  try {
    const client = getRitualPublicClient();
    const addrLc = address.toLowerCase();

    // Determine the block range to scan. Start from the last indexed block, or MAX_SCAN_BLOCKS back.
    const currentBlock = await client.getBlockNumber();
    const lastIndexed = getLastIndexedBlock(addrLc);
    const fromBlock = lastIndexed ? lastIndexed + 1n : (currentBlock > MAX_SCAN_BLOCKS ? currentBlock - MAX_SCAN_BLOCKS : 0n);

    // Pad the address to a 32-byte topic for indexed filtering (topic[1] = indexed user).
    const paddedAddress = ("0x000000000000000000000000" + address.slice(2)) as Hex;
    const fromBlockHex = ("0x" + fromBlock.toString(16)) as Hex;

    // Each event has exactly 2 indexed fields (user, requestId/jobId), so topics = [sig, user, null].
    // eth_getLogs rejects huge ranges on Ritual — use the computed fromBlock, fall back to a
    // narrower window if the RPC errors.
    const fetchLogs = async (sigTopic: `0x${string}`) => {
      try {
        return await client.request({
          method: "eth_getLogs",
          params: [{ address: PURRCHA_CHAT_ADDRESS, topics: [sigTopic, paddedAddress, null], fromBlock: fromBlockHex, toBlock: "latest" }],
        }) as Log[];
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // If the range is too wide, retry with a narrower recent window.
        const narrowFrom = currentBlock > 10_000n ? currentBlock - 10_000n : 0n;
        const narrowHex = ("0x" + narrowFrom.toString(16)) as Hex;
        try {
          return await client.request({
            method: "eth_getLogs",
            params: [{ address: PURRCHA_CHAT_ADDRESS, topics: [sigTopic, paddedAddress, null], fromBlock: narrowHex, toBlock: "latest" }],
          }) as Log[];
        } catch (e2) {
          throw new Error(`eth_getLogs failed (initial: ${msg}; retry: ${e2 instanceof Error ? e2.message : String(e2)})`);
        }
      }
    };

    const [chatLogs, imageLogs, verifyLogs] = await Promise.all([
      fetchLogs(EVENT_TOPICS.ChatResultSettled),
      fetchLogs(EVENT_TOPICS.ImageResultDelivered),
      fetchLogs(EVENT_TOPICS.VerificationMetadata),
    ]).catch((e) => {
      throw new Error(`eth_getLogs failed: ${e instanceof Error ? e.message : String(e)}`);
    });

    // Build a verification lookup map: requestId -> metadata.
    const verifyMap = new Map<string, { precompileId: number; executor: `0x${string}`; settledBlock: bigint; verified: boolean }>();
    for (const log of verifyLogs) {
      const { requestId } = decodeIndexedUserAndRequestId(log as unknown as { topics: `0x${string}`[] });
      try {
        const [precompileId, executor, , settledBlock, verified] = decodeAbiParameters(
          [{ type: "uint8" }, { type: "address" }, { type: "bytes32" }, { type: "uint256" }, { type: "bool" }],
          (log as unknown as { data: Hex }).data,
        );
        verifyMap.set(requestId, {
          precompileId: Number(precompileId),
          executor: executor as `0x${string}`,
          settledBlock,
          verified: Boolean(verified),
        });
      } catch {
        // skip malformed
      }
    }

    const messages: IndexedMessage[] = [];
    const seenRequestIds = new Set<string>();

    // Decode ChatResultSettled logs.
    for (const log of chatLogs) {
      const { requestId } = decodeIndexedUserAndRequestId(log as unknown as { topics: `0x${string}`[] });
      if (seenRequestIds.has(requestId)) continue;
      seenRequestIds.add(requestId);
      try {
        // Non-indexed: (bool hasError, bytes completionData, string errorMessage, bytes encPrompt, bytes encResponse, bytes32 txHash)
        const [hasError, , errorMessage, encPrompt, encResponse] = decodeAbiParameters(
          [{ type: "bool" }, { type: "bytes" }, { type: "string" }, { type: "bytes" }, { type: "bytes" }, { type: "bytes32" }],
          (log as unknown as { data: Hex }).data,
        );
        const v = verifyMap.get(requestId);
        messages.push({
          requestId,
          kind: "llm",
          user: address as `0x${string}`,
          txHash: (log as unknown as { transactionHash: `0x${string}` }).transactionHash,
          blockNumber: (log as unknown as { blockNumber: bigint }).blockNumber,
          timestamp: Number((log as unknown as { blockTimestamp?: number }).blockTimestamp ?? 0),
          hasError: Boolean(hasError),
          errorMessage,
          encryptedPromptCiphertext: ("0x" + Buffer.from(encPrompt.slice(2), "hex").toString("hex")) as Hex,
          encryptedResponseCiphertext: ("0x" + Buffer.from(encResponse.slice(2), "hex").toString("hex")) as Hex,
          precompileId: v?.precompileId,
          executor: v?.executor,
          settledBlock: v?.settledBlock,
          verified: v?.verified,
        });
      } catch {
        // skip malformed
      }
    }

    // Decode ImageResultDelivered logs.
    for (const log of imageLogs) {
      const { requestId } = decodeIndexedUserAndRequestId(log as unknown as { topics: `0x${string}`[] });
      if (seenRequestIds.has(requestId)) continue;
      seenRequestIds.add(requestId);
      try {
        // Non-indexed: (bool hasError, string outputUri, bytes32 outputContentHash, uint256 width, uint256 height, string errMsg, bytes encPrompt, bytes encResponse)
        const [hasError, outputUri, outputContentHash, , , errorMessage, encPrompt, encResponse] = decodeAbiParameters(
          [{ type: "bool" }, { type: "string" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "string" }, { type: "bytes" }, { type: "bytes" }],
          (log as unknown as { data: Hex }).data,
        );
        const v = verifyMap.get(requestId);
        messages.push({
          requestId,
          kind: "image",
          user: address as `0x${string}`,
          txHash: (log as unknown as { transactionHash: `0x${string}` }).transactionHash,
          blockNumber: (log as unknown as { blockNumber: bigint }).blockNumber,
          timestamp: Number((log as unknown as { blockTimestamp?: number }).blockTimestamp ?? 0),
          hasError: Boolean(hasError),
          errorMessage,
          encryptedPromptCiphertext: ("0x" + Buffer.from(encPrompt.slice(2), "hex").toString("hex")) as Hex,
          encryptedResponseCiphertext: ("0x" + Buffer.from(encResponse.slice(2), "hex").toString("hex")) as Hex,
          outputUri,
          outputContentHash: outputContentHash as `0x${string}`,
          precompileId: v?.precompileId,
          executor: v?.executor,
          settledBlock: v?.settledBlock,
          verified: v?.verified,
        });
      } catch {
        // skip malformed
      }
    }

    // Merge with cache and sort newest-first.
    const cached = getCachedMessages(addrLc);
    const merged = [...messages, ...cached].sort((a, b) => Number(b.blockNumber - a.blockNumber)).slice(0, limit);
    setCachedMessages(addrLc, merged, currentBlock);

    return NextResponse.json({
      address,
      contractAddress: PURRCHA_CHAT_ADDRESS,
      scannedFromBlock: fromBlock.toString(),
      currentBlock: currentBlock.toString(),
      count: merged.length,
      messages: merged.map((m) => ({
        requestId: m.requestId,
        kind: m.kind,
        user: m.user,
        txHash: m.txHash,
        blockNumber: m.blockNumber.toString(),
        timestamp: m.timestamp,
        hasError: m.hasError,
        errorMessage: m.errorMessage,
        encryptedPromptCiphertext: m.encryptedPromptCiphertext,
        encryptedResponseCiphertext: m.encryptedResponseCiphertext,
        outputUri: m.outputUri,
        outputContentHash: m.outputContentHash,
        precompileId: m.precompileId,
        executor: m.executor,
        settledBlock: m.settledBlock?.toString() ?? null,
        verified: m.verified,
      })),
    });
  } catch (e) {
    return NextResponse.json({
      error: "Indexing failed",
      message: e instanceof Error ? e.message : String(e),
      messages: [],
    }, { status: 502 });
  }
}

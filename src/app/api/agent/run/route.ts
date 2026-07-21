/**
 * POST /api/agent/run
 *
 * Submits a sovereign agent job to the SovereignAgentConsumer contract on Ritual Chain.
 * Uses the official ritual-dapp-skills approach with ritual provider (no external API key)
 * and empty DA refs (no HuggingFace needed).
 *
 * Body: { prompt: string, model?: string }
 * Returns: { success: boolean, txHash?: string, jobId?: string, error?: string }
 *
 * This is a SERVERLESS-SAFE route — it uses viem directly (not a long-running process).
 * The private key comes from upload/private.txt (server-side only, never exposed to client).
 */

import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, http, createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, keccak256, type Hex, type Address } from "viem";
import { encrypt } from "eciesjs";
import { readFileSync } from "fs";
import { join } from "path";
import { RITUAL_CHAIN } from "@/lib/ritual/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOVEREIGN_AGENT_CONSUMER = (process.env.NEXT_PUBLIC_SOVEREIGN_AGENT_CONSUMER_ADDRESS ?? "0x17B557e2c6e503cd56D5F33FF25557fE77BF0298") as Address;
const TEE_REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F" as Address;
const ASYNC_JOB_TRACKER = "0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5" as Address;

const TEE_REGISTRY_ABI = [
  {
    name: "getServicesByCapability",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "capability", type: "uint8" }, { name: "checkValidity", type: "bool" }],
    outputs: [{
      type: "tuple[]",
      components: [
        {
          name: "node",
          type: "tuple",
          components: [
            { name: "paymentAddress", type: "address" },
            { name: "teeAddress", type: "address" },
            { name: "teeType", type: "uint8" },
            { name: "publicKey", type: "bytes" },
            { name: "endpoint", type: "string" },
            { name: "certPubKeyHash", type: "bytes32" },
            { name: "capability", type: "uint8" },
          ],
        },
        { name: "isValid", type: "bool" },
        { name: "workloadId", type: "bytes32" },
      ],
    }],
  },
] as const;

const CONSUMER_ABI = [
  { name: "callSovereignAgent", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "input", type: "bytes" }], outputs: [{ type: "bytes" }] },
] as const;

// 23-field SovereignAgentRequest
const SOVEREIGN_REQUEST_TYPES = [
  { type: "address" },     // 0  executor
  { type: "uint256" },     // 1  ttl
  { type: "bytes" },       // 2  userPublicKey
  { type: "uint64" },      // 3  pollIntervalBlocks
  { type: "uint64" },      // 4  maxPollBlock
  { type: "string" },      // 5  taskIdMarker
  { type: "address" },     // 6  deliveryTarget
  { type: "bytes4" },      // 7  deliverySelector
  { type: "uint256" },     // 8  deliveryGasLimit
  { type: "uint256" },     // 9  deliveryMaxFeePerGas
  { type: "uint256" },     // 10 deliveryMaxPriorityFeePerGas
  { type: "uint16" },      // 11 cliType
  { type: "string" },      // 12 prompt
  { type: "bytes" },       // 13 encryptedSecrets
  { type: "tuple", components: [{ type: "string" }, { type: "string" }, { type: "string" }] }, // 14 convoHistory
  { type: "tuple", components: [{ type: "string" }, { type: "string" }, { type: "string" }] }, // 15 output
  { type: "tuple[]", components: [{ type: "string" }, { type: "string" }, { type: "string" }] }, // 16 skills
  { type: "tuple", components: [{ type: "string" }, { type: "string" }, { type: "string" }] }, // 17 systemPrompt
  { type: "string" },      // 18 model
  { type: "string[]" },    // 19 tools
  { type: "uint16" },      // 20 maxTurns
  { type: "uint32" },      // 21 maxTokens
  { type: "string" },      // 22 rpcUrls
] as const;

function getPrivateKey(): Hex {
  try {
    const raw = readFileSync(join(process.cwd(), "upload", "private.txt"), "utf-8");
    const match = raw.match(/0x[0-9a-fA-F]{64}/);
    if (!match) throw new Error("No private key found in upload/private.txt");
    return match[0] as Hex;
  } catch (e) {
    throw new Error(`Failed to read private key: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body.prompt as string;
    const model = body.model as string || "zai-org/GLM-4.7-FP8";

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json({ success: false, error: "Prompt is required" }, { status: 400 });
    }

    const privateKey = getPrivateKey();
    const account = privateKeyToAccount(privateKey);

    const publicClient = createPublicClient({
      chain: RITUAL_CHAIN,
      transport: http("https://rpc.ritualfoundation.org"),
    });

    const walletClient = createWalletClient({
      account,
      chain: RITUAL_CHAIN,
      transport: http("https://rpc.ritualfoundation.org"),
    });

    // 1. Check sender lock
    const isPending = await publicClient.readContract({
      address: ASYNC_JOB_TRACKER,
      abi: [{ name: "hasPendingJobForSender", type: "function", stateMutability: "view",
        inputs: [{ name: "sender", type: "address" }], outputs: [{ type: "bool" }] }],
      functionName: "hasPendingJobForSender",
      args: [account.address],
    }) as boolean;

    if (isPending) {
      return NextResponse.json({
        success: false,
        error: "A pending async job is already in flight. Wait for it to settle.",
      }, { status: 409 });
    }

    // 2. Discover executor
    const services = await publicClient.readContract({
      address: TEE_REGISTRY,
      abi: TEE_REGISTRY_ABI,
      functionName: "getServicesByCapability",
      args: [0, true],
    }) as unknown as Array<{ node: { teeAddress: Address; publicKey: Hex }; isValid: boolean }>;

    if (!services || services.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No valid TEE executors available for HTTP_CALL capability.",
      }, { status: 503 });
    }

    const executor = services[0].node.teeAddress;
    const executorPubKey = services[0].node.publicKey;

    // 3. Encrypt secrets (ritual provider, no API key)
    const secretsJson = JSON.stringify({ LLM_PROVIDER: "ritual" });
    const encryptedSecrets = `0x${Buffer.from(
      encrypt(Buffer.from(executorPubKey.slice(2), "hex"), Buffer.from(secretsJson))
    ).toString("hex")}` as Hex;

    // 4. Build the 23-field request
    const deliverySelector = keccak256(new TextEncoder().encode("onSovereignAgentResult(bytes32,bytes)")).slice(0, 10) as Hex;

    const requestInput = encodeAbiParameters(SOVEREIGN_REQUEST_TYPES, [
      executor,                   // 0
      500n,                       // 1  ttl
      "0x" as Hex,                // 2  userPublicKey (empty)
      5n,                         // 3  pollIntervalBlocks
      70000n,                     // 4  maxPollBlock (max allowed)
      "PURRCHA_AGENT",            // 5  taskIdMarker
      SOVEREIGN_AGENT_CONSUMER,   // 6  deliveryTarget
      deliverySelector,           // 7
      3_000_000n,                 // 8  deliveryGasLimit
      1_000_000_000n,             // 9  deliveryMaxFeePerGas (1 gwei)
      100_000_000n,               // 10 deliveryMaxPriorityFeePerGas
      6,                          // 11 cliType (6=ZeroClaw)
      prompt,                     // 12 prompt
      encryptedSecrets,           // 13
      ["", "", ""],               // 14 convoHistory (empty)
      ["", "", ""],               // 15 output (empty)
      [],                         // 16 skills (empty)
      ["", "", ""],               // 17 systemPrompt (empty)
      model,                      // 18 model
      [],                         // 19 tools (empty)
      5,                          // 20 maxTurns
      2048,                       // 21 maxTokens
      "",                         // 22 rpcUrls
    ]);

    // 5. Encode callSovereignAgent(bytes) calldata
    const callData = encodeAbiParameters(
      [{ type: "bytes" }],
      [requestInput],
    );

    // Manually prepend the function selector for callSovereignAgent(bytes)
    const selector = keccak256(new TextEncoder().encode("callSovereignAgent(bytes)")).slice(0, 10) as Hex;
    const fullCalldata = (selector + callData.slice(2)) as Hex;

    // 6. Submit the transaction (EIP-1559)
    const block = await publicClient.getBlock();
    const baseFee = block.baseFeePerGas ?? 1_000_000_000n;
    const priorityFee = 1_000_000_000n;
    const maxFee = baseFee * 2n + priorityFee;

    const txHash = await walletClient.sendTransaction({
      to: SOVEREIGN_AGENT_CONSUMER,
      data: fullCalldata,
      gas: 900_000n,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: priorityFee,
      type: "eip1559",
      account,
    });

    // 7. Wait for receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return NextResponse.json({
      success: receipt.status === "success",
      txHash,
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      error: receipt.status === "reverted" ? "Transaction reverted on-chain" : undefined,
    });
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }
}

/**
 * PurrchaChat contract ABI loader. The ABI is exported from Foundry
 * (forge inspect PurrchaChat abi --json) into PurrchaChat.abi.json.
 */
import abiJson from "./PurrchaChat.abi.json";
import type { Abi } from "viem";
import { PURRCHA_CHAT_ADDRESS } from "./constants";
import { RITUAL_CHAIN, ASYNC_JOB_TRACKER_ADDRESS, WALLET_ADDRESS, TEE_SERVICE_REGISTRY_ADDRESS } from "./constants";

export const PURRCHA_CHAT_ABI = abiJson as Abi;

/** True if the contract address is configured (non-empty). */
export const isContractDeployed = PURRCHA_CHAT_ADDRESS.length > 0;

/** RitualWallet ABI (minimal, for balance/lock reads + deposit). */
export const RITUAL_WALLET_ABI = [
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [{ name: "lockDuration", type: "uint256" }], outputs: [] },
  { name: "depositFor", type: "function", stateMutability: "payable", inputs: [{ name: "user", type: "address" }, { name: "lockDuration", type: "uint256" }], outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "lockUntil", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** AsyncJobTracker ABI (minimal, for sender-lock check + event watching). */
export const ASYNC_JOB_TRACKER_ABI = [
  { name: "hasPendingJobForSender", type: "function", stateMutability: "view", inputs: [{ name: "sender", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "isLongRunning", type: "function", stateMutability: "view", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { name: "isPhase1Settled", type: "function", stateMutability: "view", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [{ type: "bool" }] },
  {
    type: "event", name: "JobAdded",
    inputs: [
      { name: "executor", type: "address", indexed: true },
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "precompileAddress", type: "address", indexed: true },
      { name: "commitBlock", type: "uint256", indexed: false },
      { name: "precompileInput", type: "bytes", indexed: false },
      { name: "senderAddress", type: "address", indexed: false },
      { name: "previousBlockHash", type: "bytes32", indexed: false },
      { name: "previousBlockNumber", type: "uint256", indexed: false },
      { name: "previousBlockTimestamp", type: "uint256", indexed: false },
      { name: "ttl", type: "uint256", indexed: false },
      { name: "createdAt", type: "uint256", indexed: false },
    ],
  },
  { type: "event", name: "Phase1Settled", inputs: [{ name: "jobId", type: "bytes32", indexed: true }, { name: "executor", type: "address", indexed: true }, { name: "settledBlock", type: "uint256", indexed: false }] },
  { type: "event", name: "ResultDelivered", inputs: [{ name: "jobId", type: "bytes32", indexed: true }, { name: "target", type: "address", indexed: true }, { name: "success", type: "bool", indexed: false }] },
  { type: "event", name: "JobRemoved", inputs: [{ name: "executor", type: "address", indexed: true }, { name: "jobId", type: "bytes32", indexed: true }, { name: "completed", type: "bool", indexed: true }] },
] as const;

/** TEEServiceRegistry ABI (minimal, for executor discovery). */
export const TEE_REGISTRY_ABI = [
  {
    name: "getServicesByCapability", type: "function", stateMutability: "view",
    inputs: [{ name: "capability", type: "uint8" }, { name: "checkValidity", type: "bool" }],
    outputs: [{
      type: "tuple[]", components: [
        { name: "node", type: "tuple", components: [
          { name: "paymentAddress", type: "address" },
          { name: "teeAddress", type: "address" },
          { name: "teeType", type: "uint8" },
          { name: "publicKey", type: "bytes" },
          { name: "endpoint", type: "string" },
          { name: "certPubKeyHash", type: "bytes32" },
          { name: "capability", type: "uint8" },
        ]},
        { name: "isValid", type: "bool" },
        { name: "workloadId", type: "bytes32" },
      ],
    }],
  },
  { name: "getIndexedServiceCountByCapability", type: "function", stateMutability: "view", inputs: [{ name: "capability", type: "uint8" }], outputs: [{ type: "uint256" }] },
  { name: "getIndexedServiceByCapabilityAt", type: "function", stateMutability: "view", inputs: [{ name: "capability", type: "uint8" }, { name: "index", type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

export {
  RITUAL_CHAIN,
  PURRCHA_CHAT_ADDRESS,
  ASYNC_JOB_TRACKER_ADDRESS,
  WALLET_ADDRESS,
  TEE_SERVICE_REGISTRY_ADDRESS,
};

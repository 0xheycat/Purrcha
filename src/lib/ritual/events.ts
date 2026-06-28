/**
 * Event signature topics for the PurrchaChat contract. Used by the backend indexer
 * to filter logs by topic0. Computed with keccak256 of the event signature.
 */
import { keccak256 } from "viem";

export const EVENT_TOPICS = {
  ChatSubmitted: keccak256("ChatSubmitted(address,bytes32,address,string,uint256,uint256)"),
  ChatResultSettled: keccak256("ChatResultSettled(address,bytes32,bool,bytes,string,bytes,bytes,bytes32)"),
  ImageJobSubmitted: keccak256("ImageJobSubmitted(address,bytes32,address,string,bytes32,uint256)"),
  ImageResultDelivered: keccak256("ImageResultDelivered(address,bytes32,bool,string,bytes32,uint256,uint256,string,bytes,bytes)"),
  VerificationMetadata: keccak256("VerificationMetadata(address,bytes32,uint8,address,bytes32,uint256,bool)"),
} as const;

/** Decode the user (topic1) and requestId (topic2) from an indexed event log. */
export function decodeIndexedUserAndRequestId(log: { topics: `0x${string}`[] }): {
  user: `0x${string}`;
  requestId: `0x${string}`;
} {
  const user = ("0x" + log.topics[1].slice(26)) as `0x${string}`;
  const requestId = log.topics[2];
  return { user, requestId };
}

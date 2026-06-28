#!/usr/bin/env python3
"""
Purrcha Sovereign Agent job submitter.
Uses the official ritual-dapp-skills SovereignAgentConsumer contract (0x080C precompile)
with LLM_PROVIDER=ritual (zai-org/GLM-4.7-FP8, no external API key) and EMPTY DA refs
(no HuggingFace repo needed — the ritual provider doesn't require DA storage for one-shot jobs).

This adapts the zunmax/ritual-agent-deployment approach (empty DA refs + ritual provider)
to work with the official ritual-dapp-skills SovereignAgentConsumer contract.
"""

import json
import os
import sys
import time

from ecies import encrypt as ecies_encrypt
from ecies.config import ECIES_CONFIG
from eth_abi.abi import decode, encode
from web3 import Web3

# MANDATORY: 12-byte nonce for Ritual ECIES compatibility
ECIES_CONFIG.symmetric_nonce_length = 12

# Ritual Chain system contracts
RPC_URL = os.environ.get("RPC_URL", "https://rpc.ritualfoundation.org")
REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F"
TRACKER = "0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5"
WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948"

# Our deployed SovereignAgentConsumer
CONSUMER = os.environ.get("CONSUMER_ADDRESS", "0x17B557e2c6e503cd56D5F33FF25557fE77BF0298")

TEE_SERVICE_REGISTRY_ABI = [
    {
        "name": "getServicesByCapability",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "capability", "type": "uint8"}, {"name": "checkValidity", "type": "bool"}],
        "outputs": [
            {
                "name": "",
                "type": "tuple[]",
                "components": [
                    {
                        "name": "node",
                        "type": "tuple",
                        "components": [
                            {"name": "paymentAddress", "type": "address"},
                            {"name": "teeAddress", "type": "address"},
                            {"name": "teeType", "type": "uint8"},
                            {"name": "publicKey", "type": "bytes"},
                            {"name": "endpoint", "type": "string"},
                            {"name": "certPubKeyHash", "type": "bytes32"},
                            {"name": "capability", "type": "uint8"},
                        ],
                    },
                    {"name": "isValid", "type": "bool"},
                    {"name": "workloadId", "type": "bytes32"},
                ],
            }
        ],
    }
]

# 23-field SovereignAgentRequest ABI types
SOVEREIGN_REQUEST_TYPES = [
    "address",    # 0  executor
    "uint256",    # 1  ttl
    "bytes",      # 2  userPublicKey (empty)
    "uint64",     # 3  pollIntervalBlocks
    "uint64",     # 4  maxPollBlock
    "string",     # 5  taskIdMarker
    "address",    # 6  deliveryTarget
    "bytes4",     # 7  deliverySelector
    "uint256",    # 8  deliveryGasLimit
    "uint256",    # 9  deliveryMaxFeePerGas
    "uint256",    # 10 deliveryMaxPriorityFeePerGas
    "uint16",     # 11 cliType (5=crush)
    "string",     # 12 prompt
    "bytes",      # 13 encryptedSecrets
    "(string,string,string)",   # 14 convoHistory (EMPTY — no DA needed with ritual provider)
    "(string,string,string)",   # 15 output (EMPTY)
    "(string,string,string)[]", # 16 skills (empty array)
    "(string,string,string)",   # 17 systemPrompt (EMPTY)
    "string",     # 18 model
    "string[]",   # 19 tools (empty)
    "uint16",     # 20 maxTurns
    "uint32",     # 21 maxTokens
    "string",     # 22 rpcUrls
]


def get_executor(w3):
    """Find a valid HTTP_CALL executor (capability 0) and return (teeAddress, publicKeyBytes)."""
    reg = w3.eth.contract(address=Web3.to_checksum_address(REGISTRY), abi=TEE_SERVICE_REGISTRY_ABI)
    services = reg.functions.getServicesByCapability(0, True).call()
    if not services:
        print("ERROR: No valid executors in TEEServiceRegistry", file=sys.stderr)
        sys.exit(1)
    node = services[0][0]
    return Web3.to_checksum_address(node[1]), bytes(node[3])


def build_request(executor, pub_key, consumer, prompt, model, cli_type=5):
    """Build the 23-field SovereignAgentRequest with ritual provider + empty DA refs."""
    # Encrypt secrets: just LLM_PROVIDER=ritual (no external API key needed)
    secrets_json = json.dumps({"LLM_PROVIDER": "ritual"}).encode()
    encrypted = ecies_encrypt(pub_key.hex(), secrets_json)

    delivery_selector = Web3.keccak(text="onSovereignAgentResult(bytes32,bytes)")[:4]
    current_block = w3.eth.block_number
    max_poll_block = 70_000  # Max allowed by Ritual Chain (~6.8h at 350ms/block)

    values = [
        Web3.to_checksum_address(executor),  # 0  executor
        500,                                  # 1  ttl
        b"",                                   # 2  userPublicKey (empty)
        5,                                     # 3  pollIntervalBlocks
        max_poll_block,                        # 4  maxPollBlock
        "PURRCHA_SOVEREIGN_AGENT",            # 5  taskIdMarker
        Web3.to_checksum_address(consumer),   # 6  deliveryTarget
        delivery_selector,                     # 7  deliverySelector
        3_000_000,                             # 8  deliveryGasLimit
        1_000_000_000,                         # 9  deliveryMaxFeePerGas (1 gwei)
        100_000_000,                           # 10 deliveryMaxPriorityFeePerGas (0.1 gwei)
        cli_type,                              # 11 cliType (5=crush)
        prompt,                                # 12 prompt
        encrypted,                             # 13 encryptedSecrets
        ("", "", ""),                          # 14 convoHistory (EMPTY — no DA needed)
        ("", "", ""),                          # 15 output (EMPTY)
        [],                                    # 16 skills (empty)
        ("", "", ""),                          # 17 systemPrompt (EMPTY)
        model,                                 # 18 model
        [],                                    # 19 tools (empty)
        5,                                     # 20 maxTurns
        2048,                                  # 21 maxTokens
        "",                                    # 22 rpcUrls
    ]
    return encode(SOVEREIGN_REQUEST_TYPES, values)


def submit_job(w3, private_key, consumer, request_input):
    """Submit the sovereign agent job via the SovereignAgentConsumer.callSovereignAgent(bytes)."""
    from eth_account import Account
    account = Account.from_key(private_key)

    # Encode callSovereignAgent(bytes)
    func_sig = Web3.keccak(text="callSovereignAgent(bytes)")[:4]
    calldata = func_sig + encode(["bytes"], [request_input])

    # Check sender lock
    tracker = w3.eth.contract(
        address=Web3.to_checksum_address(TRACKER),
        abi=[{"name": "hasPendingJobForSender", "type": "function", "stateMutability": "view",
              "inputs": [{"name": "sender", "type": "address"}],
              "outputs": [{"type": "bool"}]}],
    )
    if tracker.functions.hasPendingJobForSender(account.address).call():
        print("ERROR: Sender has a pending async job. Wait for it to settle.", file=sys.stderr)
        sys.exit(1)

    # Build + sign + broadcast tx (EIP-1559 format — Ritual Chain requires type 2)
    nonce = w3.eth.get_transaction_count(account.address)
    base_fee = w3.eth.get_block("latest")["baseFeePerGas"]
    priority_fee = 1_000_000_000  # 1 gwei
    max_fee = max(base_fee * 2 + priority_fee, priority_fee * 2)  # ensure max >= priority
    tx = {
        "to": Web3.to_checksum_address(consumer),
        "data": calldata,
        "gas": 900_000,
        "maxFeePerGas": max_fee,
        "maxPriorityFeePerGas": priority_fee,
        "nonce": nonce,
        "chainId": 1979,
        "type": 2,  # EIP-1559
    }
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"TX_HASH={tx_hash.hex()}")
    return tx_hash


def poll_phase2(w3, consumer, tx_hash, from_block, timeout=300):
    """Poll for SovereignAgentResultDelivered event."""
    event_sig = Web3.keccak(text="SovereignAgentResultDelivered(bytes32,bytes)")
    job_topic = "0x" + tx_hash.hex()[2:].rjust(64, "0")
    start = time.time()

    print(f"Polling for Phase 2 delivery (up to {timeout}s)...")
    while time.time() - start < timeout:
        try:
            logs = w3.eth.get_logs({
                "address": Web3.to_checksum_address(consumer),
                "topics": [event_sig, job_topic],
                "fromBlock": int(from_block),
                "toBlock": "latest",
            })
            if logs:
                raw_data = bytes(logs[0]["data"])
                (result_bytes,) = decode(["bytes"], raw_data)
                # Sovereign agent result: (bool success, string error, string text, ...)
                try:
                    success, error, text, *_ = decode(
                        ["bool", "string", "string", "string", "string", "string[]"],
                        result_bytes,
                    )
                    print(f"\n{'='*60}")
                    print(f"PHASE 2 DELIVERED")
                    print(f"{'='*60}")
                    print(f"Success: {success}")
                    if error:
                        print(f"Error: {error}")
                    if text:
                        print(f"Result:\n{text}")
                    print(f"{'='*60}")
                except Exception:
                    print(f"\nRaw result: 0x{result_bytes.hex()[:200]}...")
                return
        except Exception as e:
            print(f"  poll error: {e}", file=sys.stderr)
        time.sleep(2)

    print(f"TIMEOUT: no Phase 2 delivery after {timeout}s", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    private_key = os.environ.get("PRIVATE_KEY", "")
    if not private_key:
        print("ERROR: PRIVATE_KEY env var required", file=sys.stderr)
        sys.exit(1)
    if not private_key.startswith("0x"):
        private_key = "0x" + private_key

    prompt = os.environ.get("PROMPT", "Say hello world from Purrcha sovereign agent on Ritual Chain!")
    model = os.environ.get("MODEL", "zai-org/GLM-4.7-FP8")
    cli_type = int(os.environ.get("CLI_TYPE", "5"))

    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    print(f"Chain ID: {w3.eth.chain_id}")
    print(f"Consumer: {CONSUMER}")
    print(f"Prompt: {prompt}")
    print(f"Model: {model}")
    print(f"CLI type: {cli_type} (5=crush)")

    # 1. Discover executor
    print("\n1. Discovering executor...")
    executor, pub_key = get_executor(w3)
    print(f"   Executor: {executor}")
    print(f"   Public key: 0x{pub_key.hex()[:20]}...")

    # 2. Build request
    print("\n2. Building sovereign agent request (ritual provider, empty DA refs)...")
    request_input = build_request(executor, pub_key, CONSUMER, prompt, model, cli_type)
    print(f"   Request size: {len(request_input)} bytes")

    # 3. Submit
    print("\n3. Submitting Phase 1 transaction...")
    from_block = w3.eth.block_number
    tx_hash = submit_job(w3, private_key, CONSUMER, request_input)
    print(f"   TX hash: {tx_hash.hex()}")

    # 4. Wait for receipt
    print("\n4. Waiting for Phase 1 receipt...")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    print(f"   Status: {'SUCCESS' if receipt['status'] == 1 else 'FAILED'}")
    print(f"   Block: {receipt['blockNumber']}")
    print(f"   Gas used: {receipt['gasUsed']}")

    if receipt["status"] != 1:
        print("ERROR: Phase 1 transaction failed!", file=sys.stderr)
        sys.exit(1)

    # 5. Poll for Phase 2
    print(f"\n5. Waiting for Phase 2 callback delivery...")
    poll_phase2(w3, CONSUMER, tx_hash, from_block, timeout=int(os.environ.get("PHASE2_TIMEOUT", "300")))

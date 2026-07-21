# Purrcha

[![Verified](https://img.shields.io/badge/verified-self--hosted-15f5ba)](VERIFICATION.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Ritual Chain](https://img.shields.io/badge/Ritual%20Chain-1979-15f5ba)](https://explorer.ritualfoundation.org)
[![Public project page](https://img.shields.io/badge/project-0xheycat.xyz-f5b45a)](https://0xheycat.xyz/work/purrcha)

**Private Multi-modal ChatGPT On-Chain** — a flagship dApp on [Ritual Chain](https://ritual.foundation) (Chain ID 1979).

Purrcha is a premium dark-mode AI terminal command center: private, verifiable, on-chain, and TEE-powered. Connect a wallet, send text prompts, upload images, receive AI responses through Ritual precompiles, encrypt private conversation history, persist/index on-chain events, and inspect the transaction evidence behind each response.

## Public verification

- **PurrchaChat contract:** [`0x6bcd7da645ada988a1f2d46ef265446201d9ab00`](https://explorer.ritualfoundation.org/address/0x6bcd7da645ada988a1f2d46ef265446201d9ab00)
- **Deployment transaction:** [`0xf675e074…393da06`](https://explorer.ritualfoundation.org/tx/0xf675e074393b8486dbab96c4b3db30b5564e5ccb79e8381ff83fba6ef393da06)
- **Project overview:** [0xheycat.xyz/work/purrcha](https://0xheycat.xyz/work/purrcha)
- **Current limitation:** Ritual executor availability can affect live inference even when the contract and application build are healthy.

---

## What It Does

- **Text chat via LLM precompile (`0x0802`)** — on-chain AI inference using `zai-org/GLM-4.7-FP8` running in a Ritual TEE executor. Short-running async: the result settles in the same transaction receipt (`spcCalls` field).
- **Image input via Image precompile (`0x0818`)** — multimodal flow using `black-forest-labs/FLUX.2-klein-4B`. Long-running async: Phase 1 submits, Phase 2 delivers via callback.
- **Private conversation history via ECIES** — every prompt/response is encrypted client-side with a keypair derived from the wallet owner's EIP-191 signature. The contract stores only opaque ciphertext in events. Only the wallet owner can decrypt.
- **Full 9-state async TX lifecycle** — `idle → submitted → confirming → pending_result → settling → settled` (with `failed`/`rejected`/`timeout` branches). Rendered as a live execution rail.
- **On-chain chat history + backend indexing** — the `PurrchaChat` contract emits events for every chat submission, encrypted message, async job reference, final response, and verification metadata. Next.js API Routes index these events from the real Ritual Chain RPC.
- **Verify this response** — every AI response includes a verification drawer showing the tx hash, contract event, precompile used, TEE attestation status, and raw proof data.

---

## Why Ritual Precompiles

Ritual Chain is a TEE-verified L1 with enshrined AI/ML precompiles. Instead of calling off-chain AI APIs (OpenAI, Anthropic, etc.) through oracles, Purrcha uses Ritual's native on-chain precompiles. This means:

- **No centralized AI API** — inference runs in a TEE executor registered on-chain.
- **No off-chain state** — every prompt and response is recorded in the transaction receipt.
- **Verifiable** — the `spcCalls` receipt field contains the precompile input/output, auditable by anyone.
- **Private by design** — ECIES encryption ensures only the wallet owner can read their history.

### Precompiles Used

| Precompile | Address | Execution Model | Purpose |
|---|---|---|---|
| LLM Call | `0x0802` | Short-running async | Text chat inference (`zai-org/GLM-4.7-FP8`) |
| Image Call | `0x0818` | Long-running async | Image input/multimodal (`black-forest-labs/FLUX.2-klein-4B`) |
| TX Hash | `0x0830` | Synchronous | Transaction hash for verification metadata |

### System Contracts (skill-defined, fixed)

| Contract | Address | Purpose |
|---|---|---|
| RitualWallet | `0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948` | Fee deposits + locking |
| AsyncJobTracker | `0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5` | Async job lifecycle tracking |
| AsyncDelivery | `0x5A16214fF555848411544b005f7Ac063742f39F6` | Long-running result delivery |
| TEEServiceRegistry | `0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F` | Executor discovery |
| SecretsAccessControl | `0xf9BF1BC8A3e79B9EBeD0fa2Db70D0513fecE32FD` | Delegated secret sharing |

---

## How Privacy Works

1. **On session start**, the wallet owner signs a domain-specific EIP-191 message (`"Sign this message to unlock your Purrcha private conversation history..."`).
2. The signature is `keccak256`-hashed to derive a secp256k1 private key (via `eciesjs`). The corresponding public key is derived.
3. **Before every chat submission**, the frontend encrypts the prompt with the derived public key (ECIES). The ciphertext is passed to the contract as `encryptedPromptCiphertext`.
4. The contract stores the ciphertext **verbatim** in `ChatResultSettled` / `ImageResultDelivered` events. It never sees plaintext and cannot decrypt.
5. **On history load**, the backend API returns encrypted ciphertext. The frontend decrypts with the derived private key (stored in `sessionStorage`, cleared on tab close).
6. A different wallet produces a different keypair and cannot decrypt another wallet's history. If decryption fails, the UI shows `"encrypted — unlock to read"` — never a fake fallback.

The ECIES nonce length is set to 12 bytes (`ECIES_CONFIG.symmetricNonceLength = 12`) per the Ritual secrets skill requirement.

---

## How Verification Works

Every AI response includes a **"Verify this response"** action that opens a drawer showing:

- **Transaction hash** — the on-chain tx that settled the result.
- **Precompile used** — name + address (e.g. `LLM Call (0x0802)`).
- **Contract event reference** — the `PurrchaChat` log emitted (topic, data, logIndex).
- **Async job/result ID** — the `jobId` from AsyncJobTracker (for image long-running calls).
- **TEE attestation** — Ritual's TEE trust is implicit: the executor is registered in `TEEServiceRegistry` and the settlement is verified by the chain's commitment validator. No separate attestation blob is exposed in the receipt today — this is stated honestly in the UI.
- **Raw proof** — the `spcCalls` input/output hex from the receipt, plus the decoded LLM/Image fields.
- **Human-readable explanation** — a plain-English summary of what was verified.

---

## Tech Stack

- **Contracts**: Solidity 0.8.20 + Foundry (forge 1.7.1), `via_ir` enabled for the 30-field LLM ABI encoding.
- **Frontend**: Next.js 16 App Router, TypeScript, Tailwind CSS 4, wagmi v3, viem v2, `eciesjs`, Zustand.
- **Backend**: Next.js API Routes only (serverless-safe, no background worker, no paid DB). In-memory event index cache with optional Vercel KV upgrade.
- **Design**: Ritual dark-mode-first design system — JetBrains Mono / Barlow / Archivo Black, green/pink/gold/lime accents on pure black, transparent bordered buttons, no indigo/blue.

---

## Project Structure

```
purrcha/
├── contracts/                      # Solidity + Foundry
│   ├── src/
│   │   ├── PurrchaChat.sol         # Main consumer contract (LLM + Image + ECIES events)
│   │   └── interfaces/IPurrchaChat.sol
│   ├── test/
│   │   ├── PurrchaChat.t.sol       # 11 unit tests (mocked precompiles)
│   │   └── PurrchaChatFork.t.sol   # 5 fork tests against live Ritual Chain
│   ├── script/Deploy.s.sol         # Broadcast deploy script
│   └── foundry.toml                # via_ir=true, solc 0.8.20, cancun EVM
├── src/
│   ├── app/
│   │   ├── page.tsx                # The flagship command-center layout
│   │   ├── layout.tsx              # Fonts + providers
│   │   ├── providers.tsx           # WagmiProvider + QueryClient + Theme
│   │   ├── globals.css             # Ritual dark terminal design tokens
│   │   └── api/                    # Backend indexer routes
│   │       ├── health/             # Chain connectivity probe
│   │       ├── history/            # Encrypted event indexer (per wallet)
│   │       ├── verify/             # Tx receipt + spcCalls decoder
│   │       ├── executor/           # TEE executor discovery
│   │       └── chain/              # Live chain + RitualWallet status
│   ├── lib/ritual/
│   │   ├── constants.ts            # Chain config, precompile addresses, system contracts
│   │   ├── wagmi.ts                # wagmi v3 config
│   │   ├── crypto.ts               # ECIES keypair derivation + encrypt/decrypt
│   │   ├── precompiles.ts          # 30-field LLM + 18-field Image encode/decode
│   │   ├── abi.ts                  # Contract ABIs
│   │   ├── server.ts               # Server-side viem client + in-memory cache
│   │   └── events.ts               # Event topic constants
│   ├── hooks/ritual/               # 9 hooks (wallet, write, executor, sender-lock, events, encryption, history, submit)
│   ├── components/ritual/          # 8 flagship components (StatusBar, Composer, Timeline, Rail, Drawer, etc.)
│   ├── stores/asyncTxStore.ts      # Zustand persisted 9-state TX tracker
│   └── types/asyncTx.ts            # 9-state machine types + transition rules
├── .env.example                    # All required env vars
└── .ritual-build/progress.json     # Build checkpoint
```

---

## Setup & Deployment

### Prerequisites

- [Node.js](https://nodejs.org/) 20+ and [Bun](https://bun.sh/)
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`)
- A wallet with Ritual testnet RITUAL tokens (free faucet at [faucet.ritualfoundation.org](https://faucet.ritualfoundation.org))

### 1. Install Dependencies

```bash
bun install
cd contracts && forge install foundry-rs/forge-std && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set:
- `PRIVATE_KEY` — your funded deployer wallet's private key (for `forge script`).
- `NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS` — leave empty until after deployment (Step 4).

The `NEXT_PUBLIC_RITUAL_*`, system contract, and precompile addresses are pre-filled (skill-defined constants).

### 3. Compile & Test Contracts

```bash
cd contracts

# Compile
forge build

# Unit tests (mocked precompiles — no RPC needed)
forge test

# Fork tests against the live Ritual Chain RPC
forge test --fork-url https://rpc.ritualfoundation.org --match-contract PurrchaChatForkTest
```

Expected: **11 unit tests pass, 5 fork tests pass.**

### 4. Deploy the Contract

```bash
cd contracts
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://rpc.ritualfoundation.org \
  --broadcast \
  --private-key $PRIVATE_KEY
```

The script prints the deployed `PurrchaChat` address. Copy it.

### 5. Fund Your RitualWallet

Async precompile calls require a RitualWallet deposit (debited from the EOA that signs the tx). Fund your deployer wallet:

```bash
cast send 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948 \
  --rpc-url https://rpc.ritualfoundation.org \
  --private-key $PRIVATE_KEY \
  --value 1ether \
  --create-calendar 100000
```

Wait — `deposit(uint256 lockDuration)` is a function call, not a plain transfer. Use:

```bash
cast send 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948 \
  --rpc-url https://rpc.ritualfoundation.org \
  --private-key $PRIVATE_KEY \
  --value 1ether \
  "deposit(uint256)" 100000
```

This deposits 1 RITUAL with a 100,000-block lock (~9.7 hours at 350ms/block). The lock only extends, so over-locking is safe.

### 6. Configure the Frontend

Set the deployed contract address in `.env`:

```bash
NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS=0xYourDeployedContractAddress
```

### 7. Run the Frontend

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the preview panel). Connect your wallet, switch to Ritual Chain (Chain ID 1979), and start chatting.

### 8. Deploy to Vercel

```bash
vercel
```

Set the `NEXT_PUBLIC_*` environment variables in the Vercel dashboard. The app is serverless-compatible (API routes use in-memory caching; optional Vercel KV for persistent indexing).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_RITUAL_CHAIN_ID` | Yes (pre-filled) | `1979` |
| `NEXT_PUBLIC_RITUAL_RPC_URL` | Yes (pre-filled) | `https://rpc.ritualfoundation.org` |
| `NEXT_PUBLIC_RITUAL_EXPLORER_URL` | Yes (pre-filled) | `https://explorer.ritualfoundation.org` |
| `NEXT_PUBLIC_PURRCHA_CHAT_ADDRESS` | Yes (after deploy) | Your deployed `PurrchaChat` contract address |
| `NEXT_PUBLIC_RITUAL_WALLET_ADDRESS` | Yes (pre-filled) | `0x532F...` (skill-defined) |
| `NEXT_PUBLIC_ASYNC_JOB_TRACKER_ADDRESS` | Yes (pre-filled) | `0xC069...` (skill-defined) |
| `NEXT_PUBLIC_TEE_SERVICE_REGISTRY_ADDRESS` | Yes (pre-filled) | `0x9644...` (skill-defined) |
| `NEXT_PUBLIC_LLM_PRECOMPILE_ADDRESS` | Yes (pre-filled) | `0x...0802` |
| `NEXT_PUBLIC_IMAGE_PRECOMPILE_ADDRESS` | Yes (pre-filled) | `0x...0818` |
| `NEXT_PUBLIC_LLM_MODEL` | Yes (pre-filled) | `zai-org/GLM-4.7-FP8` |
| `PRIVATE_KEY` | Deploy only | Deployer EOA private key (never exposed to frontend) |
| `RPC_URL` | Deploy only | `https://rpc.ritualfoundation.org` |
| `DA_PLATFORM` / `DA_PATH` / `DA_KEY_REF` | Optional | DA storage credentials for image generation output |
| `GCS_SA_KEY` / `GCS_BUCKET` | Optional | GCS credentials (if `DA_PLATFORM=gcs`) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Optional | Vercel KV for persistent event indexing |

---

## Testing

```bash
# Contracts
cd contracts
forge build                              # Compile
forge test                               # 11 unit tests
forge test --fork-url https://rpc.ritualfoundation.org --match-contract PurrchaChatForkTest  # 5 fork tests

# Frontend
cd ..
bun run lint                             # ESLint
bun run build                            # Next.js production build
```

### Manual Test Checklist

- [ ] Wrong chain state — connect wallet on Ethereum mainnet, see "SWITCH TO RITUAL" prompt.
- [ ] Wallet disconnected state — hero overlay with "CONNECT WALLET" CTA.
- [ ] Contract not deployed — banner + composer disabled state.
- [ ] Text prompt flow — submit a prompt, see the 9-state lifecycle progress, response stream in.
- [ ] Image upload flow — attach an image, see preview, submit, callback delivers output.
- [ ] Async lifecycle states — watch the execution rail transition through all 9 states.
- [ ] History load — refresh page, see decrypted history (after signing the unlock message).
- [ ] Decryption failure state — switch wallets, see "encrypted — unlock to read".
- [ ] Verification drawer — click "VERIFY" on any response, inspect proof data.
- [ ] Empty state — fresh wallet, see "No conversations yet".
- [ ] Failed transaction state — submit with insufficient RitualWallet balance.
- [ ] Timeout state — submit and wait beyond TTL (no executor available).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `eth_call` reverts on submit | `useWriteContract` runs simulation on async precompiles | The app uses `useSendTransaction` + `encodeFunctionData` to bypass this — ensure you're not using `useWriteContract` for precompile-touching functions. |
| `insufficient wallet balance` | EOA has no RitualWallet deposit | Deposit RITUAL via `RitualWallet.deposit(lockDuration)` (see Step 5). The EOA that signs the tx must have the deposit, not the contract. |
| `hasPendingJobForSender` true | Sender lock — one async job per EOA at a time | Wait for the current job to settle (check the execution rail) before submitting another. |
| Image callback never fires | No DA storage credentials configured | Set `DA_PLATFORM` / `DA_PATH` / `DA_KEY_REF` + the relevant cloud credentials in `.env`. Without storage, the executor cannot upload output. |
| `executor not found` | No TEE executor registered for the capability | Check `TEEServiceRegistry.getServicesByCapability(cap, true)`. The executor set may be temporarily unavailable. |
| History shows "encrypted — unlock to read" | Wallet not unlocked or wrong wallet | Click "UNLOCK" and sign the EIP-191 message with the wallet that created the history. |
| `spcCalls` empty in receipt | Short-running async didn't settle | Check `receipt.status`. If failed, the executor errored — inspect the `errorMessage` in the decoded output. |

---

## Architecture Constraints (from Ritual skills)

1. **One short-running async precompile per transaction.** LLM (`0x0802`) is short-running async. Image (`0x0818`) is long-running async (separate submit+callback lifecycle). They do not conflict in a single tx.
2. **Sender lock.** The chain rejects async submissions when the sender already has a pending job. The app checks `hasPendingJobForSender` before every submit.
3. **RitualWallet fees.** Async calls require a RitualWallet deposit. The EOA that signs the tx must have the deposit (not the contract). Lock must cover `commit_block + ttl`.
4. **Block time.** ~350ms conservative baseline. 5000 blocks ≈ 29 minutes. Max async TTL = 500 blocks (~175s).
5. **ECIES nonce length.** Must be 12 bytes (`ECIES_CONFIG.symmetricNonceLength = 12`) for Ritual executor compatibility.
6. **No Infernet.** Infernet is Ritual's deprecated off-chain product. This app uses only enshrined precompiles.

---

## Known Limitations

1. **Ritual executor backend**: The sovereign agent's AI inference may fail with 502 Bad Gateway from the Phala network TEE executor. This is a Ritual infrastructure issue, not Purrcha code. The on-chain flow (submit → settle → callback → result stored) works correctly.
2. **Image generation DA storage**: Image precompile jobs require DA provider credentials (GCS/HF/Pinata) for output storage. Without these, image jobs submit but cannot deliver output. The UI shows the honest pending/timeout state.
3. **TEE attestation**: Ritual Chain does not expose a separate attestation blob in the transaction receipt today. The TEE trust is implicit (executor registry + chain-verified settlement). The verification drawer states this honestly.
4. **LLM response encryption**: Because the LLM precompile result settles in the same tx (short-running async), the frontend cannot pass the re-encrypted response back into the same tx call. The contract emits `encryptedResponseCiphertext` as empty in `ChatResultSettled`; the frontend decrypts the `completionData` from the receipt's `spcCalls` and stores the encrypted copy locally. The on-chain prompt ciphertext is always present; the response ciphertext is local-only.

---

## License

[MIT](LICENSE) © 0xheycat

---

## Acknowledgements

- [Ritual Foundation](https://ritual.foundation) — for the Ritual Chain, precompiles, and dApp skills.
- [Foundry](https://book.getfoundry.sh/) — for the Solidity dev tooling.
- [wagmi](https://wagmi.sh) + [viem](https://viem.sh) — for the Ethereum/TypeScript stack.
- [eciesjs](https://github.com/ecies/js) — for the ECIES encryption.

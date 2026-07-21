# Contributing to Purrcha

Purrcha combines a Next.js application with Foundry contracts for Ritual Chain. Keep changes small, evidence-backed, and compatible with the existing architecture.

## Development

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run build
```

Contract checks:

```bash
cd contracts
forge build
forge test --match-contract PurrchaChatTest
```

Fork tests depend on the public Ritual RPC and executor state, so they are not part of the deterministic pull-request gate.

## Pull requests

- explain the problem and the smallest compatible fix
- include verification commands and results
- never commit private keys, wallet secrets, environment files, or paid-service credentials
- preserve honest degraded states when the Ritual executor or RPC is unavailable
- update documentation when behavior, contract addresses, or setup steps change

Security-sensitive findings should follow [SECURITY.md](SECURITY.md), not a public issue.

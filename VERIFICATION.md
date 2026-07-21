# Verification

Purrcha is verified on the exact repository tree through the free, self-hosted Purr Verify runtime.

## Frontend

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run build
```

The production build does not bypass TypeScript errors. A passing build therefore includes strict application type-checking.

## Contracts

```bash
cd contracts
forge build
forge test --match-contract PurrchaChatTest
```

Fork tests depend on Ritual Chain RPC and executor availability and are treated as integration evidence, not as the deterministic source gate.

The workflow template under `.github/workflows/ci.yml` mirrors these commands and can be enabled when hosted GitHub Actions are available. The current authoritative evidence is produced by the self-hosted verifier, without a paid CI service.

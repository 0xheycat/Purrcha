# Security Policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue for wallet, encryption, contract, API, or secret-handling vulnerabilities.

Include the affected commit, reproduction steps, impact, and any suggested mitigation. Reports will be reviewed as soon as possible, but no response-time guarantee is implied.

## Scope

Security reports are especially useful for:

- wallet transaction construction and chain switching
- ECIES key derivation, encryption, and local key handling
- contract calls, event decoding, and verification evidence
- server routes that read chain data or invoke agent workflows
- accidental credential or private-data exposure

Ritual Chain executor outages or third-party service availability should be reported as normal operational issues unless they expose data or permit unauthorized actions.
